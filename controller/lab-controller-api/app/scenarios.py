import json
import re
from functools import cache, lru_cache
from pathlib import Path
from typing import Optional

import yaml
from fastapi import HTTPException
from jsonschema import ValidationError, validate

from app.config import settings
from app.runtime_state import runtime_state_for

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


_DESCRIPTION_SUSPICIOUS_PREFIXES = (
    "```",
    "![",
    ">",
    "|",
    "- ",
    "* ",
    "+ ",
    "<!--",
    "<",
    "1. ",
)


def _clean_markdown_inline(text: str) -> str:
    """Strip common inline markdown (emphasis, inline code, links) so the
    extracted paragraph reads as plain prose on a catalogue card instead of
    carrying literal asterisks/backticks through."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    return re.sub(r"\[(.+?)\]\([^)]+\)", r"\1", text)


def _extract_first_paragraph(markdown: str) -> Optional[str]:
    """Pull the first prose paragraph out of a student guide: the text between
    the `# H1` title and the next blank line/heading. Wrapped lines are joined
    with spaces. Returns None rather than a mangled string when the guide
    doesn't match the expected shape (no H1 on the first line, nothing after
    it, or the first block is itself structural -- a code fence, image,
    blockquote/admonition, list, or HTML comment) so callers can fall back
    cleanly instead of showing garbage on a card."""
    lines = markdown.splitlines()
    if not lines or not lines[0].startswith("# "):
        return None
    i = 1
    while i < len(lines) and lines[i].strip() == "":
        i += 1
    para_lines = []
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped == "" or stripped.startswith("#"):
            break
        para_lines.append(stripped)
        i += 1
    if not para_lines:
        return None
    paragraph = " ".join(para_lines)
    if paragraph.startswith(_DESCRIPTION_SUSPICIOUS_PREFIXES):
        return None
    return _clean_markdown_inline(paragraph)


@cache
def load_lab_description(lab_id: str) -> Optional[str]:
    """Short instructor-catalogue description for a lab, sourced from the
    student guide's opening paragraph rather than scenario.yaml -- the guide
    is the copy that's actually kept current, and a second copy in YAML would
    drift out of sync with it. Cached per lab_id for the life of the process
    (mirrors load_scenario_metadata below): the catalogue lists every lab on
    each request, so this must not re-read and re-parse markdown in a loop.
    """
    validate_lab_id(lab_id)
    path = Path(settings.LABS_DIR) / lab_id / "docs" / "student-guide.md"
    if not path.exists():
        return None
    return _extract_first_paragraph(path.read_text(encoding="utf-8"))


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


def endpoint_owner_for_port(port: int, student: dict, kind: str = "terminal"):
    """Return student only when port belongs to their running lab lease.

    ``kind`` names the endpoint ("terminal" or "app"). Port bases can overlap
    across scenarios and student-number ranges. Scanning every account can
    therefore resolve a valid port to an inactive student.
    """
    if student.get("role") != "student":
        return None
    student_id = student["student_id"]
    for scenario in list_scenarios():
        expected = endpoint_ports(scenario, student_id, student).get(kind)
        if expected != port:
            continue
        if runtime_state_for(scenario["id"], student_id).get("status") == "running":
            return student
    return None


def terminal_owner_for_port(terminal_port: int, student: dict):
    return endpoint_owner_for_port(terminal_port, student, "terminal")
