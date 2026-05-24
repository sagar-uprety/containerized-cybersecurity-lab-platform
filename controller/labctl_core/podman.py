import logging
import subprocess
from collections.abc import Iterable


class PodmanError(Exception):
    pass


def run_command(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    logging.debug("Running command: %s", " ".join(args))
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise PodmanError(
            "Command failed: {}\nSTDOUT: {}\nSTDERR: {}".format(
                " ".join(args), result.stdout, result.stderr
            )
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
    network = manifest.get("network", {})
    network_name = network.get("name")
    if not network_name:
        return
    if run_command(["podman", "network", "exists", network_name], check=False).returncode == 0:
        return

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


def container_run_args(container: dict) -> list[str]:
    container_name = container.get("name")
    image = container.get("image")
    if not container_name or not image:
        raise PodmanError("Container entries require name and image")

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
        args.extend(["-e", f"{key}={value}"])
    for port in container.get("ports", []):
        args.extend([
            "-p",
            "{}:{}:{}".format(
                port.get("host_ip", "0.0.0.0"), port["host_port"], port["container_port"]
            ),
        ])
    for port in container.get("expose", []):
        args.extend(["--expose", str(port)])
    for volume in container.get("volumes", []):
        args.extend(["-v", f"{volume['source']}:{volume['target']}"])

    network = container.get("network", {})
    if network.get("name"):
        args.extend(["--network", network["name"]])
        for alias in network.get("aliases", []):
            args.extend(["--network-alias", alias])

    healthcheck = container.get("healthcheck", {})
    if healthcheck:
        command = healthcheck.get("command")
        if isinstance(command, list):
            args.extend(["--health-cmd", command[1] if command[:1] == ["CMD-SHELL"] else " ".join(command)])
        for source, option in {
            "interval": "--health-interval",
            "timeout": "--health-timeout",
            "retries": "--health-retries",
            "start_period": "--health-start-period",
        }.items():
            if healthcheck.get(source):
                args.extend([option, str(healthcheck[source])])

    security = container.get("security", {})
    if security.get("host_network"):
        raise PodmanError(f"Container {container_name} requested host networking, which is not allowed")
    if security.get("privileged"):
        raise PodmanError(f"Container {container_name} requested privileged mode, which is not allowed")
    if security.get("no_new_privileges"):
        args.append("--security-opt=no-new-privileges")
    for capability in security.get("cap_add", []):
        args.extend(["--cap-add", capability])

    resources = container.get("resources", {})
    if resources.get("cpus"):
        args.extend(["--cpus", str(resources["cpus"])])
    if resources.get("memory"):
        args.extend(["--memory", str(resources["memory"])])
    for key, value in container.get("labels", {}).items():
        args.extend(["--label", f"{key}={value}"])

    args.append(image)
    return args


def start_containers(manifest: dict) -> None:
    for container in sort_containers(manifest.get("containers", [])):
        container_name = container.get("name")
        if run_command(["podman", "container", "exists", container_name], check=False).returncode == 0:
            run_command(["podman", "start", container_name], check=False)
        else:
            run_command(container_run_args(container))
