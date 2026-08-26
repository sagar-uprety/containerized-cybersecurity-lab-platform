"""Append a fixed student-id range to the live survey group."""

from __future__ import annotations

import argparse
import csv
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app import repository as repo
from app.db import SessionLocal, init_db
from app.models import AssignmentObligation, Group, GroupLab, GroupMember, User
from app.obligations import obligation_id


def _email() -> str:
    return f"student-{secrets.token_hex(4)}@uni.de"


def append_survey_students(
    *, group_name: str, semester: str, start_number: int, count: int, credentials_path: Path
) -> dict:
    if start_number < 1 or count < 1 or start_number + count - 1 > 9999:
        raise ValueError("Student number range must stay between 1 and 9999")
    if credentials_path.exists():
        raise ValueError(f"Credentials file already exists: {credentials_path}")

    init_db()
    credentials = []
    temporary_path = credentials_path.with_suffix(credentials_path.suffix + ".tmp")
    temporary_path.unlink(missing_ok=True)

    try:
        with SessionLocal.begin() as session:
            group = session.scalar(select(Group).where(Group.name == group_name))
            if group is None:
                raise ValueError(f"Required group not found: {group_name}")
            if group.is_archived:
                raise ValueError(f"Cannot add students to archived group: {group_name}")
            if group.semester != semester:
                raise ValueError(f"Group semester is {group.semester!r}, expected {semester!r}")

            numbers = list(range(start_number, start_number + count))
            internal_ids = [repo.internal_id_from_number(number) for number in numbers]
            collisions = session.scalars(
                select(User).where(
                    (User.number.in_(numbers)) | (User.internal_id.in_(internal_ids))
                )
            ).all()
            if collisions:
                values = ", ".join(item.internal_id or item.email for item in collisions)
                raise ValueError(f"Student range already exists: {values}")

            group_labs = session.scalars(
                select(GroupLab).where(GroupLab.group_id == group.id)
            ).all()
            approved_at = datetime.now(timezone.utc)
            generated_emails = set()

            for number, internal_id in zip(numbers, internal_ids):
                email = _email()
                while email in generated_emails or repo.get_user_by_email(session, email):
                    email = _email()
                generated_emails.add(email)

                portal_password = repo.generate_password()
                student = User(
                    email=email,
                    password_hash=repo.hash_password(portal_password),
                    role="student",
                    internal_id=internal_id,
                    number=number,
                    lab_password=repo.generate_password(),
                    semester=semester,
                    active=True,
                    must_change_password=True,
                    synthetic=False,
                )
                session.add(student)
                session.flush()
                session.add(
                    GroupMember(
                        group_id=group.id,
                        user_id=student.id,
                        status="approved",
                        requested_at=approved_at,
                        approved_at=approved_at,
                        synthetic=False,
                    )
                )
                for group_lab in group_labs:
                    assigned_at = group_lab.assigned_at or approved_at
                    eligible_at = max(
                        assigned_at.replace(tzinfo=timezone.utc)
                        if assigned_at.tzinfo is None
                        else assigned_at.astimezone(timezone.utc),
                        approved_at,
                    )
                    session.add(
                        AssignmentObligation(
                            id=obligation_id(group_lab.id, student.id),
                            group_lab_id=group_lab.id,
                            group_id=group.id,
                            user_id=student.id,
                            student_id=internal_id,
                            lab_id=group_lab.lab_id,
                            assigned_at=assigned_at,
                            eligible_at=eligible_at,
                            deadline=group_lab.deadline,
                            synthetic=False,
                        )
                    )
                credentials.append(
                    {
                        "role": "student",
                        "email": email,
                        "portal_password": portal_password,
                        "student_id": internal_id,
                        "semester": semester,
                        "group": group_name,
                        "must_change_password": "true",
                    }
                )

            credentials_path.parent.mkdir(parents=True, exist_ok=True)
            with temporary_path.open("x", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(credentials[0]))
                writer.writeheader()
                writer.writerows(credentials)
            temporary_path.chmod(0o600)

        temporary_path.replace(credentials_path)
        credentials_path.chmod(0o600)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise

    return {
        "students": len(credentials),
        "first_student_id": credentials[0]["student_id"],
        "last_student_id": credentials[-1]["student_id"],
        "credentials_path": str(credentials_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", required=True)
    parser.add_argument("--semester", required=True)
    parser.add_argument("--start-number", type=int, required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--credentials", type=Path, required=True)
    args = parser.parse_args()
    result = append_survey_students(
        group_name=args.group,
        semester=args.semester,
        start_number=args.start_number,
        count=args.count,
        credentials_path=args.credentials,
    )
    sys.stdout.write(f"{result}\n")


if __name__ == "__main__":
    main()
