"""Contract checks for labctl start on the lab worker, with podman replaced.

Checks covered here:
- Start waits for each container's health check before starting the
  containers that depend on it, and the workstation comes last.
- The lab password never appears in a podman argv and never in the runtime
  description kept on disk; podman receives it through its environment.
- A scenario that breaks a contract rule does not load.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "controller"))

PASSWORD = "contract-lab-password"


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="labctl-start-contract-"))
    shutil.copytree(ROOT / "labs", temp_dir / "labs")
    os.environ["THESIS_LABS_BASE_DIR"] = str(temp_dir)
    os.environ["THESIS_LABS_STATE_DIR"] = str(temp_dir / "state")
    os.environ["LAB_STUDENT_PASSWORD"] = PASSWORD

    from labctl_core import lifecycle, podman  # noqa: PLC0415

    calls: list[tuple[list[str], dict]] = []
    created: set[str] = set()
    health_runs: dict[str, int] = {}

    def fake_run(args, **kwargs):
        calls.append((list(args), dict(kwargs.get("env") or {})))
        verb = args[1:3]
        returncode = 0
        stdout = ""
        if verb == ["container", "exists"]:
            returncode = 0 if args[3] in created else 1
        elif args[1] == "run":
            created.add(args[args.index("--name") + 1])
        elif verb == ["healthcheck", "run"]:
            # Each container reports healthy on its second probe.
            health_runs[args[3]] = health_runs.get(args[3], 0) + 1
            returncode = 0 if health_runs[args[3]] >= 2 else 1
        elif args[1] == "inspect":
            stdout = "running"
        elif verb in (["network", "exists"], ["volume", "exists"]):
            returncode = 1
        return subprocess.CompletedProcess(args, returncode, stdout, "")

    podman.subprocess.run = fake_run  # type: ignore[assignment]
    podman.time.sleep = lambda _seconds: None  # type: ignore[assignment]

    runtime = lifecycle.LabRuntime()
    runtime.start("redis-exposed", "student42")

    run_order = [args[args.index("--name") + 1] for args, _ in calls if args[1] == "run"]
    assert run_order[-1].endswith("_workstation"), run_order
    for name in run_order:
        first_health = next(
            i
            for i, (args, _) in enumerate(calls)
            if args[1:3] == ["healthcheck", "run"] and args[3] == name
        )
        later_runs = [
            args[args.index("--name") + 1] for args, _ in calls[:first_health] if args[1] == "run"
        ]
        # No container after this one was started before its health check ran.
        assert later_runs == run_order[: run_order.index(name) + 1], (name, later_runs)
        assert health_runs[name] == 2

    for args, env in calls:
        assert not any(PASSWORD in arg for arg in args), args
        if args[1] == "run" and args[-1].endswith("workstation-base:latest"):
            assert env.get("STUDENT_PASSWORD") == PASSWORD
    rendered = (temp_dir / "state" / "rendered" / "redis-exposed_student42.yml").read_text(
        encoding="utf-8"
    )
    assert PASSWORD not in rendered
    assert yaml.safe_load(rendered)["containers"]

    scenario_path = temp_dir / "labs" / "redis-exposed" / "scenario.yaml"
    scenario = yaml.safe_load(scenario_path.read_text(encoding="utf-8"))
    scenario["containers"][0].setdefault("volumes", []).append(
        {
            "host_path": "/run/podman/podman.sock",
            "target": "/var/run/docker.sock",
            "read_only": True,
        }
    )
    scenario_path.write_text(yaml.safe_dump(scenario), encoding="utf-8")
    try:
        runtime.start("redis-exposed", "student43")
    except lifecycle.LabctlError as exc:
        assert "runtime socket" in str(exc), exc
    else:
        raise AssertionError("a scenario mounting the runtime socket was loaded")

    print("labctl start contract: ok")


if __name__ == "__main__":
    main()
