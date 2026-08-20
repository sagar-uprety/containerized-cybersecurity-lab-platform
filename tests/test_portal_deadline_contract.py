"""Contract check for expired assignment visibility and lifecycle denial."""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
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
    archived_lab_id = "ldap-anonymous-bind"
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
        # Archiving is the sole lifecycle gate now (formerly is_active=False):
        # it still blocks start/reset/check while existing members keep their
        # historical labs/results and may still stop/end a running lab.
        archived_group = Group(
            name="Archived contract group",
            semester="WS 2026/27",
            is_archived=True,
            archived_at=datetime.now(timezone.utc),
        )
        instructor = User(
            email=instructor_email,
            password_hash=repo.hash_password(instructor_password),
            role="instructor",
        )
        session.add_all([student, instructor, group, archived_group])
        session.flush()
        session.add_all(
            [
                GroupMember(group_id=group.id, user_id=student.id, status="approved"),
                GroupMember(group_id=archived_group.id, user_id=student.id, status="approved"),
                GroupLab(
                    group_id=group.id,
                    lab_id=lab_id,
                    deadline=datetime(2000, 1, 1, tzinfo=timezone.utc),
                ),
                GroupLab(group_id=archived_group.id, lab_id=archived_lab_id),
            ]
        )
        archived_group_id = archived_group.id
        instructor_id = instructor.id
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
        # An archived group's cohort is finished, so its labs leave the student's
        # lab list entirely -- results stay readable via /api/results, which is
        # keyed on obligations rather than this list.
        assert not [item for item in labs.json() if item["id"] == archived_lab_id], (
            "archived group's lab is still listed for the student"
        )

        # An expired-but-unarchived lab is now readable (read-only): the
        # student can reopen it to reread the scenario/guides/story, but the
        # response must say so explicitly via "expired" so the client never
        # has to infer it from the deadline timestamp (clock skew).
        expired_detail = client.get(f"/api/labs/{lab_id}")
        assert expired_detail.status_code == 200, expired_detail.text
        assert expired_detail.json()["expired"] is True
        # And its lab page 404s rather than offering actions that are denied.
        archived_detail = client.get(f"/api/labs/{archived_lab_id}")
        assert archived_detail.status_code == 404, archived_detail.text

        # The other half of the contract: hiding the lab must not hide the
        # record. The archived group's obligation still surfaces under results.
        results = client.get("/api/results")
        assert results.status_code == 200, results.text
        archived_results = [
            item for item in results.json()["labs"] if item["lab_id"] == archived_lab_id
        ]
        assert archived_results, "archived group's lab vanished from results too"
        assert archived_results[0]["group_id"] == archived_group_id

        enrollment = client.get("/api/enrollment-options")
        assert enrollment.status_code == 200, enrollment.text
        archived_option = next(
            item for item in enrollment.json() if item["id"] == archived_group_id
        )
        assert archived_option["status"] == "approved"
        assert archived_option["is_archived"] is True

        denied_start = client.post(f"/api/labs/{lab_id}/start")
        assert denied_start.status_code == 403, denied_start.text
        denied_archived_start = client.post(f"/api/labs/{archived_lab_id}/start")
        assert denied_archived_start.status_code == 403, denied_archived_start.text

        # Readable != startable: the expired lab's detail page is now 200,
        # but its full lifecycle (start/reset/check) must still be denied --
        # require_lab_visible/get_visible_lab_ids excludes expired labs
        # independently of the detail-route change above.
        denied_reset = client.post(f"/api/labs/{lab_id}/reset")
        assert denied_reset.status_code == 403, denied_reset.text
        denied_check = client.post(f"/api/labs/{lab_id}/check")
        assert denied_check.status_code == 403, denied_check.text

        client.post("/api/logout")
        instructor_login = client.post(
            "/api/login",
            json={"username": instructor_email, "password": instructor_password},
        )
        assert instructor_login.status_code == 200, instructor_login.text
        assert client.get("/api/workstation-access").status_code == 403

        # --- Task 2 contract: POST /api/instructor/groups/{id}/labs rejects
        # a new deadline that is strictly in the past, accepts a future one,
        # keeps clearing the deadline working, and never blocks moving an
        # already-lapsed STORED deadline forward. ---
        from sqlalchemy import select  # noqa: PLC0415

        with SessionLocal() as session:
            api_group = Group(
                name="Deadline API contract group", semester="SS 2026", owner_id=instructor_id
            )
            session.add(api_group)
            session.flush()
            # Pre-existing assignment whose deadline has already lapsed --
            # editing it forward (below) must still succeed even though it
            # started out in the past.
            session.add(
                GroupLab(
                    group_id=api_group.id,
                    lab_id=archived_lab_id,
                    deadline=datetime(2000, 1, 1, tzinfo=timezone.utc),
                )
            )
            api_group_id = api_group.id
            session.commit()

        csrf = client.get("/api/instructor/csrf").json()["csrf_token"]

        def group_lab_deadline(target_lab_id: str):
            with SessionLocal() as query_session:
                row = query_session.execute(
                    select(GroupLab).where(
                        GroupLab.group_id == api_group_id, GroupLab.lab_id == target_lab_id
                    )
                ).scalar_one_or_none()
                return row.deadline if row else None

        # A deadline strictly in the past is rejected with a clear 400, and
        # nothing is written.
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        rejected = client.post(
            f"/api/instructor/groups/{api_group_id}/labs",
            json={"lab_id": lab_id, "deadline": past, "csrf_token": csrf},
        )
        assert rejected.status_code == 400, rejected.text
        assert "past" in rejected.json()["detail"].lower()
        assert group_lab_deadline(lab_id) is None, "rejected deadline was written anyway"

        # Ordinary clock skew (a few seconds behind the server) must not be
        # rejected -- the tolerance is a 1-minute grace.
        near_now = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
        skew_ok = client.post(
            f"/api/instructor/groups/{api_group_id}/labs",
            json={"lab_id": lab_id, "deadline": near_now, "csrf_token": csrf},
        )
        assert skew_ok.status_code == 200, skew_ok.text

        # A future deadline is accepted and stored.
        future = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        accepted = client.post(
            f"/api/instructor/groups/{api_group_id}/labs",
            json={"lab_id": lab_id, "deadline": future, "csrf_token": csrf},
        )
        assert accepted.status_code == 200, accepted.text
        stored = group_lab_deadline(lab_id)
        assert stored is not None
        assert stored.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)

        # Clearing a deadline (None) keeps working.
        cleared = client.post(
            f"/api/instructor/groups/{api_group_id}/labs",
            json={"lab_id": lab_id, "deadline": None, "csrf_token": csrf},
        )
        assert cleared.status_code == 200, cleared.text
        assert group_lab_deadline(lab_id) is None

        # Editing an assignment whose STORED deadline is already in the past
        # must not become impossible -- moving it forward is exactly how an
        # instructor fixes a bad deadline. Validation must judge only the
        # incoming value, never the value already on record.
        assert group_lab_deadline(archived_lab_id) is not None  # sanity: still year 2000
        fixed = client.post(
            f"/api/instructor/groups/{api_group_id}/labs",
            json={"lab_id": archived_lab_id, "deadline": future, "csrf_token": csrf},
        )
        assert fixed.status_code == 200, fixed.text
        fixed_deadline = group_lab_deadline(archived_lab_id)
        assert fixed_deadline is not None
        assert fixed_deadline.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)


if __name__ == "__main__":
    main()
