"""Validate lab scenario contracts and referenced repository artifacts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "controller"))

from labctl_core.scenario import contract_errors

SECTION_RE = re.compile(r"^(#{2,4})\s+(.+)$", re.MULTILINE)

# Per-lab student-guide.md heading aliases: {lab_id: {actual_heading: canonical_heading}}.
# Lets a lab intentionally rename a template section (e.g. the shortened
# survey-cohort beginner lab) without the validator flagging it as missing/unexpected.
STUDENT_GUIDE_SECTION_ALIASES: dict[str, dict[str, str]] = {
    "survey-nginx-hardening": {
        "## Prerequisites Knowledge": "## Prerequisites",
        "## Real-World Context (Optional Reading)": "## Real-World Context",
    },
}

# Anti-spoiler patterns
_BASH_BLOCK_RE = re.compile(r"```bash\n(.*?)\n```", re.DOTALL)
_BASH_VERIFIER_BLOCK_RE = re.compile(r"```bash\s+verifier\n(.*?)\n```", re.DOTALL)


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


def _check_sections(
    guide_path: Path,
    template_sections: list[str],
    label: str,
    heading_aliases: dict[str, str] | None = None,
) -> list[str]:
    guide_sections = _extract_headings(guide_path)
    if heading_aliases:
        guide_sections = [heading_aliases.get(h, h) for h in guide_sections]
    guide_set, template_set = set(guide_sections), set(template_sections)

    errors: list[str] = [
        f"{guide_path}: missing {label} section {section!r}" for section in template_set - guide_set
    ]
    errors.extend(
        f"{guide_path}: unexpected {label} section {section!r} (not in template)"
        for section in sorted(guide_set - template_set)
    )
    return errors


def _extract_bash_blocks(content: str) -> list[str]:
    """Extract regular ```bash blocks."""
    return [m.group(1).strip() for m in _BASH_BLOCK_RE.finditer(content)]


def _extract_verifier_bash_blocks(content: str) -> list[str]:
    """Extract ```bash verifier blocks."""
    return [m.group(1).strip() for m in _BASH_VERIFIER_BLOCK_RE.finditer(content)]


def _normalize_bash(block: str) -> str:
    """Collapse whitespace so a reformatted copy of a solution block still matches.

    Comparison for the anti-spoiler duplicate check must not be defeated by a
    stray extra space or a rewrapped line, so we normalize runs of whitespace to
    single spaces and strip the ends.
    """
    return re.sub(r"\s+", " ", block).strip()


def _extract_section(content: str, heading: str) -> str:
    """Extract content under a markdown heading (case-insensitive)."""
    pattern = re.compile(
        r"^(#{2,4})\s+.*?\b" + re.escape(heading) + r"\b\s*$",
        re.MULTILINE | re.IGNORECASE,
    )
    match = pattern.search(content)
    if not match:
        return ""
    start = match.end()
    level = len(match.group(1))
    section_lines = []
    in_fence = False
    for line in content[start:].splitlines(keepends=True):
        if line.startswith("```"):
            in_fence = not in_fence
            section_lines.append(line)
            continue
        if not in_fence and re.match(r"^#{1," + str(level) + r"}\s+", line):
            break
        section_lines.append(line)
    return "".join(section_lines)


def validate_scenario(schema: dict[str, Any], scenario_path: Path) -> list[str]:
    errors: list[str] = []
    scenario_dir = scenario_path.parent

    try:
        scenario = _load_yaml(scenario_path)
        jsonschema.validate(instance=scenario, schema=schema)
    except (OSError, ValueError, jsonschema.ValidationError) as exc:
        return [f"{scenario_path}: {exc}"]

    lab_id = scenario_dir.name

    # Titles and pre-start stories may describe symptoms, not mechanism or remediation.
    spoiler_terms = re.compile(
        r"\b("
        r"anonymous bind|open relay|open share|unauthenticated|no-?auth|"
        r"brute[- ]?force|source[- ]?port|bypass|misconfigur|weak (?:config|ssh|password)|"
        r"default (?:password|creds?|credential)|requirepass|permitrootlogin|"
        r"cve-\d|olcaccess|mynetworks|conntrack|nosql"
        r")\b",
        re.IGNORECASE,
    )
    title = str(scenario.get("title", ""))
    situation = str(scenario.get("story", {}).get("situation", ""))
    for field, text in (("title", title), ("story.situation", situation)):
        hit = spoiler_terms.search(text)
        if hit:
            errors.append(
                f"{scenario_path}: {field} reveals the defect/technique "
                f"({hit.group(0)!r}); the portal card is shown before the student "
                f"starts. Keep it at anomaly level."
            )

    # Structural rules live in labctl_core.scenario so that labctl enforces the
    # same contract when a lab is loaded on the worker.
    errors.extend(
        f"{scenario_path}: {error}" for error in contract_errors(scenario, lab_id, scenario_dir)
    )

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
        errors.extend(
            _check_sections(
                student_guide,
                student_guide_sections,
                "student-guide",
                heading_aliases=STUDENT_GUIDE_SECTION_ALIASES.get(lab_id),
            )
        )

    instructor_guide = docs_dir / "instructor-guide.md"
    if not instructor_guide.is_file():
        errors.append(f"missing lab docs: {instructor_guide}")
    else:
        errors.extend(
            _check_sections(instructor_guide, instructor_guide_sections, "instructor-guide")
        )

    solution_notes = docs_dir / "solution-notes.md"
    if not solution_notes.is_file():
        errors.append(f"missing lab docs: {solution_notes}")

    # Reject SITREP.txt files that duplicate or overexpose guide content.
    stale_sitrep = docs_dir / "SITREP.txt"
    if stale_sitrep.is_file():
        errors.append(
            f"{stale_sitrep}: SITREP.txt is retired; move its content into the "
            f"student guide's 'Your Lab Environment' section"
        )

    mkdocs_includes = {
        repo_root / "docs" / "labs" / f"{lab_id}.md": f"labs/{lab_id}/docs/student-guide.md",
        repo_root / "docs" / "labs" / f"{lab_id}-solution.md": (
            f"labs/{lab_id}/docs/solution-notes.md"
        ),
        repo_root / "docs" / "labs" / f"{lab_id}-instructor.md": (
            f"labs/{lab_id}/docs/instructor-guide.md"
        ),
    }
    for mkdocs_include, source_path in mkdocs_includes.items():
        if not mkdocs_include.is_file():
            errors.append(f"missing MkDocs include: {mkdocs_include}")
            continue
        expected_include = f'--8<-- "{source_path}"'
        content = mkdocs_include.read_text(encoding="utf-8").strip()
        if content != expected_include:
            errors.append(f"{mkdocs_include}: must contain only {expected_include}")

    # ------------------------------------------------------------------
    # Anti-spoiler checks (requires both student-guide and solution-notes)
    # ------------------------------------------------------------------
    if student_guide.is_file() and solution_notes.is_file():
        sg_content = student_guide.read_text(encoding="utf-8")
        sn_content = solution_notes.read_text(encoding="utf-8")

        # Solution notes are one student-executable runbook. Checks replay
        # ordinary bash blocks by phase, so custom verifier fences are invalid.
        verifier_blocks = _extract_verifier_bash_blocks(sn_content)
        if verifier_blocks:
            errors.append(
                f"{solution_notes}: must use ordinary ```bash fences, not verifier fences"
            )

        solution_bash = _extract_bash_blocks(sn_content)
        if not solution_bash:
            errors.append(f"{solution_notes}: must contain student-executable bash blocks")

        # Survey labs may reveal commands to standardize the evaluated workflow.
        is_survey_lab = lab_id.startswith("survey-")

        # Reject normalized config-mutating solution commands copied into discovery guides.
        sg_bash = [_normalize_bash(b) for b in _extract_bash_blocks(sg_content)]
        remediation_commands = re.compile(
            r"(^|\n)\s*("
            r"sed|tee|ldapmodify|ldapadd|iptables|ip6tables|nft|firewall-cmd|"
            r"usermod|useradd|passwd|smbpasswd|chpasswd|systemctl|service|"
            r"postconf|postmap|a2enmod|a2dismod|htpasswd|rm|"
            r"printf|echo\b.*(>>|>)|cat\s+.*(>>|>)"
            r")\b"
        )
        for block in solution_bash:
            if is_survey_lab:
                break
            if not remediation_commands.search(block):
                continue
            if _normalize_bash(block) in sg_bash:
                errors.append(
                    f"{student_guide}: bash block duplicates remediation content from "
                    f"{solution_notes} (anti-spoiler violation)"
                )
                break

        # Official references in Remediate
        remediate_section = _extract_section(sg_content, "Remediate")
        if remediate_section:
            if not re.search(r"https?://|man\s+\w+", remediate_section):
                errors.append(
                    f"{student_guide}: Remediate section must contain an "
                    f"official documentation link or man reference"
                )
        else:
            errors.append(
                f"{student_guide}: missing Remediate section for official-reference check"
            )

        # Hint ladder in Remediate
        if remediate_section:
            if not re.search(r"[Hh]int|[Ii]f you're stuck", remediate_section):
                errors.append(f"{student_guide}: Remediate section must contain a hint ladder")
        else:
            errors.append(f"{student_guide}: missing Remediate section for hint-ladder check")

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

    scenario_template_path = labs_dir / "templates-contract" / "scenario.template.yaml"
    if scenario_template_path.is_file():
        try:
            scenario_template = _load_yaml(scenario_template_path)
            jsonschema.validate(instance=scenario_template, schema=schema)
        except (OSError, ValueError, jsonschema.ValidationError) as exc:
            print(f"{scenario_template_path}: {exc}", file=sys.stderr)
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
