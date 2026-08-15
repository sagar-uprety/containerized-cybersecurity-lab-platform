import json
import re
from functools import cache, lru_cache
from pathlib import Path
from typing import Optional

import yaml
from fastapi import HTTPException
from jsonschema import ValidationError, validate

from app.auth import get_student_users
from app.config import settings

LAB_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def validate_lab_id(lab_id: str) -> None:
    if not LAB_ID_PATTERN.fullmatch(lab_id):
        raise HTTPException(status_code=404, detail="Lab not found")


def is_sample_lab(lab_id: str) -> bool:
    """Sample labs (sample-*) are onboarding/demo scenarios, not course material."""
    return lab_id.startswith("sample-")


def user_student_id(user: dict) -> str:
    return user.get("student_id") or user["username"]


def student_number(student_id: str, user: Optional[dict] = None) -> int:
    if user and user.get("number") is not None:
        return int(user["number"])
    match = re.fullmatch(r"student([0-9]{2,4})", student_id)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid student identity")
    return int(match.group(1))


@cache
def load_scenario_metadata(lab_id: str):
    validate_lab_id(lab_id)
    labs_root = Path(settings.LABS_DIR)
    path = labs_root / lab_id / "scenario.yaml"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        scenario = yaml.safe_load(handle) or {}
    schema_path = labs_root / "templates-contract" / "scenario.schema.json"
    if not schema_path.exists():
        raise HTTPException(status_code=500, detail="Scenario schema not found")
    try:
        validate(instance=scenario, schema=json.loads(schema_path.read_text(encoding="utf-8")))
    except ValidationError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Scenario metadata validation failed: {exc.message}",
        ) from exc
    if scenario.get("id") != lab_id:
        raise HTTPException(status_code=500, detail="Scenario metadata id mismatch")
    return scenario


@lru_cache(maxsize=1)
def list_scenarios():
    labs = []
    root = Path(settings.LABS_DIR)
    if not root.exists():
        return labs
    for scenario_path in sorted(root.glob("*/scenario.yaml")):
        lab_id = scenario_path.parent.name
        if not LAB_ID_PATTERN.fullmatch(lab_id):
            continue
        scenario = load_scenario_metadata(lab_id)
        if scenario:
            labs.append(scenario)
    return labs


def endpoint_ports(scenario: dict, student_id: str, user: Optional[dict] = None) -> dict:
    number = student_number(student_id, user)
    access = scenario.get("access", {})
    browser_terminal = int(access["browser_terminal_port_base"]) + number
    ports = {
        "browser_terminal": browser_terminal,
        "terminal": browser_terminal,
        "ssh": int(access["ssh_port_base"]) + number,
    }
    if access.get("app_port_base") is not None:
        ports["app"] = int(access["app_port_base"]) + number
    return ports


def student_guide_url(scenario: dict) -> str:
    documentation = scenario.get("documentation", {})
    return documentation.get("student_guide_url") or f"/docs/labs/{scenario['id']}/"


def solution_notes_url(scenario: dict) -> str:
    documentation = scenario.get("documentation", {})
    return documentation.get("solution_notes_url") or f"/docs/labs/{scenario['id']}-solution/"


def instructor_guide_url(scenario: dict) -> str:
    documentation = scenario.get("documentation", {})
    return documentation.get("instructor_guide_url") or f"/docs/labs/{scenario['id']}-instructor/"


def terminal_owner_for_port(terminal_port: int):
    for student in get_student_users().values():
        for scenario in list_scenarios():
            expected = endpoint_ports(scenario, student["student_id"], student)["terminal"]
            if expected == terminal_port:
                return student
    return None
