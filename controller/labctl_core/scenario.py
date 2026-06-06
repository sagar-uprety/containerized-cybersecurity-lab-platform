import json
import re
from pathlib import Path

import yaml
from jsonschema import ValidationError, validate

from labctl_core.config import RuntimePaths


class ScenarioError(Exception):
    pass


def normalize_key(value: str) -> str:
    return value.replace("-", "_")


def student_number_from_id(student_id: str) -> int:
    match = re.fullmatch(r"student([0-9]{2,4})", student_id)
    if not match:
        raise ScenarioError(f"Invalid student_id format: {student_id}")
    return int(match.group(1))


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def load_student_record(paths: RuntimePaths, student_id: str) -> dict:
    if not paths.student_credentials.exists():
        raise ScenarioError(f"Student credential registry not found: {paths.student_credentials}")

    data = load_yaml(paths.student_credentials)
    for student in data.get("students", []):
        if student.get("id") == student_id:
            return student
    raise ScenarioError(f"Student credential record not found for {student_id}")


def load_scenario(paths: RuntimePaths, lab_id: str) -> dict:
    scenario_path = paths.labs_dir / lab_id / "scenario.yaml"
    if not scenario_path.exists():
        raise ScenarioError(f"Lab {lab_id} not found at {scenario_path}")

    scenario = load_yaml(scenario_path)
    schema_path = paths.labs_dir / "scenario.schema.json"
    if not schema_path.exists():
        raise ScenarioError(f"Scenario schema not found at {schema_path}")

    try:
        validate(instance=scenario, schema=json.loads(schema_path.read_text(encoding="utf-8")))
    except ValidationError as exc:
        raise ScenarioError(f"Validation failed for {lab_id}/scenario.yaml: {exc.message}") from exc

    if scenario.get("id") != lab_id:
        raise ScenarioError(f"Scenario id mismatch: expected {lab_id}, got {scenario.get('id')}")
    return scenario


def endpoint_ports(scenario: dict, student_number: int) -> dict:
    access = scenario.get("access", {})
    ports = {
        "ssh": int(access["ssh_port_base"]) + student_number,
        "browser_terminal": int(access["browser_terminal_port_base"]) + student_number,
    }
    if access.get("app_port_base") is not None:
        ports["app"] = int(access["app_port_base"]) + student_number
    return ports


def service_images(scenario: dict) -> dict:
    images = {}
    for service_name, service in scenario.get("services", {}).items():
        image = service.get("image")
        if image:
            images[service_name] = image
            images[normalize_key(service_name)] = image
    return images


def evaluate_condition(condition: str, exit_code: int, stdout: str, stderr: str) -> bool:
    parts = condition.split(":", 1)
    if len(parts) != 2:
        raise ScenarioError(f"Invalid condition format: {condition!r}")
    op, value = parts[0].strip(), parts[1].strip()

    combined = stdout + stderr

    if op == "output_contains":
        return value in combined
    if op == "output_eq":
        return stdout.strip() == value
    if op == "output_ne":
        return stdout.strip() != value
    if op == "exit_code":
        return exit_code == int(value)
    if op == "exit_code_ne":
        return exit_code != int(value)
    raise ScenarioError(f"Unknown condition operator: {op!r}")


def build_container_map(manifest: dict) -> dict:
    container_map = {}
    for container in manifest.get("containers", []):
        hostname = container.get("hostname")
        if hostname:
            container_map[hostname] = container.get("name")
    return container_map
