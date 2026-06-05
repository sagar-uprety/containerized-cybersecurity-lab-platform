"""Validate per-lab intentional-risk allowlists.

These allowlists document teaching-purpose vulnerabilities without broadly
excluding lab code from quality checks.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import yaml

ALLOWED_TOOLS = {
    "bandit",
    "gitleaks",
    "hadolint",
    "ruff",
    "shellcheck",
    "trivy",
    "dockle",
    "semgrep",
}
FAKE_MARKERS = (
    "demo",
    "dummy",
    "example",
    "fake",
    "placeholder",
    "change-me",
    "not-a-real-secret",
    "poc",
    "test",
    "lab",
)
EMPTY_SECRET_RE = re.compile(r"[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)\s*=")
LAB_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise TypeError(f"{path} must contain a YAML mapping")
    return data


def _safe_relative_path(value: str) -> bool:
    path = Path(value)
    return not path.is_absolute() and ".." not in path.parts


def _pattern_is_obviously_fake(pattern: str, reason: str) -> bool:
    lowered = pattern.lower()
    if any(marker in lowered for marker in FAKE_MARKERS):
        return True
    return bool(
        EMPTY_SECRET_RE.fullmatch(pattern.strip())
        and ("empty" in reason.lower() or "no authentication" in reason.lower())
    )


def validate_allowlist(path: Path) -> list[str]:
    errors: list[str] = []
    lab_dir = path.parent
    scenario_path = lab_dir / "scenario.yaml"

    try:
        data = _load_yaml(path)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        return [f"{path}: {exc}"]

    try:
        scenario = _load_yaml(scenario_path)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        return [f"{path}: failed to load matching scenario.yaml: {exc}"]

    lab_id = data.get("lab_id")
    scenario_id = scenario.get("id")
    if not isinstance(lab_id, str) or not LAB_ID_RE.fullmatch(lab_id):
        errors.append(f"{path}: lab_id must match {LAB_ID_RE.pattern}")
    elif lab_id != lab_dir.name:
        errors.append(f"{path}: lab_id {lab_id!r} must match directory name {lab_dir.name!r}")
    if lab_id != scenario_id:
        errors.append(f"{path}: lab_id {lab_id!r} must match scenario id {scenario_id!r}")

    findings = data.get("intentional_findings")
    if not isinstance(findings, list) or not findings:
        errors.append(f"{path}: intentional_findings must be a non-empty list")
        return errors

    seen_ids: set[str] = set()
    for index, finding in enumerate(findings, start=1):
        prefix = f"{path}: intentional_findings[{index}]"
        if not isinstance(finding, dict):
            errors.append(f"{prefix} must be a mapping")
            continue

        finding_id = finding.get("id")
        if not isinstance(finding_id, str) or not LAB_ID_RE.fullmatch(finding_id):
            errors.append(f"{prefix}.id must be a stable slug matching {LAB_ID_RE.pattern}")
        elif finding_id in seen_ids:
            errors.append(f"{prefix}.id {finding_id!r} is duplicated")
        else:
            seen_ids.add(finding_id)

        tool = finding.get("tool")
        if not isinstance(tool, str) or tool not in ALLOWED_TOOLS:
            errors.append(f"{prefix}.tool must be one of {sorted(ALLOWED_TOOLS)}")

        reason = finding.get("reason")
        if not isinstance(reason, str) or len(reason.strip()) < 20:
            errors.append(f"{prefix}.reason must explain the teaching purpose in at least 20 chars")
            reason = ""

        files = finding.get("files")
        if not isinstance(files, list) or not files:
            errors.append(f"{prefix}.files must be a non-empty list")
            files = []

        file_paths: list[Path] = []
        for file_value in files:
            if not isinstance(file_value, str) or not _safe_relative_path(file_value):
                errors.append(f"{prefix}.files contains unsafe path {file_value!r}")
                continue
            file_path = lab_dir / file_value
            if not file_path.is_file():
                errors.append(f"{prefix}.files references missing file {file_path}")
            else:
                file_paths.append(file_path)

        rules = finding.get("rules", [])
        if rules is not None and (
            not isinstance(rules, list) or not all(isinstance(rule, str) for rule in rules)
        ):
            errors.append(f"{prefix}.rules must be a list of strings when present")

        patterns = finding.get("patterns", [])
        if patterns is not None and (
            not isinstance(patterns, list)
            or not all(isinstance(pattern, str) for pattern in patterns)
        ):
            errors.append(f"{prefix}.patterns must be a list of strings when present")
            patterns = []

        if not rules and not patterns:
            errors.append(f"{prefix} must declare at least one rule or pattern")

        combined_text = ""
        for file_path in file_paths:
            try:
                combined_text += file_path.read_text(encoding="utf-8", errors="ignore")
            except OSError as exc:
                errors.append(f"{prefix}: failed to read {file_path}: {exc}")

        for pattern in patterns:
            if tool == "gitleaks" and not _pattern_is_obviously_fake(pattern, reason):
                errors.append(
                    f"{prefix}.patterns value {pattern!r} must look fake/demo "
                    "or be an explained empty secret"
                )
            if combined_text and pattern not in combined_text:
                errors.append(
                    f"{prefix}.patterns value {pattern!r} was not found in referenced files"
                )

    return errors


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    paths = sorted((repo_root / "labs").glob("*/intentional-risk-allowlist.yaml"))
    errors: list[str] = []
    for path in paths:
        errors.extend(validate_allowlist(path))

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
