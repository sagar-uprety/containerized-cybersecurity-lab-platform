"""Contract checks for targeted domain demo cohort seeding."""

from __future__ import annotations

import csv
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-domain-demo-contract-"))
    os.environ["PORTAL_DB_PATH"] = str(temp_dir / "portal.db")
    os.environ["EVENT_LOG_PATH"] = str(temp_dir / "events.jsonl")
    os.environ["RESULTS_DIR"] = str(temp_dir / "results")
    os.environ["LABS_DIR"] = str(ROOT / "labs")

    from app import domain_demo_seed  # noqa: PLC0415
    from app import repository as repo  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.models import (  # noqa: PLC0415
        CheckAttempt,
        Group,
        GroupLab,
        GroupMember,
        LabSession,
        RuntimeLease,
        TerminalCommand,
        User,
    )
    from sqlalchemy import func, select  # noqa: PLC0415

    data_path = API_ROOT / "domain-demo-data.json"
    payload = __import__("json").loads(data_path.read_text(encoding="utf-8"))
    credentials_path = temp_dir / "domain-demo-credentials.csv"

    init_db()
    repo.hash_password = lambda password: f"test-hash:{password}"  # type: ignore[assignment]
    domain_demo_seed._password = lambda: "test-generated-password"  # type: ignore[assignment]

    with SessionLocal() as session:
        owners = {}
        for item in payload["groups"]:
            owner = User(
                email=item["owner_email"],
                password_hash="old-hash",
                role="instructor",
            )
            session.add(owner)
            session.flush()
            owners[item["owner_email"]] = owner
            group = Group(
                name=item["name"],
                semester=item["semester"],
                owner_id=owner.id,
            )
            session.add(group)
            session.flush()
            for lab_id in item["labs"]:
                session.add(GroupLab(group_id=group.id, lab_id=lab_id))

        archive_owner = next(iter(owners.values()))
        for name in payload["archive_groups"]:
            session.add(Group(name=name, semester="SS 2027", owner_id=archive_owner.id))

        survey_owner = User(
            email="survey-instructor@example.invalid",
            password_hash="survey-hash",
            role="instructor",
        )
        survey_student = User(
            email="survey-student@example.invalid",
            password_hash="survey-student-hash",
            role="student",
            internal_id="student7000",
            number=7000,
            lab_password="survey-workstation-password",
            semester="Summer Semester 2026",
        )
        session.add_all([survey_owner, survey_student])
        session.flush()
        survey_group = Group(
            name="System Security (Survey)",
            semester="Summer Semester 2026",
            owner_id=survey_owner.id,
        )
        session.add(survey_group)
        session.flush()
        session.add(
            GroupMember(group_id=survey_group.id, user_id=survey_student.id, status="approved")
        )

        old_demo_student = User(
            email="old.demo@tum.de",
            password_hash="old-demo-hash",
            role="student",
            internal_id="student7999",
            number=7999,
            lab_password="old-demo-workstation-password",
            synthetic=True,
        )
        session.add(old_demo_student)
        session.flush()
        first_target = session.scalar(
            select(Group).where(Group.name == payload["groups"][0]["name"])
        )
        session.add(
            GroupMember(
                group_id=first_target.id,
                user_id=old_demo_student.id,
                status="pending",
            )
        )
        session.commit()

    result = domain_demo_seed.merge_domain_demo_data(data_path, credentials_path)
    assert result["instructors"] == 4
    assert result["students"] == 119
    assert result["sessions"] == len(payload["sessions"])
    assert credentials_path.stat().st_mode & 0o777 == 0o600

    generated_at = datetime.fromisoformat(payload["generated_at"].replace("Z", "+00:00"))
    with SessionLocal() as session:
        for name in payload["archive_groups"]:
            assert session.scalar(select(Group).where(Group.name == name)).is_archived is True

        survey = session.scalar(select(Group).where(Group.name == "System Security (Survey)"))
        assert survey.semester == "SS 2026"
        assert (
            session.scalar(
                select(func.count())
                .select_from(GroupMember)
                .where(GroupMember.group_id == survey.id)
            )
            == 1
        )
        assert (
            session.scalar(select(User).where(User.email == "survey-student@example.invalid"))
            is not None
        )

        for item in payload["groups"]:
            group = session.scalar(select(Group).where(Group.name == item["name"]))
            member_count = session.scalar(
                select(func.count())
                .select_from(GroupMember)
                .where(
                    GroupMember.group_id == group.id,
                    GroupMember.status == "approved",
                )
            )
            assert member_count == item["size"]
            owner = session.get(User, group.owner_id)
            assert owner.password_hash == "test-hash:test-generated-password"

        target_group_ids = session.scalars(
            select(Group.id).where(Group.name.in_([item["name"] for item in payload["groups"]]))
        ).all()
        assert session.scalar(
            select(func.count())
            .select_from(GroupMember)
            .where(GroupMember.group_id.in_(target_group_ids))
        ) == len(payload["users"])

        assert session.scalar(select(func.count()).select_from(RuntimeLease)) == 0
        assert session.scalar(select(func.count()).select_from(LabSession)) == len(
            payload["sessions"]
        )
        assert session.scalar(select(func.count()).select_from(CheckAttempt)) == len(
            payload["checks"]
        )
        assert session.scalar(select(func.count()).select_from(TerminalCommand)) == len(
            payload["commands"]
        )
        all_sessions = session.scalars(select(LabSession)).all()
        assert all(item.ended_at is not None for item in all_sessions)
        assert all(
            item.ended_at.replace(tzinfo=timezone.utc) < generated_at for item in all_sessions
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(GroupMember)
                .join(User)
                .where(
                    GroupMember.group_id.in_(
                        select(Group.id).where(
                            Group.name.in_([g["name"] for g in payload["groups"]])
                        )
                    ),
                    User.email == "old.demo@tum.de",
                )
            )
            == 0
        )

    with credentials_path.open(encoding="utf-8", newline="") as handle:
        credentials = list(csv.DictReader(handle))
    assert len(credentials) == 123
    assert sum(row["role"] == "instructor" for row in credentials) == 4
    assert sum(row["role"] == "student" for row in credentials) == 119
    assert {row["group"] for row in credentials} == {item["name"] for item in payload["groups"]}
    assert not any("survey" in row["email"] for row in credentials)

    print("OK")


if __name__ == "__main__":
    main()
