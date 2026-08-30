"""Contract checks for the instructor evidence export and the lab application route.

Checks covered here:
- An export covers only the sessions of the one group named in the request,
  and only a group the requesting instructor owns.
- Every student identifier is replaced by a stable pseudonym, also inside
  command text; the same student carries the same pseudonym in two exports.
- Feedback leaves without a student or session identifier, and a lab's
  feedback is included only once it has at least five responses.
- An archive can be downloaded only by the instructor who requested it.
- The lab application endpoint is served through the portal path, and the
  nginx authorization check admits only the student who owns the port.
"""

from __future__ import annotations

import io
import json
import os
import sys
import tarfile
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def _read_archive(content: bytes) -> dict:
    records = {}
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as tar:
        for member in tar.getmembers():
            text = tar.extractfile(member).read().decode("utf-8")
            if member.name == "manifest.json":
                records[member.name] = json.loads(text)
            else:
                records[member.name] = [json.loads(line) for line in text.splitlines()]
    return records


def _login(client, email: str, password: str) -> None:
    response = client.post("/api/login", json={"username": email, "password": password})
    assert response.status_code == 200, response.text


def _export(client, group_id: int):
    csrf = client.get("/api/instructor/csrf").json()["csrf_token"]
    return client.post(
        "/api/instructor/evidence/export", json={"group_id": group_id, "csrf_token": csrf}
    )


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-evidence-export-contract-"))
    os.environ.update(
        {
            "PORTAL_DB_PATH": str(temp_dir / "portal.db"),
            "EVENT_LOG_PATH": str(temp_dir / "events.jsonl"),
            "RESULTS_DIR": str(temp_dir / "results"),
            "LABS_DIR": str(ROOT / "labs"),
            "ENABLE_SCHEDULER": "false",
        }
    )

    from app import main as portal  # noqa: PLC0415
    from app import repository as repo  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.feedback import (  # noqa: PLC0415
        create_lab_session,
        save_command_events,
        save_feedback,
        save_lifecycle_event,
    )
    from app.models import User  # noqa: PLC0415
    from app.runtime_state import update_runtime_state  # noqa: PLC0415
    from fastapi.testclient import TestClient  # noqa: PLC0415

    init_db()
    password = "evidence-contract-password"
    busy_lab, quiet_lab = "redis-exposed", "banner-exposure"

    with SessionLocal() as session:
        owner = User(
            email="owner@example.invalid",
            password_hash=repo.hash_password(password),
            role="instructor",
        )
        other = User(
            email="other@example.invalid",
            password_hash=repo.hash_password(password),
            role="instructor",
        )
        session.add_all([owner, other])
        session.flush()
        group_a = repo.create_group(session, "Export A", owner.id, semester="WS 2026/27").id
        group_b = repo.create_group(session, "Export B", other.id, semester="WS 2026/27").id
        students = []
        for number in range(901, 908):
            student = User(
                email=f"s{number}@example.invalid",
                password_hash=repo.hash_password(password),
                role="student",
                internal_id=f"student{number}",
                number=number,
                lab_password=f"lab-{number}",
            )
            session.add(student)
            session.flush()
            # student907 belongs to the other instructor's group.
            repo.add_member(session, group_b if number == 907 else group_a, student.id)
            students.append(student.internal_id)
        session.commit()

    for index, student_id in enumerate(students):
        group_id = group_b if student_id == "student907" else group_a
        session_id = str(uuid.uuid4())
        create_lab_session(session_id, busy_lab, student_id, group_id=group_id)
        save_lifecycle_event("start", busy_lab, student_id, student_id, "ok", session_id=session_id)
        save_command_events(
            busy_lab,
            student_id,
            [
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "session_id": "t1",
                    "event": "command",
                    "command": f"echo {student_id}",
                    "duration_seconds": 0.012,
                }
            ],
        )
        save_feedback(busy_lab, student_id, session_id, "fine", 4, f"comment {index}")
        if index < 2:
            quiet_session = str(uuid.uuid4())
            create_lab_session(quiet_session, quiet_lab, student_id, group_id=group_id)
            save_feedback(quiet_lab, student_id, quiet_session, "short", 2, "few")

    with TestClient(portal.app) as client:
        _login(client, "owner@example.invalid", password)

        assert _export(client, group_b).status_code == 404
        response = _export(client, group_a)
        assert response.status_code == 200, response.text
        download_url = response.json()["download_url"]
        archive = client.get(download_url)
        assert archive.status_code == 200
        records = _read_archive(archive.content)

        manifest = records["manifest.json"]
        assert manifest["pseudonymized"] is True
        assert manifest["group_ids"] == [group_a]

        raw = json.dumps(records)
        for student_id in students:
            assert student_id not in raw, f"{student_id} leaked into the export"
        commands = records["commands.jsonl"]
        assert len(commands) == 6
        for command in commands:
            assert command["command"] == f"echo {command['student_id']}"
            assert command["duration_seconds"] == 0.012
        lifecycle = records["lifecycle.jsonl"]
        assert len(lifecycle) == 6
        assert all(item["actor"] == item["student_id"] for item in lifecycle)

        feedback = records["feedback.jsonl"]
        assert {item["lab_id"] for item in feedback} == {busy_lab}
        assert len(feedback) == 6
        for item in feedback:
            assert "student_id" not in item
            assert "session_id" not in item

        second = _read_archive(client.get(_export(client, group_a).json()["download_url"]).content)
        assert {c["student_id"] for c in second["commands.jsonl"]} == {
            c["student_id"] for c in commands
        }

        client.post("/api/logout")
        _login(client, "other@example.invalid", password)
        assert client.get(download_url).status_code == 404
        traversal = client.get("/api/instructor/evidence/export/..%2F..%2Fportal")
        assert traversal.status_code == 404

    # Lab application route: owner passes, anyone else is refused.
    with SessionLocal() as session:
        owner_student = repo.get_user_by_internal_id(session, "student901")
        owner_dict = {
            "role": "student",
            "student_id": "student901",
            "number": owner_student.number,
            "lab_password": owner_student.lab_password,
        }
    scenario = next(item for item in portal.list_scenarios() if item["id"] == busy_lab)
    endpoints = portal._build_endpoints(scenario, "student901", owner_dict)
    app_port = portal.endpoint_ports(scenario, "student901", owner_dict)["app"]
    assert endpoints["app"] == f"/lab-app/{app_port}/"
    assert "@" + portal.settings.PORTAL_PUBLIC_HOST + " " in endpoints["ssh"]

    update_runtime_state(busy_lab, "student901", "running")
    with TestClient(portal.app) as client:
        headers = {"X-Original-URI": f"/lab-app/{app_port}/health"}
        _login(client, "s901@example.invalid", password)
        assert client.get("/internal/app-auth", headers=headers).status_code == 204
        client.post("/api/logout")
        _login(client, "s902@example.invalid", password)
        assert client.get("/internal/app-auth", headers=headers).status_code == 404

    print("portal evidence export contract: ok")


if __name__ == "__main__":
    main()
