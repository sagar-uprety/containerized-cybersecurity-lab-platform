from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import yaml
from jsonschema import ValidationError, validate

from labctl_core.config import RuntimePaths


class ScenarioError(Exception):
    pass


FORBIDDEN_HOST_MOUNT_FRAGMENTS = (
    "docker.sock",
    "podman.sock",
    "/run/podman",
    "/var/run/podman",
)
CONDITION_OPERATORS = {"output_contains", "output_eq", "output_ne", "exit_code", "exit_code_ne"}
LAB_SOURCE_PREFIX = "$platform.lab_source_root/$platform.lab_id/"


def read_injected_lab_password():
    """Return a lab password supplied by x02 for start/reset.

    The portal passes the password on the labctl process's stdin (forwarded
    through ssh -> restricted wrapper -> sudo). Env var LAB_STUDENT_PASSWORD is
    also honored as an alternate transport. Never read from argv, which the SSH
    wrapper logs and rejects. Returns None when nothing was injected; callers
    fail closed because x01 has no student credential registry.
    """
    env_pw = os.environ.get("LAB_STUDENT_PASSWORD")
    if env_pw and env_pw.strip():
        return env_pw.strip()
    # Only consume stdin when it is piped (ssh sets a non-tty stdin); a tty means
    # a human is running labctl directly, so do not block waiting for input.
    if sys.stdin is None or sys.stdin.isatty():
        return None
    line = sys.stdin.readline()
    return line.strip() or None


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


def load_scenario(paths: RuntimePaths, lab_id: str) -> dict:
    scenario_path = paths.labs_dir / lab_id / "scenario.yaml"
    if not scenario_path.exists():
        raise ScenarioError(f"Lab {lab_id} not found at {scenario_path}")

    scenario = load_yaml(scenario_path)
    schema_path = paths.labs_dir / "templates-contract" / "scenario.schema.json"
    if not schema_path.exists():
        raise ScenarioError(f"Scenario schema not found at {schema_path}")

    try:
        validate(instance=scenario, schema=json.loads(schema_path.read_text(encoding="utf-8")))
    except ValidationError as exc:
        raise ScenarioError(f"Validation failed for {lab_id}/scenario.yaml: {exc.message}") from exc

    errors = contract_errors(scenario, lab_id, scenario_path.parent)
    if errors:
        raise ScenarioError(f"Contract violations in {lab_id}/scenario.yaml: " + "; ".join(errors))
    return scenario


def _documentation_errors(scenario: dict, lab_id: str) -> list[str]:
    expected_docs = {
        "student_guide_url": f"/docs/labs/{lab_id}/",
        "solution_notes_url": f"/docs/labs/{lab_id}-solution/",
        "instructor_guide_url": f"/docs/labs/{lab_id}-instructor/",
    }
    return [
        f"documentation.{key} must be {expected!r}"
        for key, expected in expected_docs.items()
        if scenario.get("documentation", {}).get(key) != expected
    ]


def _resource_errors(services: dict, resources: dict) -> list[str]:
    errors: list[str] = []
    service_names = set(services)
    resource_names = set(resources)
    if "workstation" not in service_names:
        errors.append("services must declare workstation")
    missing = sorted(service_names - resource_names)
    extra = sorted(resource_names - service_names)
    if missing:
        errors.append(f"resources missing services {missing}")
    if extra:
        errors.append(f"resources has unknown services {extra}")
    for name in sorted(service_names & resource_names):
        limits = resources.get(name) or {}
        if not limits.get("cpus") or not limits.get("memory"):
            errors.append(f"resources.{name} must set both cpus and memory")
    return errors


def _container_errors(
    scenario: dict, services: dict, resources: dict, network_names: list
) -> tuple[list[str], set]:
    errors: list[str] = []
    hostnames = [cdef.get("hostname") for cdef in scenario.get("containers", [])]
    if len(hostnames) != len(set(hostnames)):
        errors.append("containers[].hostname values must be unique")
    # "workstation" is always valid: labctl generates it from the workstation block.
    container_hostnames = {"workstation", *hostnames}
    container_services: set = set()
    for i, cdef in enumerate(scenario.get("containers", [])):
        svc = cdef.get("service", "")
        if svc and svc not in services:
            errors.append(f"containers[{i}].service={svc!r} not in scenario.services")
        if svc == "workstation":
            errors.append(f"containers[{i}] must not declare auto-generated workstation")
        if svc in container_services:
            errors.append(
                f"containers[{i}].service={svc!r} is reused; "
                "declare a unique service key per container instance"
            )
        container_services.add(svc)
        if svc and svc not in resources:
            errors.append(f"resources missing entry for containers[{i}].service={svc!r}")
        errors.extend(security_errors(cdef.get("security", {}), f"containers[{i}]"))
        errors.extend(volume_errors(cdef.get("volumes", []), f"containers[{i}]"))
        if network_names and not cdef.get("networks"):
            errors.append(
                f"containers[{i}] must declare networks when top-level networks are present"
            )
        errors.extend(
            f"containers[{i}].networks references unknown {network!r}"
            for network in cdef.get("networks", [])
            if network not in network_names
        )
        errors.extend(
            f"containers[{i}].depends_on references unknown hostname {dependency!r}"
            for dependency in cdef.get("depends_on", [])
            if dependency not in container_hostnames
        )
    errors.extend(
        f"workstation.depends_on={dep!r} does not match any containers[].hostname"
        for dep in scenario.get("workstation", {}).get("depends_on", [])
        if dep not in container_hostnames
    )
    return errors, container_hostnames


def security_errors(security: dict, label: str) -> list[str]:
    """Refuse privileged mode, host networking, and all capabilities at once."""
    errors = []
    if security.get("privileged"):
        errors.append(f"{label} must not set security.privileged=true")
    if security.get("host_network"):
        errors.append(f"{label} must not set security.host_network=true")
    if "ALL" in security.get("cap_add", []):
        errors.append(f"{label} must not set security.cap_add=[ALL]")
    return errors


def volume_errors(volumes: list, label: str) -> list[str]:
    """Refuse host runtime sockets and bind mounts outside the lab source tree."""
    errors = []
    for volume in volumes:
        host_path = str(volume.get("host_path", ""))
        if any(fragment in host_path for fragment in FORBIDDEN_HOST_MOUNT_FRAGMENTS):
            errors.append(f"{label}.volumes must not mount host runtime socket path {host_path!r}")
        if host_path and (
            not host_path.startswith(LAB_SOURCE_PREFIX)
            or ".." in Path(host_path).parts
            or volume.get("read_only") is not True
        ):
            errors.append(
                f"{label}.volumes host_path must stay under "
                f"{LAB_SOURCE_PREFIX!r} and set read_only=true"
            )
    return errors


def _checker_errors(scenario: dict, container_hostnames: set) -> list[str]:
    errors: list[str] = []
    check_defs = scenario.get("checker", {}).get("checks", [])
    check_names = [check_def.get("name") for check_def in check_defs]
    if len(check_names) != len(set(check_names)):
        errors.append("checker.checks[].name values must be unique")
    if not any(check_def.get("kind") == "objective" for check_def in check_defs):
        errors.append("checker must contain at least one objective check")
    for check_def in check_defs:
        exec_in = check_def.get("exec_in")
        if exec_in and exec_in not in container_hostnames:
            errors.append(f"checker.exec_in={exec_in!r} does not match any containers[].hostname")
        states = check_def.get("states", {})
        if check_def.get("kind") == "objective" and states.get("vulnerable") == states.get("fixed"):
            errors.append(
                f"objective check {check_def.get('name')!r} must use "
                "different vulnerable and fixed conditions"
            )
        for state, condition in states.items():
            operator, separator, value = str(condition).partition(":")
            if not separator or operator.strip() not in CONDITION_OPERATORS or not value.strip():
                errors.append(
                    f"check {check_def.get('name')!r} state {state!r} "
                    f"has unsupported condition {condition!r}"
                )
                continue
            if operator.strip() in {"exit_code", "exit_code_ne"}:
                try:
                    int(value.strip())
                except ValueError:
                    errors.append(
                        f"check {check_def.get('name')!r} state {state!r} "
                        "must use an integer exit code"
                    )
    return errors


def _build_errors(scenario: dict, services: dict, lab_dir: Optional[Path]) -> list[str]:
    errors: list[str] = []
    for image in scenario.get("build", {}).get("images", []):
        service = image.get("service")
        if service not in services:
            errors.append(f"build image references unknown service {service!r}")
        elif image.get("name") != services[service].get("image"):
            errors.append(f"build image {image.get('name')!r} must match services.{service}.image")
        context = Path(str(image.get("context", "")))
        if context.is_absolute() or ".." in context.parts:
            errors.append("build context must stay inside lab directory")
            continue
        dockerfile = image.get("dockerfile")
        if isinstance(dockerfile, str):
            dockerfile_path = Path(dockerfile)
            if dockerfile_path.is_absolute() or ".." in dockerfile_path.parts:
                errors.append("dockerfile path must stay inside build context")
                continue
            if lab_dir is not None and not (lab_dir / context / dockerfile_path).is_file():
                errors.append(f"missing dockerfile: {lab_dir / context / dockerfile_path}")
    return errors


def contract_errors(scenario: dict, lab_id: str, lab_dir: Optional[Path] = None) -> list[str]:
    """Return the scenario rules that a JSON Schema cannot express.

    The same rules run when labctl loads a lab, when the lab-runtime playbook
    validates the installed labs, and in the repository pre-commit hook.
    """
    services = scenario.get("services", {})
    resources = scenario.get("resources", {})
    errors: list[str] = []

    if scenario.get("id") != lab_id:
        errors.append(f"scenario id {scenario.get('id')!r} must match directory {lab_id!r}")
    errors.extend(_documentation_errors(scenario, lab_id))
    errors.extend(_resource_errors(services, resources))

    network_names = [network.get("name") for network in scenario.get("networks", [])]
    if len(network_names) != len(set(network_names)):
        errors.append("networks[].name values must be unique")
    if scenario.get("networks", []) and scenario["networks"][0].get("internal"):
        errors.append(
            "first network must not be internal because workstation "
            "publishes browser-terminal and SSH ports"
        )

    container_errors, container_hostnames = _container_errors(
        scenario, services, resources, network_names
    )
    errors.extend(container_errors)
    errors.extend(_checker_errors(scenario, container_hostnames))
    errors.extend(_build_errors(scenario, services, lab_dir))
    return errors


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
