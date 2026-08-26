"""Contract checks for append-only survey student provisioning."""

from __future__ import annotations

import csv
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-survey-student-seed-"))
    os.environ["PORTAL_DB_PATH"] = str(temp_dir / "portal.db")
    os.environ["EVENT_LOG_PATH"] = str(temp_dir / "events.jsonl")
    os.environ["RESULTS_DIR"] = str(temp_dir / "results")
    os.environ["LABS_DIR"] = str(ROOT / "labs")

    from app import repository as repo  # noqa: PLC0415
    from app import survey_student_seed  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.models import (  # noqa: PLC0415
        AssignmentObligation,
        Group,
        GroupLab,
        GroupMember,
        User,
    )
    from sqlalchemy import func, select  # noqa: PLC0415

    init_db()
    repo.hash_password = lambda password: f"test-hash:{password}"  # type: ignore[assignment]
    passwords = iter(f"password-{index:02d}" for index in range(100))
    repo.generate_password = lambda: next(passwords)  # type: ignore[assignment]
    emails = iter(f"student-{index:08x}@uni.de" for index in range(100))
    survey_student_seed._email = lambda: next(emails)  # type: ignore[assignment]

    with SessionLocal.begin() as session:
        owner = User(email="survey-instructor@tum.de", password_hash="owner", role="instructor")
        session.add(owner)
        session.flush()
        group = Group(name="System Security (Survey)", semester="SS 2026", owner_id=owner.id)
        session.add(group)
        session.flush()
        session.add(GroupLab(group_id=group.id, lab_id="survey-nginx-hardening"))
        for number in range(83, 113):
            student = User(
                email=f"existing-{number}@uni.de",
                password_hash=f"existing-hash-{number}",
                role="student",
                internal_id=f"student{number}",
                number=number,
                lab_password=f"existing-lab-{number}",
                semester="Summer Semester 2026",
                must_change_password=number >= 90,
            )
            session.add(student)
            session.flush()
            session.add(GroupMember(group_id=group.id, user_id=student.id, status="approved"))

    with SessionLocal() as session:
        existing_before = session.execute(
            select(
                User.id,
                User.email,
                User.password_hash,
                User.lab_password,
                User.semester,
                User.must_change_password,
            ).where(User.number.between(83, 112))
        ).all()

    credentials_path = temp_dir / "new-survey-credentials.csv"
    result = survey_student_seed.append_survey_students(
        group_name="System Security (Survey)",
        semester="SS 2026",
        start_number=113,
        count=15,
        credentials_path=credentials_path,
    )
    assert result["students"] == 15
    assert credentials_path.stat().st_mode & 0o777 == 0o600

    with credentials_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 15
    assert [row["student_id"] for row in rows] == [f"student{i}" for i in range(113, 128)]
    assert all(
        row["email"].startswith("student-") and row["email"].endswith("@uni.de") for row in rows
    )
    assert all(row["must_change_password"] == "true" for row in rows)

    with SessionLocal() as session:
        existing_after = session.execute(
            select(
                User.id,
                User.email,
                User.password_hash,
                User.lab_password,
                User.semester,
                User.must_change_password,
            ).where(User.number.between(83, 112))
        ).all()
        assert existing_after == existing_before
        new_users = session.scalar(
            select(func.count()).select_from(User).where(User.number.between(113, 127))
        )
        new_memberships = session.scalar(
            select(func.count())
            .select_from(GroupMember)
            .join(User, User.id == GroupMember.user_id)
            .where(User.number.between(113, 127), GroupMember.status == "approved")
        )
        new_obligations = session.scalar(
            select(func.count())
            .select_from(AssignmentObligation)
            .where(AssignmentObligation.student_id.in_([f"student{i}" for i in range(113, 128)]))
        )
        assert new_users == 15
        assert new_memberships == 15
        assert new_obligations == 15

    try:
        survey_student_seed.append_survey_students(
            group_name="System Security (Survey)",
            semester="SS 2026",
            start_number=113,
            count=15,
            credentials_path=temp_dir / "collision.csv",
        )
    except ValueError as exc:
        assert "already exists" in str(exc)
    else:
        raise AssertionError("Expected existing student range to be rejected")

    print("portal survey student seed contract: ok")


if __name__ == "__main__":
    main()
