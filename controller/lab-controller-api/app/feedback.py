import io
import json
import tarfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AssignmentObligation,
    CheckAttempt,
    CheckObligation,
    CriterionObservation,
    FeedbackResponse,
    GroupLab,
    GroupMember,
    LabSession,
    LifecycleEvidence,
    SessionObligation,
    TerminalCommand,
    User,
)
from app.obligations import obligation_id

EVIDENCE_DIR = Path(settings.PORTAL_DB_PATH).parent / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
_COMMAND_NAMESPACE = uuid.UUID("811fe683-9aac-457b-a63e-fe36f3070fcc")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def _iso(value: Optional[datetime]) -> Optional[str]:
    aware = _aware(value)
    return aware.isoformat().replace("+00:00", "Z") if aware else None


def _parse_timestamp(value: Any) -> datetime:
    if isinstance(value, (float, int)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    return _utcnow()


def sync_assignment_obligations() -> int:
    """Create/update one stable obligation for each approved member/group-lab pair."""
    changed = 0
    with SessionLocal() as session:
        memberships = session.scalars(
            select(GroupMember).where(GroupMember.status == "approved")
        ).all()
        current_ids = set()
        for membership in memberships:
            user = session.get(User, membership.user_id)
            if not user or not user.internal_id:
                continue
            group_labs = session.scalars(
                select(GroupLab).where(GroupLab.group_id == membership.group_id)
            ).all()
            for group_lab in group_labs:
                oid = obligation_id(group_lab.id, membership.user_id)
                current_ids.add(oid)
                approved_at = membership.approved_at or membership.requested_at
                assigned_at = group_lab.assigned_at or approved_at
                eligible_at = max(_aware(approved_at), _aware(assigned_at))
                obligation = session.get(AssignmentObligation, oid)
                if obligation is None:
                    obligation = AssignmentObligation(
                        id=oid,
                        group_lab_id=group_lab.id,
                        group_id=membership.group_id,
                        user_id=membership.user_id,
                        student_id=user.internal_id,
                        lab_id=group_lab.lab_id,
                        assigned_at=assigned_at,
                        eligible_at=eligible_at,
                        deadline=group_lab.deadline,
                        synthetic=bool(
                            group_lab.synthetic or membership.synthetic or user.synthetic
                        ),
                    )
                    session.add(obligation)
                    changed += 1
                else:
                    obligation.deadline = group_lab.deadline
                    obligation.removed_at = None
        active = session.scalars(
            select(AssignmentObligation).where(AssignmentObligation.removed_at.is_(None))
        ).all()
        for obligation in active:
            if obligation.id not in current_ids:
                obligation.removed_at = _utcnow()
                changed += 1
        session.commit()
    return changed


def _active_obligations(
    session, lab_id: str, student_id: str, at: datetime, group_id: Optional[int] = None
):
    """Obligations a session/check should be credited against.

    With `group_id` given, only that group's obligation is credited -- a run
    started for one group must not also count for a sibling group that
    assigns the same lab. Without it (legacy callers with no group context),
    every matching obligation is credited, preserving the historical fan-out.
    """
    query = select(AssignmentObligation).where(
        AssignmentObligation.lab_id == lab_id,
        AssignmentObligation.student_id == student_id,
        AssignmentObligation.eligible_at <= at,
        AssignmentObligation.removed_at.is_(None),
    )
    if group_id is not None:
        query = query.where(AssignmentObligation.group_id == group_id)
    return session.scalars(query).all()


def create_lab_session(
    session_id: str,
    lab_id: str,
    student_id: str,
    started_at: Optional[datetime] = None,
    synthetic: bool = False,
    group_id: Optional[int] = None,
) -> None:
    started = started_at or _utcnow()
    sync_assignment_obligations()
    with SessionLocal() as session:
        if session.get(LabSession, session_id):
            return
        record = LabSession(
            id=session_id,
            lab_id=lab_id,
            student_id=student_id,
            started_at=started,
            outcome="running",
            synthetic=synthetic,
            group_id=group_id,
        )
        session.add(record)
        for obligation in _active_obligations(session, lab_id, student_id, started, group_id):
            session.add(SessionObligation(session_id=session_id, assignment_id=obligation.id))
        session.commit()


def close_lab_session(
    session_id: Optional[str], outcome: str, reason: Optional[str] = None
) -> None:
    if not session_id:
        return
    with SessionLocal() as session:
        record = session.get(LabSession, session_id)
        if record and record.ended_at is None:
            record.ended_at = _utcnow()
            record.outcome = outcome
            record.close_reason = reason
            session.commit()


def get_lab_sessions_for_student(lab_id: str, student_id: str) -> list[dict]:
    with SessionLocal() as session:
        records = session.scalars(
            select(LabSession)
            .where(LabSession.lab_id == lab_id, LabSession.student_id == student_id)
            .order_by(LabSession.started_at.desc())
        ).all()
        result = []
        for record in records:
            started_at = _aware(record.started_at)
            ended_at = _aware(record.ended_at)
            checks = session.scalars(
                select(CheckAttempt).where(CheckAttempt.session_id == record.id)
            ).all()
            latest = max(checks, key=lambda item: _aware(item.occurred_at)) if checks else None
            result.append(
                {
                    "session_id": record.id,
                    "started_at": _iso(started_at),
                    "ended_at": _iso(ended_at),
                    "outcome": record.outcome,
                    "close_reason": record.close_reason,
                    "duration_seconds": (
                        round((ended_at - started_at).total_seconds(), 1)
                        if started_at and ended_at
                        else None
                    ),
                    "check_count": len(checks),
                    "passed": latest.passed if latest else None,
                    "synthetic": record.synthetic,
                }
            )
        return result


def save_feedback(
    lab_id: str,
    student_id: str,
    session_id: str,
    section_a: str,
    rating: int,
    comment: str,
    issue_category: Optional[str] = None,
) -> str:
    section_a = section_a.strip()
    comment = comment.strip()
    if not session_id:
        raise ValueError("A lab session is required")
    if not 1 <= rating <= 5:
        raise ValueError("Rating must be between 1 and 5")
    if len(section_a) > 4000 or len(comment) > 4000:
        raise ValueError("Feedback text must be at most 4000 characters")
    response_id = str(uuid.uuid4())
    with SessionLocal() as session:
        lab_session = session.get(LabSession, session_id)
        if not lab_session or lab_session.lab_id != lab_id or lab_session.student_id != student_id:
            raise ValueError("Unknown lab session")
        session.add(
            FeedbackResponse(
                id=response_id,
                lab_session_id=session_id,
                lab_id=lab_id,
                student_id=student_id,
                section_a=section_a,
                rating=rating,
                comment=comment,
                issue_category=issue_category,
                synthetic=lab_session.synthetic,
            )
        )
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise ValueError("Feedback already submitted for this lab session") from exc
    return response_id


def session_group_id(session_id: str) -> Optional[int]:
    # A student can run the same lab under more than one group, so the group
    # has to come from the session the feedback is actually attached to (not
    # e.g. the runtime lease, which only reflects the most recent run) --
    # lets the post-feedback redirect land on the right group's results.
    if not session_id:
        return None
    with SessionLocal() as session:
        lab_session = session.get(LabSession, session_id)
        return lab_session.group_id if lab_session else None


def feedback_exists(lab_id: str, student_id: str, session_id: str) -> bool:
    if not session_id:
        return False
    with SessionLocal() as session:
        return (
            session.scalar(
                select(FeedbackResponse.id).where(
                    FeedbackResponse.lab_id == lab_id,
                    FeedbackResponse.student_id == student_id,
                    FeedbackResponse.lab_session_id == session_id,
                )
            )
            is not None
        )


def list_feedback(lab_id: Optional[str] = None, include_synthetic: bool = True):
    with SessionLocal() as session:
        query = select(FeedbackResponse).order_by(FeedbackResponse.occurred_at)
        if lab_id is not None:
            query = query.where(FeedbackResponse.lab_id == lab_id)
        if not include_synthetic:
            query = query.where(FeedbackResponse.synthetic.is_(False))
        records = session.scalars(query).all()
        return [
            {
                "response_id": record.id,
                "timestamp": _iso(record.occurred_at),
                "lab_id": record.lab_id,
                "student_id": record.student_id,
                "session_id": record.lab_session_id,
                "section_a": record.section_a,
                "rating": record.rating,
                "comment": record.comment,
                "issue_category": record.issue_category,
                "synthetic": record.synthetic,
            }
            for record in records
        ]


def feedback_analytics(
    lab_id: str, minimum_count: int = 5, student_ids: Optional[set[str]] = None
) -> dict:
    records = list_feedback(lab_id)
    if student_ids is not None:
        records = [record for record in records if record["student_id"] in student_ids]
    ratings = [record["rating"] for record in records]
    distribution = {str(value): ratings.count(value) for value in range(1, 6)}
    categories = {}
    for record in records:
        category = record.get("issue_category")
        if category:
            categories[category] = categories.get(category, 0) + 1
    return {
        "feedback_count": len(records),
        "feedback_average": (
            round(sum(ratings) / len(ratings), 1) if len(ratings) >= minimum_count else None
        ),
        "rating_distribution": distribution if len(ratings) >= minimum_count else None,
        "issue_categories": categories if len(ratings) >= minimum_count else None,
    }


def save_check_result(
    lab_id: str,
    student_id: str,
    check_result: dict[str, Any],
    duration_seconds: float,
    session_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_type: str = "student",
    phase: str = "student",
    scenario_version: str = "1",
    synthetic: bool = False,
    group_id: Optional[int] = None,
) -> str:
    result_id = str(uuid.uuid4())
    occurred_at = _utcnow()
    with SessionLocal() as session:
        attempt = CheckAttempt(
            id=result_id,
            session_id=session_id,
            lab_id=lab_id,
            student_id=student_id,
            actor_id=actor_id or student_id,
            actor_type=actor_type,
            phase=phase,
            scenario_version=scenario_version,
            checker_version=int(check_result.get("checker_version", 1)),
            overall_state=check_result.get("status", "unknown"),
            passed=bool(check_result.get("passed") or check_result.get("status") == "fixed"),
            occurred_at=occurred_at,
            operation_duration_seconds=round(duration_seconds, 3),
            synthetic=synthetic,
        )
        session.add(attempt)
        for criterion in check_result.get("checks", []):
            session.add(
                CriterionObservation(
                    check_id=result_id,
                    name=criterion.get("name", "unknown"),
                    label=criterion.get("label") or criterion.get("name", "Unknown criterion"),
                    kind=criterion.get("kind", "objective"),
                    observed_state=criterion.get("observed_state", "unknown"),
                    passed=bool(criterion.get("passed")),
                    exit_code=criterion.get("exit_code"),
                    matched_states=json.dumps(criterion.get("matched_states", [])),
                    output=(criterion.get("output") or "")[:500],
                )
            )
        for obligation in _active_obligations(session, lab_id, student_id, occurred_at, group_id):
            session.add(CheckObligation(check_id=result_id, assignment_id=obligation.id))
        session.commit()
    return result_id


def _check_record(session, attempt: CheckAttempt) -> dict:
    criteria = session.scalars(
        select(CriterionObservation)
        .where(CriterionObservation.check_id == attempt.id)
        .order_by(CriterionObservation.id)
    ).all()
    return {
        "result_id": attempt.id,
        "timestamp": _iso(attempt.occurred_at),
        "lab_id": attempt.lab_id,
        "student_id": attempt.student_id,
        "session_id": attempt.session_id,
        "actor": attempt.actor_id,
        "actor_type": attempt.actor_type,
        "phase": attempt.phase,
        "duration_seconds": attempt.operation_duration_seconds,
        "synthetic": attempt.synthetic,
        "check_result": {
            "status": attempt.overall_state,
            "passed": attempt.passed,
            "checker_version": attempt.checker_version,
            "checks": [
                {
                    "name": criterion.name,
                    "label": criterion.label,
                    "kind": criterion.kind,
                    "observed_state": criterion.observed_state,
                    "passed": criterion.passed,
                    "exit_code": criterion.exit_code,
                    "matched_states": json.loads(criterion.matched_states),
                    "output": criterion.output,
                }
                for criterion in criteria
            ],
        },
    }


def get_check_results_for_student(lab_id: str, student_id: str) -> list[dict]:
    with SessionLocal() as session:
        attempts = session.scalars(
            select(CheckAttempt)
            .where(CheckAttempt.lab_id == lab_id, CheckAttempt.student_id == student_id)
            .order_by(CheckAttempt.occurred_at)
        ).all()
        return [_check_record(session, attempt) for attempt in attempts]


def save_lifecycle_event(
    action: str,
    lab_id: str,
    student_id: str,
    actor: str,
    result: str,
    duration_seconds: Optional[float] = None,
    detail: Optional[str] = None,
    session_id: Optional[str] = None,
    actor_type: Optional[str] = None,
    reason: Optional[str] = None,
    synthetic: bool = False,
) -> str:
    event_id = str(uuid.uuid4())
    inferred_actor_type = actor_type or (
        "system" if actor in {"scheduler", "system"} else "student"
    )
    with SessionLocal() as session:
        session.add(
            LifecycleEvidence(
                id=event_id,
                session_id=session_id,
                lab_id=lab_id,
                student_id=student_id,
                actor_id=actor,
                actor_type=inferred_actor_type,
                action=action,
                result=result,
                reason=reason,
                operation_duration_seconds=(
                    round(duration_seconds, 3) if duration_seconds is not None else None
                ),
                detail=detail[:240] if detail else None,
                synthetic=synthetic,
            )
        )
        session.commit()
    return event_id


def get_lifecycle_events_for_student(lab_id: str, student_id: str) -> list[dict]:
    with SessionLocal() as session:
        records = session.scalars(
            select(LifecycleEvidence)
            .where(
                LifecycleEvidence.lab_id == lab_id,
                LifecycleEvidence.student_id == student_id,
            )
            .order_by(LifecycleEvidence.occurred_at)
        ).all()
        return [
            {
                "event_id": record.id,
                "timestamp": _iso(record.occurred_at),
                "lab_id": record.lab_id,
                "student_id": record.student_id,
                "session_id": record.session_id,
                "actor": record.actor_id,
                "actor_type": record.actor_type,
                "action": record.action,
                "result": record.result,
                "reason": record.reason,
                "duration_seconds": record.operation_duration_seconds,
                "detail": record.detail,
                "synthetic": record.synthetic,
            }
            for record in records
        ]


def _session_for_timestamp(session, lab_id: str, student_id: str, timestamp: datetime):
    records = session.scalars(
        select(LabSession)
        .where(
            LabSession.lab_id == lab_id,
            LabSession.student_id == student_id,
            LabSession.started_at <= timestamp,
        )
        .order_by(LabSession.started_at.desc())
    ).all()
    return next(
        (
            record
            for record in records
            if record.ended_at is None or _aware(record.ended_at) >= timestamp
        ),
        None,
    )


def save_command_events(lab_id: str, student_id: str, command_logs: list[dict]) -> None:
    with SessionLocal() as session:
        for entry in command_logs:
            occurred_at = _parse_timestamp(entry.get("timestamp"))
            terminal_session_id = entry.get("session_id") or None
            key = json.dumps(
                [
                    lab_id,
                    student_id,
                    terminal_session_id,
                    _iso(occurred_at),
                    entry.get("event"),
                    entry.get("command"),
                ],
                separators=(",", ":"),
            )
            command_id = str(uuid.uuid5(_COMMAND_NAMESPACE, key))
            if session.get(TerminalCommand, command_id):
                continue
            lab_session = _session_for_timestamp(session, lab_id, student_id, occurred_at)
            session.add(
                TerminalCommand(
                    id=command_id,
                    lab_session_id=lab_session.id if lab_session else None,
                    terminal_session_id=terminal_session_id,
                    lab_id=lab_id,
                    student_id=student_id,
                    event=entry.get("event", ""),
                    command=(entry.get("command") or "")[:2000] or None,
                    duration_seconds=entry.get("duration_seconds"),
                    occurred_at=occurred_at,
                    synthetic=bool(lab_session and lab_session.synthetic),
                )
            )
        session.commit()


def get_command_events_for_student(lab_id: str, student_id: str) -> list[dict]:
    with SessionLocal() as session:
        records = session.scalars(
            select(TerminalCommand)
            .where(TerminalCommand.lab_id == lab_id, TerminalCommand.student_id == student_id)
            .order_by(TerminalCommand.occurred_at)
        ).all()
        return [
            {
                "event_id": record.id,
                "timestamp": _iso(record.occurred_at),
                "lab_id": record.lab_id,
                "student_id": record.student_id,
                "lab_session_id": record.lab_session_id,
                "session_id": record.terminal_session_id,
                "event": record.event,
                "command": record.command or "",
                "duration_seconds": record.duration_seconds,
                "synthetic": record.synthetic,
            }
            for record in records
        ]


def any_pending_feedback(student_id: str) -> bool:
    with SessionLocal() as session:
        ended_sessions = session.scalars(
            select(LabSession).where(
                LabSession.student_id == student_id,
                LabSession.outcome.in_(["end", "stop"]),
            )
        ).all()
        for lab_session in ended_sessions:
            if (
                session.scalar(
                    select(FeedbackResponse.id).where(
                        FeedbackResponse.lab_session_id == lab_session.id
                    )
                )
                is None
            ):
                return True
    return False


def build_evidence_export(evaluation_id: str, anonymize: bool = False) -> Path:
    export_dir = EVIDENCE_DIR / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    export_path = export_dir / f"{evaluation_id}.tar.gz"
    with SessionLocal() as session:
        attempts = session.scalars(
            select(CheckAttempt)
            .where(CheckAttempt.synthetic.is_(False))
            .order_by(CheckAttempt.occurred_at)
        ).all()
        checks = [_check_record(session, attempt) for attempt in attempts]
        lifecycle_rows = session.scalars(
            select(LifecycleEvidence)
            .where(LifecycleEvidence.synthetic.is_(False))
            .order_by(LifecycleEvidence.occurred_at)
        ).all()
        lifecycle = [
            {
                "event_id": record.id,
                "timestamp": _iso(record.occurred_at),
                "lab_id": record.lab_id,
                "student_id": record.student_id,
                "session_id": record.session_id,
                "actor": record.actor_id,
                "actor_type": record.actor_type,
                "action": record.action,
                "result": record.result,
                "reason": record.reason,
            }
            for record in lifecycle_rows
        ]
        command_rows = session.scalars(
            select(TerminalCommand)
            .where(TerminalCommand.synthetic.is_(False))
            .order_by(TerminalCommand.occurred_at)
        ).all()
        commands = [
            {
                "event_id": record.id,
                "timestamp": _iso(record.occurred_at),
                "lab_id": record.lab_id,
                "student_id": record.student_id,
                "lab_session_id": record.lab_session_id,
                "terminal_session_id": record.terminal_session_id,
                "event": record.event,
                "command": record.command,
                "duration_seconds": record.duration_seconds,
            }
            for record in command_rows
        ]
    feedback = list_feedback(include_synthetic=False)
    if anonymize:
        pseudonyms = {}

        def pseudonym(student_id: str) -> str:
            if student_id not in pseudonyms:
                pseudonyms[student_id] = f"student_{len(pseudonyms) + 1:04d}"
            return pseudonyms[student_id]

        for collection in (checks, lifecycle, commands, feedback):
            for record in collection:
                record["student_id"] = pseudonym(record["student_id"])
        for record in feedback:
            record["section_a"] = "[redacted from anonymized export]"
            record["comment"] = "[redacted from anonymized export]"

    manifest = {
        "evaluation_id": evaluation_id,
        "exported_at": _iso(_utcnow()),
        "anonymized": anonymize,
        "synthetic_included": False,
        "feedback_count": len(feedback),
        "check_count": len(checks),
        "lifecycle_count": len(lifecycle),
        "command_count": len(commands),
    }
    with tarfile.open(export_path, "w:gz") as tar:
        records_by_name = {
            "manifest.json": manifest,
            "feedback.jsonl": feedback,
            "checks.jsonl": checks,
            "lifecycle.jsonl": lifecycle,
            "commands.jsonl": commands,
        }
        for name, records in records_by_name.items():
            if name == "manifest.json":
                data = json.dumps(records, indent=2) + "\n"
            else:
                data = "".join(json.dumps(record, sort_keys=True) + "\n" for record in records)
            data_bytes = data.encode("utf-8")
            info = tarfile.TarInfo(name=name)
            info.size = len(data_bytes)
            tar.addfile(info, io.BytesIO(data_bytes))
    return export_path
