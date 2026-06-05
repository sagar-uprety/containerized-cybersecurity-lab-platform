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


def _require_file(base_dir: Path, relative_path: str, errors: list[str]) -> None:
    path = base_dir / relative_path
    if not path.is_file():
        errors.append(f"missing referenced file: {path}")


def validate_scenario(schema: dict[str, Any], scenario_path: Path) -> list[str]:
    errors: list[str] = []
    scenario_dir = scenario_path.parent

    try:
        scenario = _load_yaml(scenario_path)
        jsonschema.validate(instance=scenario, schema=schema)
    except (OSError, ValueError, jsonschema.ValidationError) as exc:
        return [f"{scenario_path}: {exc}"]

    _require_file(scenario_dir, "podman.yml.tpl", errors)

    checker = scenario.get("checker", {})
    checker_command = checker.get("command")
    if isinstance(checker_command, str):
        _require_file(scenario_dir, checker_command, errors)

    for image in scenario.get("build", {}).get("images", []):
        dockerfile = image.get("dockerfile")
        if isinstance(dockerfile, str):
            _require_file(scenario_dir, dockerfile, errors)

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
