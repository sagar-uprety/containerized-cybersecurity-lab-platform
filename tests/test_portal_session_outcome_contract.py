"""Contract checks for persisted session outcomes and close reasons."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-session-outcome-contract-"))
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
    from app.analytics import student_detail  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.feedback import (  # noqa: PLC0415
        any_pending_feedback,
        close_lab_session,
        create_lab_session,
    )
    from app.models import Group, GroupLab, GroupMember, User  # noqa: PLC0415

    init_db()
    student_id = "student998"
    lab_id = "redis-exposed"
    with SessionLocal() as session:
        student = User(
            email="session-outcome@example.invalid",
            password_hash=repo.hash_password("session-outcome-password"),
            role="student",
            internal_id=student_id,
            number=998,
            lab_password="workstation-test-password",
        )
        group = Group(name="Session outcome contract group")
        session.add_all([student, group])
        session.flush()
        session.add_all(
            [
                GroupMember(group_id=group.id, user_id=student.id, status="approved"),
                GroupLab(group_id=group.id, lab_id=lab_id),
            ]
        )
        session.commit()

    create_lab_session("idle-session", lab_id, student_id)
    close_lab_session("idle-session", "auto_stop", "idle")
    create_lab_session("runtime-session", lab_id, student_id)
    close_lab_session("runtime-session", "auto_stop", "max_runtime")
    create_lab_session("stopped-session", lab_id, student_id)
    close_lab_session("stopped-session", "stop", "student_stop")

    sessions = student_detail(student_id)["labs"][0]["sessions"]
    by_id = {item["session_id"]: item for item in sessions}
    assert by_id["idle-session"]["close_reason"] == "idle"
    assert by_id["runtime-session"]["close_reason"] == "max_runtime"
    assert by_id["stopped-session"]["outcome"] == "stop"
    assert any_pending_feedback(student_id)


if __name__ == "__main__":
    main()
