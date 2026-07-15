"""Contract check for expired assignment visibility and lifecycle denial."""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-deadline-contract-"))
    os.environ.update(
        {
            "PORTAL_DB_PATH": str(temp_dir / "portal.db"),
            "EVENT_LOG_PATH": str(temp_dir / "events.jsonl"),
            "RESULTS_DIR": str(temp_dir / "results"),
            "LABS_DIR": str(ROOT / "labs"),
            "ENABLE_SCHEDULER": "false",
        }
    )

    from app import repository as repo  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415
    from app.models import Group, GroupLab, GroupMember, User  # noqa: PLC0415
    from fastapi.testclient import TestClient  # noqa: PLC0415

    init_db()
    lab_id = "redis-exposed"
    inactive_lab_id = "ldap-anonymous-bind"
    email = "deadline-test@example.invalid"
    password = "deadline-test-password"
    instructor_email = "deadline-instructor@example.invalid"
    instructor_password = "deadline-instructor-password"
    with SessionLocal() as session:
        student = User(
            email=email,
            password_hash=repo.hash_password(password),
            role="student",
            internal_id="student999",
            number=999,
            lab_password="workstation-test-password",
        )
        group = Group(name="Deadline contract group", semester="SS 2026")
        inactive_group = Group(
            name="Inactive contract group", semester="WS 2026/27", is_active=False
        )
        instructor = User(
            email=instructor_email,
            password_hash=repo.hash_password(instructor_password),
            role="instructor",
        )
        session.add_all([student, instructor, group, inactive_group])
        session.flush()
        session.add_all(
            [
                GroupMember(group_id=group.id, user_id=student.id, status="approved"),
                GroupMember(group_id=inactive_group.id, user_id=student.id, status="approved"),
                GroupLab(
                    group_id=group.id,
                    lab_id=lab_id,
                    deadline=datetime(2000, 1, 1, tzinfo=timezone.utc),
                ),
                GroupLab(group_id=inactive_group.id, lab_id=inactive_lab_id),
            ]
        )
        inactive_group_id = inactive_group.id
        session.commit()

    with TestClient(app) as client:
        login = client.post("/api/login", json={"username": email, "password": password})
        assert login.status_code == 200, login.text

        workstation_access = client.get("/api/workstation-access")
        assert workstation_access.status_code == 200, workstation_access.text
        assert workstation_access.headers["cache-control"] == "no-store"
        assert workstation_access.json() == {
            "student_id": "student999",
            "workstation_password": "workstation-test-password",
        }

        labs = client.get("/api/labs")
        assert labs.status_code == 200, labs.text
        expired = next(item for item in labs.json() if item["id"] == lab_id)
        assert expired["deadline"].startswith("2000-01-01")
        inactive = next(item for item in labs.json() if item["id"] == inactive_lab_id)
        assert inactive["group"]["is_active"] is False

        assert client.get(f"/api/labs/{lab_id}").status_code == 404
        inactive_detail = client.get(f"/api/labs/{inactive_lab_id}")
        assert inactive_detail.status_code == 200, inactive_detail.text
        assert inactive_detail.json()["group"]["is_active"] is False

        enrollment = client.get("/api/enrollment-options")
        assert enrollment.status_code == 200, enrollment.text
        inactive_option = next(
            item for item in enrollment.json() if item["id"] == inactive_group_id
        )
        assert inactive_option["status"] == "approved"
        assert inactive_option["is_active"] is False

        denied_start = client.post(f"/api/labs/{lab_id}/start")
        assert denied_start.status_code == 403, denied_start.text
        denied_inactive_start = client.post(f"/api/labs/{inactive_lab_id}/start")
        assert denied_inactive_start.status_code == 403, denied_inactive_start.text

        client.post("/api/logout")
        instructor_login = client.post(
            "/api/login",
            json={"username": instructor_email, "password": instructor_password},
        )
        assert instructor_login.status_code == 200, instructor_login.text
        assert client.get("/api/workstation-access").status_code == 403


if __name__ == "__main__":
    main()
