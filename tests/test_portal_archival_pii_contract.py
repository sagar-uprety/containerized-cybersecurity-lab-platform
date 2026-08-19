"""Contract check: archiving a group must suppress per-member PII (email,
study_program) in that group's OWN instructor-facing responses, and the
archive is permanent -- there is no route that can undo it.

Guards against two leaks found in the group-detail response
(GET /api/instructor/groups/{group_id}) and in main.py::_group_to_dict:

1. `analytics.recent_activity()` used to join `User.email` unconditionally,
   so the group detail page's "Recent activity" feed showed every student's
   real email on an archived group -- directly contradicting the "Archived -
   student PII removed" badge the group page renders. Fixed by adding a
   `redact_email: bool = False` parameter, passed as
   `redact_email=group.is_archived` from the group-detail route.
2. `_group_to_dict()` returned `{"email": m.user.email}` for each approved
   member with no archival check. Fixed to
   `None if group.is_archived else m.user.email`.

The pseudonymous `student_id` (e.g. `student01`, from `User.internal_id`) is
NOT PII and must stay present in both the roster and the activity feed even
when archived -- the instructor needs it to open a session. Email is never
scrubbed from the `users` table itself (it also doubles as the login
username); archival only suppresses it in that group's own responses. There
is no unarchive route -- once a group is archived it stays archived, and the
suppression above is permanent for that group.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-archival-pii-contract-"))
    os.environ.update(
        {
            "PORTAL_DB_PATH": str(temp_dir / "portal.db"),
            "EVENT_LOG_PATH": str(temp_dir / "events.jsonl"),
            "RESULTS_DIR": str(temp_dir / "results"),
            "LABS_DIR": str(ROOT / "labs"),
            "ENABLE_SCHEDULER": "false",
        }
    )

    from app import feedback  # noqa: PLC0415
    from app import repository as repo  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.main import app  # noqa: PLC0415
    from app.models import GroupLab, GroupMember, User  # noqa: PLC0415
    from fastapi.testclient import TestClient  # noqa: PLC0415

    init_db()

    lab_id = "redis-exposed"
    student_email = "archival-pii-student@example.invalid"
    student_password = "archival-pii-student-password"
    instructor_email = "archival-pii-instructor@example.invalid"
    instructor_password = "archival-pii-instructor-password"

    with SessionLocal() as session:
        instructor = User(
            email=instructor_email,
            password_hash=repo.hash_password(instructor_password),
            role="instructor",
        )
        student = User(
            email=student_email,
            password_hash=repo.hash_password(student_password),
            role="student",
            internal_id="student01",
            number=1,
            lab_password="workstation-test-password",
            study_program="Informatik",
        )
        session.add_all([instructor, student])
        session.flush()

        group = repo.create_group(
            session, "Archival PII contract group", instructor.id, semester="SS 2026"
        )
        session.add(GroupMember(group_id=group.id, user_id=student.id, status="approved"))
        session.add(GroupLab(group_id=group.id, lab_id=lab_id))
        session.flush()
        group_id = group.id
        student_internal_id = student.internal_id
        session.commit()

    # A lifecycle event so the "recent activity" feed is non-empty.
    feedback.save_lifecycle_event(
        action="start",
        lab_id=lab_id,
        student_id=student_internal_id,
        actor=student_internal_id,
        result="success",
    )

    with TestClient(app) as client:
        login = client.post(
            "/api/login", json={"username": instructor_email, "password": instructor_password}
        )
        assert login.status_code == 200, login.text

        # --- 1. Unarchived baseline: email IS present, so the test would
        # actually catch a regression rather than passing vacuously. ---
        detail = client.get(f"/api/instructor/groups/{group_id}")
        assert detail.status_code == 200, detail.text
        payload = detail.json()
        assert payload["is_archived"] is False

        approved = payload["approved_members"]
        assert len(approved) == 1
        assert approved[0]["email"] == student_email
        assert approved[0]["student_id"] == student_internal_id

        activity = payload["recent_activity"]
        assert len(activity) == 1
        assert activity[0]["student_email"] == student_email
        assert activity[0]["student_id"] == student_internal_id

        csrf_token = payload["csrf_token"]

        # --- Archive the group. ---
        archive_resp = client.post(
            f"/api/instructor/groups/{group_id}/archive",
            json={"csrf_token": csrf_token},
        )
        assert archive_resp.status_code == 200, archive_resp.text
        assert archive_resp.json()["is_archived"] is True

        detail = client.get(f"/api/instructor/groups/{group_id}")
        assert detail.status_code == 200, detail.text
        payload = detail.json()
        assert payload["is_archived"] is True

        # --- 2. Archived: roster redacted. ---
        approved = payload["approved_members"]
        assert len(approved) == 1
        assert approved[0]["email"] is None
        assert approved[0]["study_program"] is None

        # --- 3. Archived: activity feed redacted (the specific bug found). ---
        activity = payload["recent_activity"]
        assert len(activity) == 1
        assert activity[0]["student_email"] is None

        # --- 4. Archived: no email anywhere in the payload -- the strongest
        # assertion, and the one that would have caught both leaks at once. ---
        raw_body = detail.text
        assert student_email not in raw_body
        assert student_email not in json.dumps(payload)

        # --- 5. Archived: student_id survives in both roster and activity,
        # so the instructor can still navigate. ---
        assert approved[0]["student_id"] == student_internal_id
        assert activity[0]["student_id"] == student_internal_id

        csrf_token = payload["csrf_token"]

        # --- _group_to_dict leak (main.py ~1985): exercised via the real
        # add-member route, re-adding the already-approved student to the
        # now-archived group. repo.add_member has no archival gate (only
        # request_membership does), so this hits the same code path a real
        # instructor action would. ---
        add_member_resp = client.post(
            f"/api/instructor/groups/{group_id}/members",
            json={"student_id": student_internal_id, "csrf_token": csrf_token},
        )
        assert add_member_resp.status_code == 200, add_member_resp.text
        add_member_payload = add_member_resp.json()
        assert add_member_payload["is_archived"] is True
        members = add_member_payload["members"]
        assert len(members) == 1
        assert members[0]["student_id"] == student_internal_id
        assert members[0]["email"] is None
        assert student_email not in json.dumps(add_member_payload)

        # --- 6. Permanent: there is no unarchive route any more, and the
        # archived state persists across requests -- nothing can undo it. ---
        unarchive_resp = client.post(
            f"/api/instructor/groups/{group_id}/unarchive",
            json={"csrf_token": csrf_token},
        )
        assert unarchive_resp.status_code == 404, unarchive_resp.text

        detail = client.get(f"/api/instructor/groups/{group_id}")
        assert detail.status_code == 200, detail.text
        payload = detail.json()
        assert payload["is_archived"] is True

        approved = payload["approved_members"]
        assert len(approved) == 1
        assert approved[0]["email"] is None
        assert approved[0]["study_program"] is None

        activity = payload["recent_activity"]
        assert len(activity) == 1
        assert activity[0]["student_email"] is None

    print("OK")


if __name__ == "__main__":
    main()
