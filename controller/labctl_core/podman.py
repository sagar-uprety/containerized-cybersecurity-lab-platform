"""The only module that issues container runtime commands.

The lifecycle and status modules call the functions below and never run
``podman`` themselves, so replacing the container runtime changes this module
alone.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import time
from collections.abc import Collection, Iterable
from pathlib import Path
from typing import Optional

from labctl_core.scenario import FORBIDDEN_HOST_MOUNT_FRAGMENTS, security_errors

#: Upper bound for waiting on one container's health check during start.
HEALTH_WAIT_CAP_SECONDS = 180
HEALTH_POLL_SECONDS = 2


class PodmanError(Exception):
    pass


def _sanitize_cmd(args: list[str]) -> str:
    """Return a short, safe description of the command for error messages."""
    if not args:
        return "<empty command>"
    parts = list(args[:2])
    for i, arg in enumerate(args):
        if arg == "--name" and i + 1 < len(args):
            parts.extend(["--name", args[i + 1]])
            break
    return " ".join(parts)


def run_command(
    args: list[str], check: bool = True, env: Optional[dict] = None
) -> subprocess.CompletedProcess:
    """Run a command. ``env`` carries values that must not appear in argv."""
    logging.debug("Running command: %s", " ".join(args))
    result = subprocess.run(
        args, capture_output=True, text=True, env={**os.environ, **env} if env else None
    )
    if check and result.returncode != 0:
        raise PodmanError(
            f"Command failed ({result.returncode}): "
            f"{_sanitize_cmd(args)}\n"
            f"STDOUT: {result.stdout}\n"
            f"STDERR: {result.stderr}"
        )
    return result


def dependency_names(container: dict) -> set[str]:
    names = {container.get("name"), container.get("hostname")}
    for alias in container.get("network", {}).get("aliases", []):
        names.add(alias)
    return {name for name in names if name}


def sort_containers(containers: Iterable[dict]) -> list[dict]:
    pending = list(containers)
    ordered = []
    started_names = set()

    while pending:
        progressed = False
        for container in list(pending):
            depends_on = set(container.get("depends_on", []))
            if depends_on.issubset(started_names):
                ordered.append(container)
                started_names.update(dependency_names(container))
                pending.remove(container)
                progressed = True
        if not progressed:
            unresolved = ", ".join(c.get("name", "<unnamed>") for c in pending)
            raise PodmanError(f"Container dependency cycle or unknown dependency: {unresolved}")

    return ordered


def ensure_network(manifest: dict) -> None:
    """Create all networks declared in the manifest (single or multi-network)."""
    networks = manifest.get("networks", [])
    if not networks:
        # Accept single-network manifests.
        network = manifest.get("network", {})
        if network:
            networks = [network]

    for network in networks:
        network_name = network.get("name")
        if not network_name:
            continue
        if run_command(["podman", "network", "exists", network_name], check=False).returncode == 0:
            continue

        args = ["podman", "network", "create"]
        if network.get("internal"):
            args.append("--internal")
        for key, value in network.get("labels", {}).items():
            args.extend(["--label", f"{key}={value}"])
        args.append(network_name)
        run_command(args)


def ensure_volumes(manifest: dict) -> None:
    for volume in manifest.get("volumes", []):
        volume_name = volume.get("name")
        if not volume_name:
            continue
        if run_command(["podman", "volume", "exists", volume_name], check=False).returncode == 0:
            continue

        args = ["podman", "volume", "create"]
        for key, value in volume.get("labels", {}).items():
            args.extend(["--label", f"{key}={value}"])
        args.append(volume_name)
        run_command(args)


def container_run_args(container: dict, secret_keys: Collection[str] = ()) -> list[str]:
    """Build the ``podman run`` argv for one manifest container.

    Environment variables named in ``secret_keys`` are passed by name only;
    their values travel in the environment of the podman process, never in argv.
    """
    container_name = container.get("name")
    image = container.get("image")
    if not container_name or not image:
        raise PodmanError("Container entries require name and image")

    refused = security_errors(container.get("security", {}), f"Container {container_name}")
    refused.extend(
        f"Container {container_name} mounts host runtime socket path {volume['source']!r}"
        for volume in container.get("volumes", [])
        if any(
            fragment in str(volume.get("source", "")) for fragment in FORBIDDEN_HOST_MOUNT_FRAGMENTS
        )
    )
    resources = container.get("resources", {})
    if not resources.get("cpus") or not resources.get("memory"):
        refused.append(f"Container {container_name} has no CPU and memory limit")
    if refused:
        raise PodmanError("; ".join(refused) + ", which is not allowed")

    args = ["podman", "run", "-d", "--name", container_name]
    if container.get("init"):
        args.append("--init")
    if container.get("restart"):
        args.extend(["--restart", container["restart"]])
    if container.get("hostname"):
        args.extend(["--hostname", container["hostname"]])

    for key, value in container.get("sysctls", {}).items():
        args.extend(["--sysctl", f"{key}={value}"])
    for key, value in container.get("environment", {}).items():
        args.extend(["-e", key if key in secret_keys else f"{key}={value}"])
    for port in container.get("ports", []):
        spec = "{}:{}:{}".format(
            port.get("host_ip", "0.0.0.0"), port["host_port"], port["container_port"]
        )
        if port.get("protocol") == "udp":
            spec += "/udp"
        args.extend(["-p", spec])
    for port in container.get("expose", []):
        args.extend(["--expose", str(port)])
    for volume in container.get("volumes", []):
        mount = f"{volume['source']}:{volume['target']}"
        if volume.get("read_only"):
            mount += ":ro"
        args.extend(["-v", mount])

    network = container.get("network", {})
    if network.get("name"):
        args.extend(["--network", network["name"]])
        for alias in network.get("aliases", []):
            args.extend(["--network-alias", alias])

    healthcheck = container.get("healthcheck", {})
    if healthcheck:
        command = healthcheck.get("command")
        if isinstance(command, list):
            args.extend(
                ["--health-cmd", command[1] if command[:1] == ["CMD-SHELL"] else " ".join(command)]
            )
        for source, option in {
            "interval": "--health-interval",
            "timeout": "--health-timeout",
            "retries": "--health-retries",
            "start_period": "--health-start-period",
        }.items():
            if healthcheck.get(source):
                args.extend([option, str(healthcheck[source])])

    if container.get("user"):
        args.extend(["--user", str(container["user"])])

    if container.get("read_only"):
        args.append("--read-only")

    security = container.get("security", {})
    for capability in security.get("cap_add", []):
        args.extend(["--cap-add", capability])
    for capability in security.get("cap_drop", []):
        args.extend(["--cap-drop", capability])

    args.extend(["--cpus", str(resources["cpus"])])
    args.extend(["--memory", str(resources["memory"])])
    for key, value in container.get("labels", {}).items():
        args.extend(["--label", f"{key}={value}"])

    args.append(image)
    return args


def _duration_seconds(value, default: float) -> float:
    match = re.fullmatch(r"\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|s|m|h)?\s*", str(value or ""))
    if not match:
        return default
    number = float(match.group(1))
    return number * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[match.group(2) or "s"]


def health_wait_seconds(healthcheck: dict) -> float:
    """Time a container may take to report healthy before start gives up."""
    start_period = _duration_seconds(healthcheck.get("start_period"), 10)
    interval = _duration_seconds(healthcheck.get("interval"), 10)
    retries = int(healthcheck.get("retries") or 3)
    return min(start_period + interval * (retries + 1), HEALTH_WAIT_CAP_SECONDS)


def wait_until_healthy(container: dict) -> None:
    """Block until a container with a health check passes it."""
    if not container.get("healthcheck"):
        return
    name = container["name"]
    deadline = time.monotonic() + health_wait_seconds(container["healthcheck"])
    while True:
        if run_command(["podman", "healthcheck", "run", name], check=False).returncode == 0:
            return
        state = container_state(name)
        if state not in {"running", "created", "configured", "initialized"}:
            raise PodmanError(f"Container {name} stopped before passing its health check")
        if time.monotonic() >= deadline:
            raise PodmanError(f"Container {name} did not pass its health check in time")
        time.sleep(HEALTH_POLL_SECONDS)


def start_containers(manifest: dict, secret_values: Collection[str] = ()) -> None:
    """Start containers in dependency order, each after its dependencies are healthy."""
    for container in sort_containers(manifest.get("containers", [])):
        container_name = container.get("name")
        if container_exists(container_name):
            run_command(["podman", "start", container_name], check=False)
        else:
            secret_env = {
                key: str(value)
                for key, value in container.get("environment", {}).items()
                if any(secret and secret in str(value) for secret in secret_values)
            }
            run_command(container_run_args(container, secret_env), env=secret_env)

        # Connect to additional networks (for multi-network topologies)
        for net in container.get("additional_networks", []):
            net_name = net.get("name")
            if not net_name:
                continue
            connect_args = ["podman", "network", "connect", net_name, container_name]
            run_command(connect_args, check=False)

        wait_until_healthy(container)


def loosen_bridge_reverse_path_filter(manifest: dict) -> None:
    """Use loose reverse-path filtering on the lab's own bridges.

    A container on several lab networks receives a forwarded port on one
    bridge and answers through the default route of another. The runtime
    creates its bridges with strict filtering, which drops that reply. Loose
    mode still rejects a source that has no route at all.
    """
    for network in manifest.get("networks") or [manifest.get("network") or {}]:
        name = network.get("name")
        if not name:
            continue
        result = run_command(
            ["podman", "network", "inspect", "-f", "{{.NetworkInterface}}", name], check=False
        )
        interface = result.stdout.strip()
        if result.returncode != 0 or not re.fullmatch(r"[A-Za-z0-9_.-]{1,15}", interface):
            continue
        setting = Path("/proc/sys/net/ipv4/conf") / interface / "rp_filter"
        if setting.exists():
            setting.write_text("2\n", encoding="utf-8")


def container_exists(name: str) -> bool:
    return run_command(["podman", "container", "exists", name], check=False).returncode == 0


def container_state(name: str) -> Optional[str]:
    """Return the runtime state of a container, or None if it does not exist."""
    result = run_command(["podman", "inspect", "-f", "{{.State.Status}}", name], check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def stop_container(name: str) -> None:
    if container_exists(name):
        run_command(["podman", "stop", name], check=False)


def remove_container(name: str) -> None:
    run_command(["podman", "rm", "-f", name], check=False)


def remove_volume(name: str) -> None:
    run_command(["podman", "volume", "rm", "-f", name], check=False)


def remove_network(name: str) -> None:
    run_command(["podman", "network", "rm", "-f", name], check=False)


def exec_in_container(name: str, command: str) -> subprocess.CompletedProcess:
    return run_command(["podman", "exec", name, "sh", "-c", command], check=False)


def volume_mountpoint(name: str) -> Optional[str]:
    result = run_command(
        ["podman", "volume", "inspect", "-f", "{{.Mountpoint}}", name], check=False
    )
    return result.stdout.strip() if result.returncode == 0 else None


def running_containers() -> list[dict]:
    """Return the running containers as reported by ``podman ps``."""
    result = run_command(["podman", "ps", "--format", "json"], check=False)
    if result.returncode != 0:
        return []
    try:
        return json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
