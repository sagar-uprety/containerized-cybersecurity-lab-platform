"""Explicit destructive loader for canonical synthetic portal evidence."""

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
from app.config import settings
from app.db import SessionLocal, init_db
from app.feedback import sync_assignment_obligations
from app.models import (
    AssignmentObligation,
    Base,
    CheckAttempt,
    CheckObligation,
    CriterionObservation,
    FeedbackResponse,
    Group,
    GroupLab,
    GroupMember,
    Intervention,
    LabSession,
    LifecycleEvidence,
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


def replace_with_demo_data(data_path: Path, credentials_path: Path) -> dict:
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1:
        raise ValueError("Unsupported demo data schema")
    init_db()
    credentials = []
    user_ids = {}
    group_ids = {}
    group_lab_ids = {}
    with SessionLocal() as session:
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(delete(table))
        session.commit()

        instructor_password = _password()
        instructor = User(
            email="instructor@thesis.local",
            password_hash=repo.hash_password(instructor_password),
            role="instructor",
            active=True,
            must_change_password=False,
            synthetic=True,
        )
        session.add(instructor)
        credentials.append(
            {
                "role": "instructor",
                "email": instructor.email,
                "student_id": "",
                "portal_password": instructor_password,
                "workstation_password": "",
            }
        )
        for item in payload["users"]:
            portal_password = _password()
            lab_password = _password()
            user = User(
                email=item["email"],
                password_hash=repo.hash_password(portal_password),
                role="student",
                internal_id=item["internal_id"],
                number=item["number"],
                lab_password=lab_password,
                semester=item.get("semester"),
                study_program=item.get("study_program"),
                active=True,
                must_change_password=False,
                synthetic=True,
                created_at=_dt(payload["generated_at"]),
            )
            session.add(user)
            session.flush()
            user_ids[item["id"]] = user.id
            credentials.append(
                {
                    "role": "student",
                    "email": user.email,
                    "student_id": user.internal_id,
                    "portal_password": portal_password,
                    "workstation_password": lab_password,
                }
            )
        for item in payload["groups"]:
            group = Group(
                id=item["id"],
                name=item["name"],
                semester=item["semester"],
                is_active=bool(item.get("is_active", True)),
                created_at=_dt(item["created_at"]),
                synthetic=True,
            )
            session.add(group)
            group_ids[item["id"]] = group.id
        session.flush()
        for item in payload["memberships"]:
            session.add(
                GroupMember(
                    group_id=group_ids[item["group_id"]],
                    user_id=user_ids[item["user_id"]],
                    status=item["status"],
                    requested_at=_dt(item["requested_at"]),
                    approved_at=_dt(item.get("approved_at")),
                    synthetic=True,
                )
            )
        for item in payload["group_labs"]:
            group_lab = GroupLab(
                id=item["id"],
                group_id=group_ids[item["group_id"]],
                lab_id=item["lab_id"],
                deadline=_dt(item.get("deadline")),
                assigned_at=_dt(item["assigned_at"]),
                synthetic=True,
            )
            session.add(group_lab)
            group_lab_ids[item["id"]] = group_lab.id
        session.commit()

    sync_assignment_obligations()
    with SessionLocal() as session:
        obligations = session.scalars(select(AssignmentObligation)).all()
        obligation_map = {
            (item.group_id, item.student_id, item.lab_id): item for item in obligations
        }
        for item in payload["sessions"]:
            lab_session = LabSession(
                id=item["id"],
                student_id=item["student_id"],
                lab_id=item["lab_id"],
                started_at=_dt(item["started_at"]),
                ended_at=_dt(item.get("ended_at")),
                outcome=item["outcome"],
                close_reason=item.get("close_reason"),
                synthetic=True,
            )
            session.add(lab_session)
            obligation = obligation_map.get((item["group_id"], item["student_id"], item["lab_id"]))
            if obligation:
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
            check_result = item["check_result"]
            session.add(
                CheckAttempt(
                    id=item["id"],
                    session_id=item.get("session_id"),
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    actor_id=item["actor_id"],
                    actor_type=item["actor_type"],
                    phase=item["phase"],
                    scenario_version="1",
                    checker_version=check_result["checker_version"],
                    overall_state=check_result["status"],
                    passed=check_result["passed"],
                    occurred_at=_dt(item["occurred_at"]),
                    operation_duration_seconds=item["operation_duration_seconds"],
                    synthetic=True,
                )
            )
            session.flush()
            obligation = obligation_map.get((item["group_id"], item["student_id"], item["lab_id"]))
            if obligation:
                session.add(CheckObligation(check_id=item["id"], assignment_id=obligation.id))
            for criterion in check_result["checks"]:
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
                    lab_session_id=item.get("lab_session_id"),
                    terminal_session_id=item.get("terminal_session_id"),
                    student_id=item["student_id"],
                    lab_id=item["lab_id"],
                    event=item["event"],
                    command=item.get("command"),
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
        for item in payload["interventions"]:
            session.add(
                Intervention(
                    student_id=item["student_id"],
                    group_id=item["group_id"],
                    lab_id=item.get("lab_id"),
                    reason=item["reason"],
                    note=item["note"],
                    owner=item["owner"],
                    status=item["status"],
                    follow_up_at=_dt(item.get("follow_up_at")),
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

    evidence_dir = Path(settings.PORTAL_DB_PATH).parent / "evidence"
    for name in (
        "feedback-responses.jsonl",
        "check-results.jsonl",
        "lifecycle-events.jsonl",
        "command-events.jsonl",
    ):
        (evidence_dir / name).unlink(missing_ok=True)
    Path(settings.PORTAL_DB_PATH).with_name("portal-runtime-state.json").unlink(missing_ok=True)
    return {
        "users": len(payload["users"]) + 1,
        "groups": len(payload["groups"]),
        "sessions": len(payload["sessions"]),
        "checks": len(payload["checks"]),
        "credentials_path": str(credentials_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace", action="store_true", required=True)
    parser.add_argument("--data", type=Path, default=Path(settings.PORTAL_DEMO_DATA_PATH))
    parser.add_argument(
        "--credentials",
        type=Path,
        default=Path(settings.PORTAL_DB_PATH).with_name("demo-credentials.csv"),
    )
    args = parser.parse_args()
    sys.stdout.write(
        json.dumps(replace_with_demo_data(args.data, args.credentials), indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
