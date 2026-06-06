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


def checker_image(scenario: dict, images: dict) -> str:
    checker = scenario.get("checker", {})
    if checker.get("image"):
        return checker["image"]

    image_service = checker.get("image_service")
    if image_service:
        image = images.get(image_service) or images.get(normalize_key(image_service))
        if image:
            return image
        raise ScenarioError(
            f"Checker image_service {image_service!r} has no matching service image"
        )

    raise ScenarioError("checker.image_service or checker.image is required")


def checker_command(scenario: dict) -> str:
    command = scenario.get("checker", {}).get("command")
    if not command:
        raise ScenarioError("checker.command is required")
    if Path(command).is_absolute() or ".." in Path(command).parts:
        raise ScenarioError("checker.command must be a relative path inside the lab package")
    return command
