import json
import logging
import re as _re
from typing import Optional

import yaml

from labctl_core.config import RuntimePaths
from labctl_core.manifest import build_manifest
from labctl_core.podman import (
    PodmanError,
    ensure_network,
    ensure_volumes,
    run_command,
    start_containers,
)
from labctl_core.scenario import (
    ScenarioError,
    build_container_map,
    endpoint_ports,
    evaluate_condition,
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
            "browser_terminal_port": ports["browser_terminal"],
            "lab_source_root": str(self.paths.labs_dir),
            "resources": scenario.get("resources", {}),
            "images": images,
        }
        if "app" in ports:
            context["app_port"] = ports["app"]
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
            scenario, _student, runtime_project, context = self._load_context(lab_id, student_id)
            manifest = build_manifest(scenario, context)
            rendered_path = self._rendered_path(runtime_project)
            rendered_path.write_text(yaml.dump(manifest, sort_keys=False), encoding="utf-8")

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
            if (
                run_command(
                    ["podman", "container", "exists", container_name], check=False
                ).returncode
                == 0
            ):
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

        # Remove all networks (multi-network support)
        networks = manifest.get("networks", [])
        if not networks:
            net = manifest.get("network", {})
            if net:
                networks = [net]
        for net in networks:
            network_name = net.get("name")
            if network_name:
                run_command(["podman", "network", "rm", "-f", network_name], check=False)

        rendered_path.unlink(missing_ok=True)
        (self.paths.results_dir / f"{runtime_project}.json").unlink(missing_ok=True)
        logging.info("Lab %s for student %s destroyed.", lab_id, student_id)

    def destroy_all(self, lab_id: str) -> None:
        student_pattern = _re.compile(r"^student[0-9]{2,4}$")
        prefix = f"{lab_id}_"
        destroyed = 0
        for rendered_path in sorted(self.paths.rendered_dir.glob(f"{prefix}*.yml")):
            student_id = rendered_path.stem[len(prefix) :]
            if not student_pattern.match(student_id):
                continue
            try:
                self.destroy(lab_id, student_id)
                destroyed += 1
            except LabctlError:
                pass
        logging.info("destroy-all %s: cleaned %d student instances.", lab_id, destroyed)

    def destroy_all_labs(self) -> None:
        lab_id_pattern = _re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
        destroyed = 0
        for scenario_dir in sorted(self.paths.labs_dir.iterdir()):
            if not scenario_dir.is_dir():
                continue
            lab_id = scenario_dir.name
            if not lab_id_pattern.fullmatch(lab_id):
                continue
            if not (scenario_dir / "scenario.yaml").exists():
                continue
            for rendered_path in sorted(self.paths.rendered_dir.glob(f"{lab_id}_*.yml")):
                student_id = rendered_path.stem[len(lab_id) + 1 :]
                try:
                    self.destroy(lab_id, student_id)
                    destroyed += 1
                except LabctlError:
                    pass
        logging.info(
            "destroy-all --all-labs: cleaned %d student instances across all labs.", destroyed
        )

    def reset(self, lab_id: str, student_id: str) -> None:
        self.destroy(lab_id, student_id)
        self.start(lab_id, student_id)

    def check(self, lab_id: str, student_id: str) -> None:
        runtime_project = f"{lab_id}_{student_id}"
        result_path = self.paths.results_dir / f"{runtime_project}.json"

        try:
            scenario = load_scenario(self.paths, lab_id)
            manifest = self._load_manifest(runtime_project)
            if not manifest:
                raise LabctlError(f"Lab instance {runtime_project} not found. Start it first.")

            running = self._is_running(manifest)
            if not running:
                raise LabctlError(f"Lab instance {runtime_project} is not running.")

            container_map = build_container_map(manifest)
            checker = scenario.get("checker", {})
            check_defs = checker.get("checks", [])

            results = []
            for check_def in check_defs:
                name = check_def["name"]
                exec_in = check_def["exec_in"]
                container_name = container_map.get(exec_in)
                if not container_name:
                    raise LabctlError(
                        f"Check {name!r}: no container matching exec_in={exec_in!r} "
                        f"in manifest. Available: {sorted(container_map.keys())}"
                    )

                cmd = ["podman", "exec", container_name, "sh", "-c", check_def["run"]]
                proc = run_command(cmd, check=False)
                stdout = proc.stdout.strip()
                stderr = proc.stderr.strip()
                exit_code = proc.returncode

                matched_states = []
                for state in ("vulnerable", "fixed"):
                    condition = check_def.get("states", {}).get(state)
                    if condition and evaluate_condition(condition, exit_code, stdout, stderr):
                        matched_states.append(state)

                passed = "fixed" in matched_states

                results.append(
                    {
                        "name": name,
                        "exit_code": exit_code,
                        "output": stdout[:500],
                        "matched_states": matched_states,
                        "passed": passed,
                    }
                )

            overall = _classify_state(results)
            result = {
                "lab": lab_id,
                "student": student_id,
                "status": overall,
                "checks": results,
            }

        except (ScenarioError, PodmanError) as exc:
            raise LabctlError(exc) from exc

        result_json = json.dumps(result, indent=2)
        result_path.write_text(result_json, encoding="utf-8")
        logging.info("Check complete. Result saved to %s", result_path)
        print(result_json)

    def _is_running(self, manifest: dict) -> bool:
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
        return all_running and any_exists

    def status(self, lab_id: str, student_id: str) -> None:
        runtime_project = f"{lab_id}_{student_id}"
        manifest = self._load_manifest(runtime_project)
        if not manifest:
            print("not_created")
            return

        running = self._is_running(manifest)
        any_exists = any(
            run_command(
                ["podman", "inspect", "-f", "{{.State.Status}}", c.get("name")],
                check=False,
            ).returncode
            == 0
            for c in manifest.get("containers", [])
        )

        if running:
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


def _classify_state(results: list[dict]) -> str:
    all_have_vulnerable = all("vulnerable" in r.get("matched_states", []) for r in results)
    all_have_fixed = all("fixed" in r.get("matched_states", []) for r in results)

    if all_have_fixed:
        return "fixed"
    if all_have_vulnerable:
        return "vulnerable"

    return "vulnerable"
