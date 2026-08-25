"""Targeted, rerunnable loader for historical domain-group demo cohorts."""

from __future__ import annotations

import argparse
import csv
import json
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select

from app import repository as repo
from app.db import SessionLocal, init_db
from app.feedback import sync_assignment_obligations
from app.models import (
    AssignmentObligation,
    CheckAttempt,
    CheckObligation,
    CriterionObservation,
    FeedbackResponse,
    Group,
    GroupLab,
    GroupMember,
    LabSession,
    LifecycleEvidence,
    RuntimeLease,
    SessionObligation,
    TerminalCommand,
    User,
)


def _dt(value):
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)


def _password() -> str:
    return secrets.token_urlsafe(15)


def _one_group(session, name: str) -> Group:
    group = session.scalar(select(Group).where(Group.name == name))
    if group is None:
        raise ValueError(f"Required group not found: {name}")
    return group


def _delete_previous_domain_users(session, payload: dict, group_ids: list[int]) -> None:
    emails = [item["email"] for item in payload["users"]]
    previous_users = session.scalars(select(User).where(User.email.in_(emails))).all()
    previous_user_ids = [item.id for item in previous_users]
    previous_student_ids = [item.internal_id for item in previous_users if item.internal_id]

    session_ids = session.scalars(
        select(LabSession.id).where(LabSession.group_id.in_(group_ids))
    ).all()
    if session_ids:
        check_ids = session.scalars(
            select(CheckAttempt.id).where(CheckAttempt.session_id.in_(session_ids))
        ).all()
        if check_ids:
            session.execute(
                delete(CriterionObservation).where(CriterionObservation.check_id.in_(check_ids))
            )
            session.execute(delete(CheckObligation).where(CheckObligation.check_id.in_(check_ids)))
        session.execute(
            delete(SessionObligation).where(SessionObligation.session_id.in_(session_ids))
        )
        session.execute(
            delete(FeedbackResponse).where(FeedbackResponse.lab_session_id.in_(session_ids))
        )
        session.execute(
            delete(TerminalCommand).where(TerminalCommand.lab_session_id.in_(session_ids))
        )
        session.execute(
            delete(LifecycleEvidence).where(LifecycleEvidence.session_id.in_(session_ids))
        )
        session.execute(delete(CheckAttempt).where(CheckAttempt.session_id.in_(session_ids)))
        session.execute(delete(LabSession).where(LabSession.id.in_(session_ids)))

    if previous_student_ids:
        session.execute(
            delete(FeedbackResponse).where(FeedbackResponse.student_id.in_(previous_student_ids))
        )
        session.execute(
            delete(TerminalCommand).where(TerminalCommand.student_id.in_(previous_student_ids))
        )
        session.execute(
            delete(LifecycleEvidence).where(LifecycleEvidence.student_id.in_(previous_student_ids))
        )
        session.execute(
            delete(CheckAttempt).where(CheckAttempt.student_id.in_(previous_student_ids))
        )

    member_user_ids = session.scalars(
        select(GroupMember.user_id).where(GroupMember.group_id.in_(group_ids))
    ).all()
    if member_user_ids:
        session.execute(
            delete(AssignmentObligation).where(
                AssignmentObligation.group_id.in_(group_ids),
                AssignmentObligation.user_id.in_(member_user_ids),
            )
        )
    session.execute(delete(GroupMember).where(GroupMember.group_id.in_(group_ids)))
    session.execute(delete(RuntimeLease).where(RuntimeLease.group_id.in_(group_ids)))
    if previous_user_ids:
        session.execute(
            delete(User).where(User.id.in_(previous_user_ids), User.synthetic.is_(True))
        )
    session.flush()


def merge_domain_demo_data(data_path: Path, credentials_path: Path) -> dict:
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise ValueError("Unsupported domain demo data schema")
    init_db()
    credentials = []
    user_ids = {}
    group_ids = {}

    with SessionLocal() as session:
        for name in payload["archive_groups"]:
            group = _one_group(session, name)
            if not group.is_archived:
                repo.archive_group(session, group.id)

        for name, semester in payload.get("semester_updates", {}).items():
            _one_group(session, name).semester = semester

        for item in payload["groups"]:
            group = _one_group(session, item["name"])
            owner = session.scalar(select(User).where(User.email == item["owner_email"]))
            if owner is None or owner.role not in {"instructor", "admin"}:
                raise ValueError(f"Required instructor not found: {item['owner_email']}")
            if group.owner_id != owner.id:
                raise ValueError(f"Instructor does not own group: {item['name']}")
            actual_labs = set(
                session.scalars(select(GroupLab.lab_id).where(GroupLab.group_id == group.id)).all()
            )
            if actual_labs != set(item["labs"]):
                raise ValueError(f"Lab assignments do not match domain fixture: {item['name']}")
            group.semester = item["semester"]
            group_ids[item["name"]] = group.id

        running_lease = session.scalar(
            select(RuntimeLease.id).where(
                RuntimeLease.group_id.in_(list(group_ids.values())),
                RuntimeLease.status == "running",
            )
        )
        if running_lease is not None:
            raise ValueError("Cannot replace domain cohorts while a target-group lab is running")

        _delete_previous_domain_users(session, payload, list(group_ids.values()))

        for item in payload["groups"]:
            instructor = session.scalar(select(User).where(User.email == item["owner_email"]))
            portal_password = _password()
            repo.set_password(session, instructor, portal_password)
            instructor.active = True
            instructor.must_change_password = False
            credentials.append(
                {
                    "role": "instructor",
                    "email": instructor.email,
                    "portal_password": portal_password,
                    "workstation_password": "",
                    "student_id": "",
                    "semester": item["semester"],
                    "group": item["name"],
                    "must_change_password": False,
                }
            )

        for item in payload["users"]:
            portal_password = _password()
            workstation_password = _password()
            user = User(
                email=item["email"],
                password_hash=repo.hash_password(portal_password),
                role="student",
                internal_id=item["internal_id"],
                number=item["number"],
                lab_password=workstation_password,
                semester=item["semester"],
                study_program=item["study_program"],
                active=True,
                must_change_password=False,
                synthetic=True,
                created_at=_dt(item["created_at"]),
            )
            session.add(user)
            session.flush()
            user_ids[item["internal_id"]] = user.id
            session.add(
                GroupMember(
                    group_id=group_ids[item["group_name"]],
                    user_id=user.id,
                    status="approved",
                    requested_at=_dt(item["requested_at"]),
                    approved_at=_dt(item["approved_at"]),
                    synthetic=True,
                )
            )
            credentials.append(
                {
                    "role": "student",
                    "email": user.email,
                    "portal_password": portal_password,
                    "workstation_password": workstation_password,
                    "student_id": user.internal_id,
                    "semester": item["semester"],
                    "group": item["group_name"],
                    "must_change_password": False,
                }
            )

        for item in payload["assignments"]:
            group_id = group_ids[item["group_name"]]
            assignment = session.scalar(
                select(GroupLab).where(
                    GroupLab.group_id == group_id, GroupLab.lab_id == item["lab_id"]
                )
            )
            assignment.assigned_at = _dt(item["assigned_at"])
            assignment.deadline = _dt(item["deadline"])
        session.commit()

    sync_assignment_obligations()
    with SessionLocal() as session:
        obligations = session.scalars(
            select(AssignmentObligation).where(
                AssignmentObligation.group_id.in_(list(group_ids.values())),
                AssignmentObligation.user_id.in_(list(user_ids.values())),
            )
        ).all()
        obligation_map = {
            (item.group_id, item.student_id, item.lab_id): item for item in obligations
        }

        for item in payload["sessions"]:
            group_id = group_ids[item["group_name"]]
            session.add(
                LabSession(
                    id=item["id"],
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    group_id=group_id,
                    started_at=_dt(item["started_at"]),
                    ended_at=_dt(item["ended_at"]),
                    outcome=item["outcome"],
                    close_reason=item["close_reason"],
                    synthetic=True,
                )
            )
            obligation = obligation_map[(group_id, item["student_id"], item["lab_id"])]
            session.add(SessionObligation(session_id=item["id"], assignment_id=obligation.id))
        session.flush()

        for item in payload["lifecycle_events"]:
            session.add(
                LifecycleEvidence(
                    id=item["id"],
                    session_id=item.get("session_id"),
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    actor_id=item["actor_id"],
                    actor_type=item["actor_type"],
                    action=item["action"],
                    result=item["result"],
                    reason=item.get("reason"),
                    occurred_at=_dt(item["occurred_at"]),
                    operation_duration_seconds=item.get("operation_duration_seconds"),
                    synthetic=True,
                )
            )

        for item in payload["checks"]:
            result = item["check_result"]
            session.add(
                CheckAttempt(
                    id=item["id"],
                    session_id=item["session_id"],
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    actor_id=item["actor_id"],
                    actor_type=item["actor_type"],
                    phase=item["phase"],
                    scenario_version="1",
                    checker_version=result["checker_version"],
                    overall_state=result["status"],
                    passed=result["passed"],
                    occurred_at=_dt(item["occurred_at"]),
                    operation_duration_seconds=item["operation_duration_seconds"],
                    synthetic=True,
                )
            )
            session.flush()
            obligation = obligation_map[
                (group_ids[item["group_name"]], item["student_id"], item["lab_id"])
            ]
            session.add(CheckObligation(check_id=item["id"], assignment_id=obligation.id))
            for criterion in result["checks"]:
                session.add(
                    CriterionObservation(
                        check_id=item["id"],
                        name=criterion["name"],
                        label=criterion["label"],
                        kind=criterion["kind"],
                        observed_state=criterion["observed_state"],
                        passed=criterion["passed"],
                        exit_code=criterion.get("exit_code"),
                        matched_states=json.dumps(criterion.get("matched_states", [])),
                        output=criterion.get("output"),
                    )
                )

        for item in payload["commands"]:
            session.add(
                TerminalCommand(
                    id=item["id"],
                    lab_session_id=item["lab_session_id"],
                    terminal_session_id=item["terminal_session_id"],
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    event=item["event"],
                    command=item["command"],
                    occurred_at=_dt(item["occurred_at"]),
                    synthetic=True,
                )
            )

        for item in payload["feedback"]:
            session.add(
                FeedbackResponse(
                    id=item["id"],
                    lab_session_id=item["lab_session_id"],
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    section_a=item["section_a"],
                    rating=item["section_b_rating"],
                    comment=item["section_b"],
                    issue_category=item.get("issue_category"),
                    occurred_at=_dt(item["occurred_at"]),
                    synthetic=True,
                )
            )
        session.commit()

    credentials_path.parent.mkdir(parents=True, exist_ok=True)
    with credentials_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(credentials[0]))
        writer.writeheader()
        writer.writerows(credentials)
    credentials_path.chmod(0o600)
    return {
        "instructors": len(payload["groups"]),
        "students": len(payload["users"]),
        "sessions": len(payload["sessions"]),
        "checks": len(payload["checks"]),
        "commands": len(payload["commands"]),
        "credentials_path": str(credentials_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--credentials", type=Path, required=True)
    args = parser.parse_args()
    sys.stdout.write(
        json.dumps(merge_domain_demo_data(args.data, args.credentials), indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
