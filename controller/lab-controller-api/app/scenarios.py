import re
from pathlib import Path
from typing import Optional

import yaml
from fastapi import HTTPException

from app.auth import get_student_users
from app.config import settings


LAB_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def validate_lab_id(lab_id: str) -> None:
    if not LAB_ID_PATTERN.fullmatch(lab_id):
        raise HTTPException(status_code=404, detail="Lab not found")


def user_student_id(user: dict) -> str:
    return user.get("student_id") or user["username"]


def student_number(student_id: str, user: Optional[dict] = None) -> int:
    if user and user.get("number") is not None:
        return int(user["number"])
    match = re.fullmatch(r"student([0-9]{2,4})", student_id)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid student identity")
    return int(match.group(1))


def load_scenario_metadata(lab_id: str):
    validate_lab_id(lab_id)
    path = Path(settings.LABS_DIR) / lab_id / "scenario.yaml"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        scenario = yaml.safe_load(handle) or {}
    if scenario.get("id") != lab_id:
        raise HTTPException(status_code=500, detail="Scenario metadata id mismatch")
    return scenario


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
    return {
        "terminal": int(access.get("browser_terminal_port_base", 19000)) + number,
        "ssh": int(access.get("ssh_port_base", 22000)) + number,
        "app": int(access.get("app_port_base", 18000)) + number,
    }


def student_guide_url(scenario: dict) -> str:
    documentation = scenario.get("documentation", {})
    return documentation.get("student_guide_url") or f"/docs/labs/{scenario['id']}/"


def terminal_owner_for_port(terminal_port: int):
    for student in get_student_users().values():
        for scenario in list_scenarios():
            expected = endpoint_ports(scenario, student["student_id"], student)["terminal"]
            if expected == terminal_port:
                return student
    return None
