"""Regression checks for terminal ownership when computed ports collide."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-terminal-auth-contract-"))
    os.environ["PORTAL_DB_PATH"] = str(temp_dir / "portal.db")
    os.environ["EVENT_LOG_PATH"] = str(temp_dir / "events.jsonl")
    os.environ["RESULTS_DIR"] = str(temp_dir / "results")
    os.environ["LABS_DIR"] = str(ROOT / "labs")

    from app import scenarios  # noqa: PLC0415

    student06 = {
        "role": "student",
        "student_id": "student06",
        "number": 6,
        "lab_password": "student06-password",
    }
    student106 = {
        "role": "student",
        "student_id": "student106",
        "number": 106,
        "lab_password": "student106-password",
    }
    scenario_list = [
        {
            "id": "ldap-anonymous-bind",
            "access": {"browser_terminal_port_base": 19100, "ssh_port_base": 22100},
        },
        {
            "id": "survey-nginx-hardening",
            "access": {"browser_terminal_port_base": 19000, "ssh_port_base": 22000},
        },
    ]
    scenarios.list_scenarios = lambda: scenario_list  # type: ignore[assignment]
    scenarios.runtime_state_for = (  # type: ignore[assignment]
        lambda lab_id, student_id: {
            "status": "running"
            if (lab_id, student_id) == ("survey-nginx-hardening", "student106")
            else "not_created"
        }
    )

    # Both identities compute to terminal port 19106, but only student106 owns
    # a running lease. Inactive student06 must not shadow the active owner.
    assert scenarios.endpoint_ports(scenario_list[0], "student06", student06)["terminal"] == 19106
    assert scenarios.endpoint_ports(scenario_list[1], "student106", student106)["terminal"] == 19106
    assert scenarios.terminal_owner_for_port(19106, student06) is None
    assert scenarios.terminal_owner_for_port(19106, student106) == student106

    print("portal terminal auth contract: ok")


if __name__ == "__main__":
    main()
