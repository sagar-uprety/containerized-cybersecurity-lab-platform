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
FORBIDDEN_HOST_MOUNT_FRAGMENTS = (
    "docker.sock",
    "podman.sock",
    "/run/podman",
    "/var/run/podman",
)
CONDITION_OPERATORS = {"output_contains", "output_eq", "output_ne", "exit_code", "exit_code_ne"}
LAB_SOURCE_PREFIX = "$platform.lab_source_root/$platform.lab_id/"

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

    services = scenario.get("services", {})
    resources = scenario.get("resources", {})
    lab_id = scenario_dir.name

    if scenario.get("id") != lab_id:
        errors.append(
            f"{scenario_path}: scenario id {scenario.get('id')!r} must match directory {lab_id!r}"
        )

    # Portal reveal boundary (tier 1): title and story.situation render on the
    # student's lab card BEFORE they start, so neither may name the defect, the
    # technique, or the fix. Consequence/anomaly words ("exposed", "unexpected")
    # are allowed; mechanism/technique/fix vocabulary is not.
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

    expected_docs = {
        "student_guide_url": f"/docs/labs/{lab_id}/",
        "solution_notes_url": f"/docs/labs/{lab_id}-solution/",
        "instructor_guide_url": f"/docs/labs/{lab_id}-instructor/",
    }
    for key, expected in expected_docs.items():
        actual = scenario.get("documentation", {}).get(key)
        if actual != expected:
            errors.append(f"{scenario_path}: documentation.{key} must be {expected!r}")

    service_names = set(services)
    resource_names = set(resources)
    if "workstation" not in service_names:
        errors.append(f"{scenario_path}: services must declare workstation")
    if service_names != resource_names:
        missing = sorted(service_names - resource_names)
        extra = sorted(resource_names - service_names)
        if missing:
            errors.append(f"{scenario_path}: resources missing services {missing}")
        if extra:
            errors.append(f"{scenario_path}: resources has unknown services {extra}")

    network_names = [network.get("name") for network in scenario.get("networks", [])]
    if len(network_names) != len(set(network_names)):
        errors.append(f"{scenario_path}: networks[].name values must be unique")
    if scenario.get("networks", []) and scenario["networks"][0].get("internal"):
        errors.append(
            f"{scenario_path}: first network must not be internal because workstation "
            "publishes browser-terminal and SSH ports"
        )

    # Every container must reference a service that exists in services:
    # "workstation" is always valid — it is auto-generated by labctl.
    hostnames = [cdef.get("hostname") for cdef in scenario.get("containers", [])]
    if len(hostnames) != len(set(hostnames)):
        errors.append(f"{scenario_path}: containers[].hostname values must be unique")
    container_hostnames: set[str] = {"workstation", *hostnames}
    container_services: set[str] = set()
    for i, cdef in enumerate(scenario.get("containers", [])):
        svc = cdef.get("service", "")
        if svc and svc not in services:
            errors.append(
                f"{scenario_path}: containers[{i}].service={svc!r} not in scenario.services"
            )
        if svc == "workstation":
            errors.append(
                f"{scenario_path}: containers[{i}] must not declare auto-generated workstation"
            )
        if svc in container_services:
            errors.append(
                f"{scenario_path}: containers[{i}].service={svc!r} is reused; "
                "declare a unique service key per container instance"
            )
        container_services.add(svc)
        if svc and svc not in resources:
            errors.append(
                f"{scenario_path}: resources missing entry for containers[{i}].service={svc!r}"
            )
        security = cdef.get("security", {})
        if security.get("privileged"):
            errors.append(f"{scenario_path}: containers[{i}] must not set security.privileged=true")
        if security.get("host_network"):
            errors.append(
                f"{scenario_path}: containers[{i}] must not set security.host_network=true"
            )
        if "ALL" in security.get("cap_add", []):
            errors.append(f"{scenario_path}: containers[{i}] must not set security.cap_add=[ALL]")
        for volume in cdef.get("volumes", []):
            host_path = str(volume.get("host_path", ""))
            if any(fragment in host_path for fragment in FORBIDDEN_HOST_MOUNT_FRAGMENTS):
                errors.append(
                    f"{scenario_path}: containers[{i}].volumes must not mount "
                    f"host runtime socket path {host_path!r}"
                )
            if host_path and (
                not host_path.startswith(LAB_SOURCE_PREFIX)
                or ".." in Path(host_path).parts
                or volume.get("read_only") is not True
            ):
                errors.append(
                    f"{scenario_path}: containers[{i}].volumes host_path must stay under "
                    f"{LAB_SOURCE_PREFIX!r} and set read_only=true"
                )
        if network_names and not cdef.get("networks"):
            errors.append(
                f"{scenario_path}: containers[{i}] must declare networks when top-level "
                "networks are present"
            )
        errors.extend(
            f"{scenario_path}: containers[{i}].networks references unknown {network!r}"
            for network in cdef.get("networks", [])
            if network not in network_names
        )
        errors.extend(
            f"{scenario_path}: containers[{i}].depends_on references unknown "
            f"hostname {dependency!r}"
            for dependency in cdef.get("depends_on", [])
            if dependency not in container_hostnames
        )

    if "workstation" not in resources:
        errors.append(f"{scenario_path}: resources missing entry for workstation")

    # workstation.depends_on must reference existing container hostnames
    ws_cfg = scenario.get("workstation", {})
    ws_errors = [
        f"{scenario_path}: workstation.depends_on={dep!r} does not match any containers[].hostname"
        for dep in ws_cfg.get("depends_on", [])
        if dep not in container_hostnames
    ]
    errors.extend(ws_errors)

    # checker exec_in must match a container hostname and state conditions must
    # use operators implemented by labctl_core.scenario.evaluate_condition.
    check_defs = scenario.get("checker", {}).get("checks", [])
    check_names = [check_def.get("name") for check_def in check_defs]
    if len(check_names) != len(set(check_names)):
        errors.append(f"{scenario_path}: checker.checks[].name values must be unique")
    if not any(check_def.get("kind") == "objective" for check_def in check_defs):
        errors.append(f"{scenario_path}: checker must contain at least one objective check")
    for check_def in check_defs:
        exec_in = check_def.get("exec_in")
        if exec_in and exec_in not in container_hostnames:
            errors.append(
                f"{scenario_path}: checker.exec_in={exec_in!r} "
                f"does not match any containers[].hostname"
            )
        states = check_def.get("states", {})
        if check_def.get("kind") == "objective" and states.get("vulnerable") == states.get("fixed"):
            errors.append(
                f"{scenario_path}: objective check {check_def.get('name')!r} must use "
                "different vulnerable and fixed conditions"
            )
        for state, condition in states.items():
            operator, separator, value = condition.partition(":")
            if not separator or operator.strip() not in CONDITION_OPERATORS or not value.strip():
                errors.append(
                    f"{scenario_path}: check {check_def.get('name')!r} state {state!r} "
                    f"has unsupported condition {condition!r}"
                )
                continue
            if operator.strip() in {"exit_code", "exit_code_ne"}:
                try:
                    int(value.strip())
                except ValueError:
                    errors.append(
                        f"{scenario_path}: check {check_def.get('name')!r} state {state!r} "
                        "must use an integer exit code"
                    )

    for image in scenario.get("build", {}).get("images", []):
        service = image.get("service")
        if service not in services:
            errors.append(f"{scenario_path}: build image references unknown service {service!r}")
        elif image.get("name") != services[service].get("image"):
            errors.append(
                f"{scenario_path}: build image {image.get('name')!r} must match "
                f"services.{service}.image"
            )
        context = Path(str(image.get("context", "")))
        if context.is_absolute() or ".." in context.parts:
            errors.append(f"{scenario_path}: build context must stay inside lab directory")
            continue
        dockerfile = image.get("dockerfile")
        if isinstance(dockerfile, str):
            dockerfile_path = Path(dockerfile)
            if dockerfile_path.is_absolute() or ".." in dockerfile_path.parts:
                errors.append(f"{scenario_path}: dockerfile path must stay inside build context")
                continue
            path = scenario_dir / context / dockerfile_path
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

    solution_notes = docs_dir / "solution-notes.md"
    if not solution_notes.is_file():
        errors.append(f"missing lab docs: {solution_notes}")

    # SITREP.txt was retired: the student guide's "Your Lab Environment" and
    # "Your Mission" sections now carry the mission brief, paths, and access
    # facts always-visibly. A lingering SITREP.txt would leak the old
    # over-specified mission list, so its presence is an error.
    stale_sitrep = docs_dir / "SITREP.txt"
    if stale_sitrep.is_file():
        errors.append(
            f"{stale_sitrep}: SITREP.txt is retired; move its content into the "
            f"student guide's 'Your Lab Environment' and 'Your Mission' sections"
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

        # Solution notes are one student-executable runbook. Custom verifier
        verifier_blocks = _extract_verifier_bash_blocks(sn_content)
        if verifier_blocks:
            errors.append(
                f"{solution_notes}: must use ordinary ```bash fences, not verifier fences"
            )

        solution_bash = _extract_bash_blocks(sn_content)
        if not solution_bash:
            errors.append(f"{solution_notes}: must contain student-executable bash blocks")

        # Exact remediation blocks must not be copied into the discovery guide.
        # Diagnostic bash IS allowed in the student guide (generic command shapes
        # with placeholders); solution-revealing remediation bash is not. The
        # verb list below covers the config-mutating commands the labs actually
        # use, and comparison is whitespace-normalized so a reformatted copy of a
        # solution block cannot slip through a verbatim check.
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
