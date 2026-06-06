"""Validate lab scenario contracts and referenced repository artifacts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml

SECTION_RE = re.compile(r"^(#{2,4})\s+(.+)$", re.MULTILINE)


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise TypeError(f"{path} must contain a YAML mapping")
    return data


def _extract_headings(path: Path) -> list[str]:
    """Extract all level-2 markdown headings from a file."""
    content = path.read_text(encoding="utf-8")
    return [
        f"{m.group(1)} {m.group(2).strip()}"
        for m in SECTION_RE.finditer(content)
        if len(m.group(1)) == 2
    ]


def _check_sections(guide_path: Path, template_sections: list[str], label: str) -> list[str]:
    guide_sections = _extract_headings(guide_path)
    guide_set, template_set = set(guide_sections), set(template_sections)

    errors: list[str] = [
        f"{guide_path}: missing {label} section {section!r}" for section in template_set - guide_set
    ]
    errors.extend(
        f"{guide_path}: unexpected {label} section {section!r} (not in template)"
        for section in sorted(guide_set - template_set)
    )
    return errors


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


def validate_lab_docs(
    scenario_path: Path,
    repo_root: Path,
    student_guide_sections: list[str],
    instructor_guide_sections: list[str],
) -> list[str]:
    errors: list[str] = []
    lab_id = scenario_path.parent.name
    docs_dir = scenario_path.parent / "docs"

    student_guide = docs_dir / "student-guide.md"
    if not student_guide.is_file():
        errors.append(f"missing lab docs: {student_guide}")
    else:
        errors.extend(_check_sections(student_guide, student_guide_sections, "student-guide"))

    instructor_guide = docs_dir / "instructor-guide.md"
    if not instructor_guide.is_file():
        errors.append(f"missing lab docs: {instructor_guide}")
    else:
        errors.extend(
            _check_sections(instructor_guide, instructor_guide_sections, "instructor-guide")
        )

    mkdocs_include = repo_root / "docs" / "labs" / f"{lab_id}.md"
    if not mkdocs_include.is_file():
        errors.append(f"missing MkDocs include: {mkdocs_include}")
    else:
        content = mkdocs_include.read_text(encoding="utf-8")
        if "--8<--" not in content:
            errors.append(
                f"{mkdocs_include}: must use --8<-- snippet syntax to include "
                f"../../labs/{lab_id}/docs/student-guide.md"
            )

    return errors


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    labs_dir = repo_root / "labs"

    schema_path = labs_dir / "templates-contract" / "scenario.schema.json"
    try:
        with schema_path.open("r", encoding="utf-8") as handle:
            schema = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"failed to load {schema_path}: {exc}", file=sys.stderr)
        return 1

    student_template_path = labs_dir / "templates-contract" / "STUDENT_GUIDE_TEMPLATE.md"
    instructor_template_path = labs_dir / "templates-contract" / "INSTRUCTOR_GUIDE_TEMPLATE.md"

    if not student_template_path.is_file():
        print(f"missing student guide template: {student_template_path}", file=sys.stderr)
        return 1
    if not instructor_template_path.is_file():
        print(f"missing instructor guide template: {instructor_template_path}", file=sys.stderr)
        return 1

    student_guide_sections = _extract_headings(student_template_path)
    instructor_guide_sections = _extract_headings(instructor_template_path)

    errors: list[str] = []
    for scenario_path in sorted(labs_dir.glob("*/scenario.yaml")):
        errors.extend(validate_scenario(schema, scenario_path))
        errors.extend(
            validate_lab_docs(
                scenario_path,
                repo_root,
                student_guide_sections,
                instructor_guide_sections,
            )
        )

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
