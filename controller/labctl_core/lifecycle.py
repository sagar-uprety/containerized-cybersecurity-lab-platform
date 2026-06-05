import logging
import json
from typing import Optional

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from labctl_core.config import RuntimePaths
from labctl_core.podman import PodmanError, ensure_network, ensure_volumes, run_command, start_containers
from labctl_core.scenario import (
    ScenarioError,
    checker_command,
    checker_image,
    endpoint_ports,
    load_scenario,
    load_student_record,
    service_images,
    student_number_from_id,
)


class LabctlError(Exception):
    pass


class LabRuntime:
    def __init__(self) -> None:
        self.paths = RuntimePaths()
        self.paths.ensure_state_dirs()

    def _load_context(self, lab_id: str, student_id: str) -> tuple[dict, dict, str, dict]:
        scenario = load_scenario(self.paths, lab_id)
        student = load_student_record(self.paths, student_id)
        number = int(student.get("number") or student_number_from_id(student_id))
        password = str(student.get("password") or "")
        if not password:
            raise LabctlError(f"Student password missing for {student_id}")

        runtime_project = f"{lab_id}_{student_id}"
        ports = endpoint_ports(scenario, number)
        images = service_images(scenario)
        context = {
            "lab_id": lab_id,
            "student_id": student_id,
            "runtime_project": runtime_project,
            "thesis_platform_name": "thesis-labs",
            "student_password": password,
            "ttyd_credential": f"{student_id}:{password}",
            "host_bind_ip": scenario.get("access", {}).get("host_bind_ip", "0.0.0.0"),
            "ssh_port": ports["ssh"],
            "app_port": ports["app"],
            "browser_terminal_port": ports["browser_terminal"],
            "resources": scenario.get("resources", {}),
            "images": images,
        }
        return scenario, student, runtime_project, context

    def _rendered_path(self, runtime_project: str):
        return self.paths.rendered_dir / f"{runtime_project}.yml"

    def _load_manifest(self, runtime_project: str) -> Optional[dict]:
        rendered_path = self._rendered_path(runtime_project)
        if not rendered_path.exists():
            return None
        return yaml.safe_load(rendered_path.read_text(encoding="utf-8")) or {}

    def start(self, lab_id: str, student_id: str) -> None:
        try:
            _scenario, _student, runtime_project, context = self._load_context(lab_id, student_id)
            lab_dir = self.paths.labs_dir / lab_id
            env = Environment(loader=FileSystemLoader(lab_dir), undefined=StrictUndefined)
            rendered_yaml = env.get_template("podman.yml.tpl").render(context)
            rendered_path = self._rendered_path(runtime_project)
            rendered_path.write_text(rendered_yaml, encoding="utf-8")
            manifest = yaml.safe_load(rendered_yaml) or {}

            ensure_network(manifest)
            ensure_volumes(manifest)
            start_containers(manifest)
        except (ScenarioError, PodmanError, OSError, yaml.YAMLError) as exc:
            raise LabctlError(exc) from exc

        logging.info("Lab %s for student %s started successfully.", lab_id, student_id)

    def stop(self, lab_id: str, student_id: str) -> None:
        runtime_project = f"{lab_id}_{student_id}"
        manifest = self._load_manifest(runtime_project)
        if not manifest:
            logging.warning("Lab instance %s not found.", runtime_project)
            return
        for container in reversed(manifest.get("containers", [])):
            container_name = container.get("name")
            if run_command(["podman", "container", "exists", container_name], check=False).returncode == 0:
                run_command(["podman", "stop", container_name], check=False)
        logging.info("Lab %s for student %s stopped.", lab_id, student_id)

    def destroy(self, lab_id: str, student_id: str) -> None:
        runtime_project = f"{lab_id}_{student_id}"
        rendered_path = self._rendered_path(runtime_project)
        manifest = self._load_manifest(runtime_project)
        if not manifest:
            logging.warning("Lab instance %s not found.", runtime_project)
            return

        for container in manifest.get("containers", []):
            run_command(["podman", "rm", "-f", container.get("name")], check=False)
        for volume in manifest.get("volumes", []):
            run_command(["podman", "volume", "rm", "-f", volume.get("name")], check=False)
        network_name = manifest.get("network", {}).get("name")
        if network_name:
            run_command(["podman", "network", "rm", "-f", network_name], check=False)

        rendered_path.unlink(missing_ok=True)
        (self.paths.results_dir / f"{runtime_project}.json").unlink(missing_ok=True)
        logging.info("Lab %s for student %s destroyed.", lab_id, student_id)

    def reset(self, lab_id: str, student_id: str) -> None:
        self.destroy(lab_id, student_id)
        self.start(lab_id, student_id)

    def check(self, lab_id: str, student_id: str) -> None:
        try:
            scenario = load_scenario(self.paths, lab_id)
            runtime_project = f"{lab_id}_{student_id}"
            command = checker_command(scenario)
            check_path = self.paths.labs_dir / lab_id / command
            image = checker_image(scenario, service_images(scenario))
            network_name = f"{runtime_project}_labnet"
            result_path = self.paths.results_dir / f"{runtime_project}.json"

            cmd = [
                "podman", "run", "--rm",
                "--network", network_name,
                "-v", f"{check_path.parent}:/checks:ro",
                image,
                "python3", f"/checks/{check_path.name}",
                "--lab", lab_id,
                "--student", student_id,
            ]
            logging.info("Running checks via ephemeral container attached to the lab network.")
            result = run_command(cmd, check=False)
        except (ScenarioError, PodmanError) as exc:
            raise LabctlError(exc) from exc

        if result.returncode != 0:
            raise LabctlError(
                f"Checker execution failed. Return Code: {result.returncode}\n"
                f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
            )

        result_path.write_text(result.stdout, encoding="utf-8")
        logging.info("Check complete. Result saved to %s", result_path)
        print(result.stdout.strip())

    def status(self, lab_id: str, student_id: str) -> None:
        runtime_project = f"{lab_id}_{student_id}"
        manifest = self._load_manifest(runtime_project)
        if not manifest:
            print("not_created")
            return

        all_running = True
        any_exists = False
        for container in manifest.get("containers", []):
            result = run_command(
                ["podman", "inspect", "-f", "{{.State.Status}}", container.get("name")],
                check=False,
            )
            if result.returncode == 0:
                any_exists = True
                if result.stdout.strip() != "running":
                    all_running = False
            else:
                all_running = False

        if all_running and any_exists:
            print("running")
        elif any_exists:
            print("stopped")
        else:
            print("error")

        command_logs = self._recent_command_logs(runtime_project)
        if command_logs:
            print("command_logs: " + json.dumps(command_logs, sort_keys=True))

    def _recent_command_logs(self, runtime_project: str, limit: int = 25) -> list[dict]:
        volume_name = f"{runtime_project}_command_logs"
        result = run_command(
            ["podman", "volume", "inspect", "-f", "{{.Mountpoint}}", volume_name],
            check=False,
        )
        if result.returncode != 0:
            return []

        log_path = self.paths.command_log_path(result.stdout.strip())
        if not log_path.exists():
            return []

        entries = []
        for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-limit:]:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(entry, dict):
                entries.append(entry)
        return entries
