"""Validate lab scenario contracts and referenced repository artifacts."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise TypeError(f"{path} must contain a YAML mapping")
    return data


def validate_scenario(schema: dict[str, Any], scenario_path: Path) -> list[str]:
    errors: list[str] = []
    scenario_dir = scenario_path.parent

    try:
        scenario = _load_yaml(scenario_path)
        jsonschema.validate(instance=scenario, schema=schema)
    except (OSError, ValueError, jsonschema.ValidationError) as exc:
        return [f"{scenario_path}: {exc}"]

    if not (scenario_dir / "podman.yml.tpl").is_file():
        errors.append(f"missing podman.yml.tpl in {scenario_dir}")

    services = scenario.get("services", {})
    for check_def in scenario.get("checker", {}).get("checks", []):
        exec_in = check_def.get("exec_in")
        if exec_in and exec_in not in services:
            errors.append(f"{scenario_path}: checker.exec_in={exec_in!r} not in scenario.services")

    for image in scenario.get("build", {}).get("images", []):
        dockerfile = image.get("dockerfile")
        if isinstance(dockerfile, str):
            path = scenario_dir / dockerfile
            if not path.is_file():
                errors.append(f"missing dockerfile: {path}")

    return errors


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    schema_path = repo_root / "labs" / "scenario.schema.json"

    try:
        with schema_path.open("r", encoding="utf-8") as handle:
            schema = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"failed to load {schema_path}: {exc}", file=sys.stderr)
        return 1

    errors: list[str] = []
    for scenario_path in sorted((repo_root / "labs").glob("*/scenario.yaml")):
        errors.extend(validate_scenario(schema, scenario_path))

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
