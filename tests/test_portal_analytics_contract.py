"""In-process contract verification for normalized portal analytics and demo seed."""

from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-contract-"))
    fixture_path = ROOT / "controller/lab-controller-api/demo-data.json"
    if not fixture_path.exists():
        subprocess.run(
            [sys.executable, str(ROOT / "tools/generate_portal_demo.py")],
            check=True,
        )
    credentials_path = temp_dir / "credentials.csv"
    os.environ.update(
        {
            "PORTAL_DB_PATH": str(temp_dir / "portal.db"),
            "PORTAL_DEMO_DATA_PATH": str(fixture_path),
            "EVENT_LOG_PATH": str(temp_dir / "events.jsonl"),
            "RESULTS_DIR": str(temp_dir / "results"),
            "LABS_DIR": str(ROOT / "labs"),
            "ENABLE_SCHEDULER": "false",
        }
    )

    from app import main as portal  # noqa: PLC0415
    from app.analytics import instructor_analytics  # noqa: PLC0415
    from app.db import SessionLocal  # noqa: PLC0415
    from app.demo_seed import replace_with_demo_data  # noqa: PLC0415
    from app.models import (  # noqa: PLC0415
        CheckAttempt,
        Group,
        GroupMember,
        LabSession,
        LifecycleEvidence,
        RuntimeLease,
        TerminalCommand,
        User,
    )
    from fastapi.testclient import TestClient  # noqa: PLC0415
    from labctl_core import lifecycle as lifecycle_module  # noqa: PLC0415

    seeded = replace_with_demo_data(fixture_path, credentials_path)
    assert seeded["users"] == 83
    with SessionLocal() as session:
        assert all(group.owner_id is not None for group in session.scalars(select(Group)))
        assert all(item.group_id is not None for item in session.scalars(select(LabSession)))
        actors = [*session.scalars(select(CheckAttempt.actor_id))]
        actors.extend(session.scalars(select(LifecycleEvidence.actor_id)))
        assert all("@" not in actor for actor in actors)
    credentials = list(csv.DictReader(credentials_path.open(encoding="utf-8")))
    instructor = next(item for item in credentials if item["role"] == "instructor")
    student = next(item for item in credentials if item["student_id"] == "student03")
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    selected_lab = fixture["labs"][2]

    fail_stop = {"value": False}
    ssh_calls = []

    def fake_labctl(verb, _lab_id, _student_id, lab_password=None):
        del lab_password
        ssh_calls.append(verb)
        if verb == "stop" and fail_stop["value"]:
            return False, "", "synthetic stop failure"
        if verb == "check":
            checks = [
                {
                    **criterion,
                    "exit_code": 0,
                    "output": "FIXED",
                    "matched_states": ["fixed"],
                    "observed_state": "fixed",
                    "passed": True,
                }
                for criterion in selected_lab["criteria"]
            ]
            result = {
                "lab": selected_lab["id"],
                "student": student["student_id"],
                "status": "fixed",
                "passed": True,
                "checker_version": selected_lab["checker_version"],
                "checks": checks,
                "command_logs": [
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "session_id": "contract-terminal",
                        "event": "command",
                        "command": "id",
                    }
                ],
            }
            return True, json.dumps(result), ""
        if verb in {"stop", "reset", "destroy"}:
            return True, "command_logs: []", ""
        return True, "", ""

    portal.run_labctl = fake_labctl
    original_reader = lifecycle_module.read_injected_lab_password
    lifecycle_module.read_injected_lab_password = lambda: None
    try:
        runtime = lifecycle_module.LabRuntime.__new__(lifecycle_module.LabRuntime)
        try:
            runtime._resolve_student("student03")
        except lifecycle_module.LabctlError as exc:
            assert "requires a student password" in str(exc)
        else:
            raise AssertionError("x01 provisioning accepted a missing injected password")
    finally:
        lifecycle_module.read_injected_lab_password = original_reader

    with TestClient(portal.app) as client:
        response = client.post(
            "/api/login",
            json={"username": instructor["email"], "password": instructor["portal_password"]},
        )
        assert response.status_code == 200, response.text
        analytics_started = time.monotonic()
        analytics = client.get("/api/instructor/analytics")
        analytics_seconds = time.monotonic() - analytics_started
        assert analytics.status_code == 200, analytics.text
        assert analytics_seconds < 10, f"Analytics took {analytics_seconds:.2f}s"
        payload = analytics.json()
        with SessionLocal() as session:
            instructor_user = session.execute(
                select(User).where(User.email == instructor["email"])
            ).scalar_one()
            owner_group_ids = list(
                session.scalars(select(Group.id).where(Group.owner_id == instructor_user.id))
            )
            active_roster_count = len(
                set(
                    session.scalars(
                        select(GroupMember.user_id)
                        .join(Group, Group.id == GroupMember.group_id)
                        .where(
                            Group.owner_id == instructor_user.id,
                            Group.is_archived.is_(False),
                            GroupMember.status == "approved",
                        )
                    )
                )
            )
        direct = instructor_analytics(owner_group_ids)
        assert payload["eligible_assignments"] == direct["eligible_assignments"]
        assert payload["eligible_assignments"] > 0
        assert payload["completed_assignments"] <= payload["eligible_assignments"]
        low_feedback = next(
            item for item in payload["labs"] if item["lab_id"] == "unpatched-apache-cve"
        )
        assert low_feedback["feedback_count"] == 3
        assert low_feedback["feedback_average"] is None
        read_call_count = len(ssh_calls)
        assert (
            client.get(f"/api/instructor/labs/{selected_lab['id']}/sessions/student03").status_code
            == 200
        )
        assert len(ssh_calls) == read_call_count
        csrf = client.get("/api/instructor/csrf").json()["csrf_token"]
        empty_group = client.post(
            "/api/instructor/groups",
            json={
                "name": "Roster without lab assignments",
                "semester": "SS 2028",
                "csrf_token": csrf,
            },
        )
        assert empty_group.status_code == 200, empty_group.text
        empty_group_id = empty_group.json()["id"]
        created = client.post(
            "/api/instructor/students",
            json={
                "email": "unassigned-roster@example.edu",
                "group_id": empty_group_id,
                "csrf_token": csrf,
            },
        )
        assert created.status_code == 200, created.text
        refreshed_analytics = client.get("/api/instructor/analytics")
        assert refreshed_analytics.status_code == 200
        empty_group_summary = next(
            group for group in refreshed_analytics.json()["groups"] if group["id"] == empty_group_id
        )
        assert empty_group_summary["total_students"] == 1
        assert empty_group_summary["labs_assigned"] == 0
        assert empty_group_summary["eligible_assignments"] == 0
        students = client.get("/api/instructor/students-progress")
        assert students.status_code == 200 and len(students.json()) == active_roster_count + 1
        roster_only = next(
            item for item in students.json() if item["email"] == "unassigned-roster@example.edu"
        )
        assert roster_only["labs_assigned"] == 0
        scoped_students = client.get(f"/api/instructor/students-progress?group_id={empty_group_id}")
        assert scoped_students.status_code == 200
        assert len(scoped_students.json()) == 1
        assert scoped_students.json()[0]["email"] == "unassigned-roster@example.edu"
        assert scoped_students.json()[0]["labs_assigned"] == 0
        assert client.get("/api/instructor/students-progress?group_id=999999").status_code == 404
        detail = client.get("/api/instructor/students/student03?group_id=1")
        assert detail.status_code == 200 and detail.json()["labs"]
        real_names = {
            criterion["name"] for lab in detail.json()["labs"] for criterion in lab["criteria"]
        }
        fixture_names = {
            criterion["name"] for lab in fixture["labs"] for criterion in lab["criteria"]
        }
        assert real_names <= fixture_names

        feedback = client.get(f"/api/instructor/feedback/{selected_lab['id']}")
        assert feedback.status_code == 200
        assert all("student_id" not in item for item in feedback.json()["responses"])

        client.post("/api/logout")
        response = client.post(
            "/api/login",
            json={"username": student["email"], "password": student["portal_password"]},
        )
        assert response.status_code == 200, response.text
        read_call_count = len(ssh_calls)
        labs = client.get("/api/labs")
        assert labs.status_code == 200 and labs.json()
        results = client.get("/api/results")
        assert results.status_code == 200 and results.json()["labs"]
        runnable_lab = next(
            (item for item in labs.json() if item["deadline"] is None),
            labs.json()[-1],
        )
        lab_id = runnable_lab["id"]
        selected_lab = next(item for item in fixture["labs"] if item["id"] == lab_id)
        lab_detail = client.get(f"/api/labs/{lab_id}")
        assert lab_detail.status_code == 200, lab_detail.text
        assert client.post(f"/api/heartbeat/{lab_id}").status_code == 200
        assert len(ssh_calls) == read_call_count
        csrf = lab_detail.json()["csrf_token"]
        start = client.post(f"/api/labs/{lab_id}/start", json={"csrf_token": csrf})
        assert start.status_code == 200, start.text
        first_session = portal.runtime_state_for(lab_id, student["student_id"])["session_id"]
        with SessionLocal() as session:
            lease = session.get(RuntimeLease, f"{lab_id}:{student['student_id']}")
            assert lease and lease.status == "running" and lease.session_id == first_session
            assert session.scalars(select(TerminalCommand)).first() is not None
        reset = client.post(f"/api/labs/{lab_id}/reset", json={"csrf_token": csrf})
        assert reset.status_code == 200, reset.text
        second_session = portal.runtime_state_for(lab_id, student["student_id"])["session_id"]
        assert first_session != second_session
        with SessionLocal() as session:
            assert session.get(LabSession, first_session).outcome == "reset"
            assert session.get(LabSession, second_session).ended_at is None

        fail_stop["value"] = True
        failed_stop = client.post(f"/api/labs/{lab_id}/stop", json={"csrf_token": csrf})
        assert failed_stop.status_code == 502
        with SessionLocal() as session:
            assert session.get(LabSession, second_session).ended_at is None
        fail_stop["value"] = False
        end = client.post(f"/api/labs/{lab_id}/end", json={"csrf_token": csrf})
        assert end.status_code == 200, end.text
        with SessionLocal() as session:
            assert session.get(LabSession, second_session).outcome == "end"
            lease = session.get(RuntimeLease, f"{lab_id}:{student['student_id']}")
            assert lease and lease.status == "ended"

        feedback_info = client.get(f"/api/labs/{lab_id}/feedback").json()
        feedback_body = {
            "csrf_token": feedback_info["csrf_token"],
            "session_id": second_session,
            "section_a": "I verified the technical objective and preserved the service guardrail.",
            "rating": 4,
            "comment": "The distinction between objective and guardrail was clear.",
            "issue_category": "checker",
        }
        invalid_feedback = client.post(
            f"/api/labs/{lab_id}/feedback",
            json={**feedback_body, "rating": 6},
        )
        submitted = client.post(f"/api/labs/{lab_id}/feedback", json=feedback_body)
        duplicate = client.post(f"/api/labs/{lab_id}/feedback", json=feedback_body)
        assert invalid_feedback.status_code == 400, invalid_feedback.text
        assert submitted.status_code == 200, submitted.text
        assert duplicate.status_code == 400, duplicate.text
        assert "status" not in ssh_calls

    sys.stdout.write(
        json.dumps(
            {
                "users": seeded["users"],
                "eligible_assignments": payload["eligible_assignments"],
                "completed_assignments": payload["completed_assignments"],
                "analytics_seconds": round(analytics_seconds, 3),
                "labs": {item["lab_id"]: item["students_passed"] for item in payload["labs"]},
                "session_reset_verified": True,
                "failed_stop_preserved_session": True,
                "feedback_privacy_and_uniqueness": True,
                "feedback_validation_and_suppression": True,
                "zero_ssh_reads_and_heartbeat": True,
                "sqlite_runtime_lease": True,
                "command_sync_on_existing_actions": True,
                "x01_registry_removed": True,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
