from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import cache

from sqlalchemy import func, select

from app.db import SessionLocal
from app.feedback import feedback_analytics, sync_assignment_obligations
from app.models import (
    AssignmentObligation,
    CheckAttempt,
    CheckObligation,
    CriterionObservation,
    Group,
    GroupMember,
    LabSession,
    LifecycleEvidence,
    RuntimeLease,
    SessionObligation,
    User,
)
from app.scenarios import list_scenarios, load_scenario_metadata

REVIEW_LABELS = {
    "overdue_incomplete": "Overdue incomplete",
    "not_started_near_deadline": "Not started near deadline",
    "repeated_criterion_failure": "Repeated criterion failure",
    "no_check_recorded": "Started, no check recorded",
    "environment_error": "Environment error",
}


def _aware(value):
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _iso(value):
    aware = _aware(value)
    return aware.isoformat().replace("+00:00", "Z") if aware else None


@cache
def _scenario(lab_id: str):
    return load_scenario_metadata(lab_id)


def _title(lab_id: str) -> str:
    scenario = _scenario(lab_id)
    return scenario.get("title", lab_id) if scenario else lab_id


def _obligations(session, group_id=None, group_ids=None, student_id=None, lab_id=None):
    query = select(AssignmentObligation).where(AssignmentObligation.removed_at.is_(None))
    if group_id is not None:
        query = query.where(AssignmentObligation.group_id == group_id)
    if group_ids is not None:
        query = query.where(AssignmentObligation.group_id.in_(group_ids))
    if student_id is not None:
        query = query.where(AssignmentObligation.student_id == student_id)
    if lab_id is not None:
        query = query.where(AssignmentObligation.lab_id == lab_id)
    return session.scalars(query).all()


def _prime_evidence_cache(session, obligations) -> None:
    assignment_ids = [item.id for item in obligations]
    sessions_by_assignment = defaultdict(list)
    checks_by_assignment = defaultdict(list)
    criteria_by_check = defaultdict(list)
    environment_errors = defaultdict(list)

    if assignment_ids:
        session_rows = session.execute(
            select(SessionObligation.assignment_id, LabSession)
            .join(LabSession, LabSession.id == SessionObligation.session_id)
            .where(SessionObligation.assignment_id.in_(assignment_ids))
            .order_by(LabSession.started_at)
        ).all()
        for assignment_id, lab_session in session_rows:
            sessions_by_assignment[assignment_id].append(lab_session)

        check_rows = session.execute(
            select(CheckObligation.assignment_id, CheckAttempt)
            .join(CheckAttempt, CheckAttempt.id == CheckObligation.check_id)
            .where(CheckObligation.assignment_id.in_(assignment_ids))
            .order_by(CheckAttempt.occurred_at)
        ).all()
        check_ids = []
        for assignment_id, check in check_rows:
            checks_by_assignment[assignment_id].append(check)
            check_ids.append(check.id)
        if check_ids:
            for criterion in session.scalars(
                select(CriterionObservation)
                .where(CriterionObservation.check_id.in_(check_ids))
                .order_by(CriterionObservation.id)
            ).all():
                criteria_by_check[criterion.check_id].append(criterion)

        student_ids = {item.student_id for item in obligations}
        lab_ids = {item.lab_id for item in obligations}
        for event in session.scalars(
            select(LifecycleEvidence).where(
                LifecycleEvidence.result == "error",
                LifecycleEvidence.student_id.in_(student_ids),
                LifecycleEvidence.lab_id.in_(lab_ids),
            )
        ).all():
            environment_errors[(event.student_id, event.lab_id)].append(_aware(event.occurred_at))

    session.info["analytics_sessions"] = sessions_by_assignment
    session.info["analytics_checks"] = checks_by_assignment
    session.info["analytics_criteria"] = criteria_by_check
    session.info["analytics_environment_errors"] = environment_errors


def _linked_sessions(session, assignment_id: str):
    cached = session.info.get("analytics_sessions")
    if cached is not None:
        return cached.get(assignment_id, [])
    return session.scalars(
        select(LabSession)
        .join(SessionObligation, SessionObligation.session_id == LabSession.id)
        .where(SessionObligation.assignment_id == assignment_id)
        .order_by(LabSession.started_at)
    ).all()


def _linked_checks(session, assignment_id: str, actor_type=None):
    cached = session.info.get("analytics_checks")
    if cached is not None:
        checks = cached.get(assignment_id, [])
        return [check for check in checks if not actor_type or check.actor_type == actor_type]
    query = (
        select(CheckAttempt)
        .join(CheckObligation, CheckObligation.check_id == CheckAttempt.id)
        .where(CheckObligation.assignment_id == assignment_id)
        .order_by(CheckAttempt.occurred_at)
    )
    if actor_type:
        query = query.where(CheckAttempt.actor_type == actor_type)
    return session.scalars(query).all()


def _achieved(session, obligation, cutoff=None) -> bool:
    checks = _linked_checks(session, obligation.id)
    return any(
        check.passed and (cutoff is None or _aware(check.occurred_at) < cutoff) for check in checks
    )


def _criterion_definitions(lab_id: str):
    scenario = _scenario(lab_id) or {}
    return scenario.get("checker", {}).get("checks", [])


def _criterion_rows(session, check_ids):
    if not check_ids:
        return []
    cached = session.info.get("analytics_criteria")
    if cached is not None:
        return [row for check_id in check_ids for row in cached.get(check_id, [])]
    return session.scalars(
        select(CriterionObservation)
        .where(CriterionObservation.check_id.in_(check_ids))
        .order_by(CriterionObservation.id)
    ).all()


def criterion_evidence(session, obligation, current_session_id=None, actor_type=None) -> list[dict]:
    checks = _linked_checks(session, obligation.id, actor_type=actor_type)
    rows = _criterion_rows(session, [check.id for check in checks])
    by_name = defaultdict(list)
    check_times = {check.id: _aware(check.occurred_at) for check in checks}
    check_sessions = {check.id: check.session_id for check in checks}
    for row in rows:
        by_name[row.name].append((row, check_times[row.check_id]))
    result = []
    for definition in _criterion_definitions(obligation.lab_id):
        observations = by_name.get(definition["name"], [])
        passes = [item for item in observations if item[0].passed]
        current_observations = (
            [
                item
                for item in observations
                if check_sessions[item[0].check_id] == current_session_id
            ]
            if current_session_id
            else observations
        )
        latest = current_observations[-1] if current_observations else None
        first_pass = passes[0] if passes else None
        before_achievement = (
            sum(1 for row, ts in observations if not row.passed and ts < first_pass[1])
            if first_pass
            else sum(1 for row, _ts in observations if not row.passed)
        )
        result.append(
            {
                "name": definition["name"],
                "label": definition.get("label", definition["name"]),
                "kind": definition.get("kind", "objective"),
                "ever_passed": bool(passes),
                "current_passed": latest[0].passed if latest else None,
                "current_state": latest[0].observed_state if latest else "unknown",
                "total_checks": len(observations),
                "failed_checks": sum(1 for row, _ts in observations if not row.passed),
                "failures_before_achievement": before_achievement,
                "first_pass_at": _iso(first_pass[1]) if first_pass else None,
                "last_checked_at": _iso(latest[1]) if latest else None,
            }
        )
    return result


def _review_reasons(session, obligation) -> list[dict]:
    now = datetime.now(timezone.utc)
    sessions = _linked_sessions(session, obligation.id)
    student_checks = _linked_checks(session, obligation.id, actor_type="student")
    reasons = []

    def add(code, criterion_name=None):
        reasons.append(
            {
                "code": code,
                "label": REVIEW_LABELS[code],
                "lab_id": obligation.lab_id,
                "lab_title": _title(obligation.lab_id),
                "criterion_name": criterion_name,
            }
        )

    deadline = _aware(obligation.deadline)
    if deadline and deadline < now and not _achieved(session, obligation):
        add("overdue_incomplete")
    if deadline and now <= deadline <= now + timedelta(days=3) and not sessions:
        add("not_started_near_deadline")
    if sessions and not student_checks:
        add("no_check_recorded")
    repeated = next(
        (
            criterion
            for criterion in criterion_evidence(session, obligation, actor_type="student")
            if criterion["kind"] == "objective"
            and not criterion["ever_passed"]
            and criterion["failed_checks"] >= 2
        ),
        None,
    )
    if repeated:
        add("repeated_criterion_failure", repeated["label"])
    cached_errors = session.info.get("analytics_environment_errors")
    has_error = (
        any(
            occurred_at >= _aware(obligation.eligible_at)
            for occurred_at in cached_errors.get((obligation.student_id, obligation.lab_id), [])
        )
        if cached_errors is not None
        else session.scalar(
            select(LifecycleEvidence.id)
            .where(
                LifecycleEvidence.student_id == obligation.student_id,
                LifecycleEvidence.lab_id == obligation.lab_id,
                LifecycleEvidence.result == "error",
                LifecycleEvidence.occurred_at >= obligation.eligible_at,
            )
            .limit(1)
        )
    )
    if has_error:
        add("environment_error")
    return reasons


def student_detail(student_id: str, group_id=None, group_ids=None):
    sync_assignment_obligations()
    with SessionLocal() as session:
        obligations = _obligations(
            session, group_id=group_id, group_ids=group_ids, student_id=student_id
        )
        _prime_evidence_cache(session, obligations)
        # Batch the Group lookup rather than querying once per obligation --
        # obligations for the same student commonly repeat a handful of groups.
        obligation_group_ids = {item.group_id for item in obligations}
        groups_by_id = (
            {
                group.id: group
                for group in session.scalars(
                    select(Group).where(Group.id.in_(obligation_group_ids))
                ).all()
            }
            if obligation_group_ids
            else {}
        )
        labs = []
        for obligation in obligations:
            sessions = _linked_sessions(session, obligation.id)
            checks = _linked_checks(session, obligation.id)
            latest_session = sessions[-1] if sessions else None
            current_checks = [
                check
                for check in checks
                if latest_session and check.session_id == latest_session.id
            ]
            latest_current = current_checks[-1] if current_checks else None
            first_pass = next((check for check in checks if check.passed), None)
            group = groups_by_id.get(obligation.group_id)
            labs.append(
                {
                    "lab_id": obligation.lab_id,
                    "lab_title": _title(obligation.lab_id),
                    "assignment_id": obligation.id,
                    "group_id": obligation.group_id,
                    "group_name": group.name if group else None,
                    "semester": group.semester if group else None,
                    "ever_passed": _achieved(session, obligation),
                    "first_pass_at": _iso(first_pass.occurred_at) if first_pass else None,
                    "latest_check": (
                        {"passed": latest_current.passed, "status": latest_current.overall_state}
                        if latest_current
                        else None
                    ),
                    "checks_submitted": len(
                        [check for check in checks if check.actor_type == "student"]
                    ),
                    "criteria": criterion_evidence(
                        session, obligation, latest_session.id if latest_session else None
                    ),
                    "total_sessions": len(sessions),
                    "sessions": [
                        {
                            "session_id": lab_session.id,
                            "started_at": _iso(lab_session.started_at),
                            "duration_seconds": (
                                round(
                                    (
                                        _aware(lab_session.ended_at)
                                        - _aware(lab_session.started_at)
                                    ).total_seconds(),
                                    1,
                                )
                                if lab_session.ended_at
                                else None
                            ),
                            "check_count": len(
                                [check for check in checks if check.session_id == lab_session.id]
                            ),
                            "student_check_count": len(
                                [
                                    check
                                    for check in checks
                                    if check.session_id == lab_session.id
                                    and check.actor_type == "student"
                                ]
                            ),
                            "automatic_check_count": len(
                                [
                                    check
                                    for check in checks
                                    if check.session_id == lab_session.id
                                    and check.actor_type == "system"
                                ]
                            ),
                            "outcome": lab_session.outcome,
                            "close_reason": lab_session.close_reason,
                            "passed": next(
                                (
                                    check.passed
                                    for check in reversed(checks)
                                    if check.session_id == lab_session.id
                                ),
                                None,
                            ),
                        }
                        for lab_session in sessions
                    ],
                }
            )
        return {"student_id": student_id, "labs": labs}


def _student_progress(session, obligations):
    sessions = {
        lab_session.id: lab_session
        for obligation in obligations
        for lab_session in _linked_sessions(session, obligation.id)
    }
    reasons = [
        reason for obligation in obligations for reason in _review_reasons(session, obligation)
    ]
    achieved = sum(1 for obligation in obligations if _achieved(session, obligation))
    started = sum(1 for obligation in obligations if _linked_sessions(session, obligation.id))
    checked = sum(
        1
        for obligation in obligations
        if _linked_checks(session, obligation.id, actor_type="student")
    )
    closed = [lab_session for lab_session in sessions.values() if lab_session.ended_at]
    runtime = sum(
        (_aware(lab_session.ended_at) - _aware(lab_session.started_at)).total_seconds()
        for lab_session in closed
    )
    last_active = max(
        (
            _aware(lab_session.ended_at or lab_session.started_at)
            for lab_session in sessions.values()
        ),
        default=None,
    )
    return {
        "labs_assigned": len(obligations),
        "labs_passed": achieved,
        "labs_started": started,
        "checks_submitted": checked,
        "total_sessions": len(sessions),
        "total_time_seconds": round(runtime, 1),
        "last_active": _iso(last_active),
        "at_risk": any(reason["code"] == "overdue_incomplete" for reason in reasons),
        "review_reasons": reasons,
    }


def group_progress(group_id: int):
    sync_assignment_obligations()
    with SessionLocal() as session:
        group = session.get(Group, group_id)
        if not group:
            return None
        obligations = _obligations(session, group_id=group_id)
        _prime_evidence_cache(session, obligations)
        by_student = defaultdict(list)
        for obligation in obligations:
            by_student[obligation.student_id].append(obligation)
        students = []
        for student_id, student_obligations in by_student.items():
            user = session.scalar(select(User).where(User.internal_id == student_id))
            students.append(
                {
                    "user_id": user.id,
                    "student_id": student_id,
                    "email": None if group.is_archived else user.email,
                    "semester": user.semester,
                    "study_program": None if group.is_archived else user.study_program,
                    **_student_progress(session, student_obligations),
                }
            )
        labs = []
        for lab_id in sorted({obligation.lab_id for obligation in obligations}):
            lab_obligations = [item for item in obligations if item.lab_id == lab_id]
            runtimes = []
            for obligation in lab_obligations:
                total = sum(
                    (_aware(item.ended_at) - _aware(item.started_at)).total_seconds()
                    for item in _linked_sessions(session, obligation.id)
                    if item.ended_at
                )
                if total:
                    runtimes.append(total)
            labs.append(
                {
                    "lab_id": lab_id,
                    "title": _title(lab_id),
                    "students_passed": sum(
                        1 for item in lab_obligations if _achieved(session, item)
                    ),
                    "students_attempted": sum(
                        1 for item in lab_obligations if _linked_sessions(session, item.id)
                    ),
                    "students_checked": sum(
                        1
                        for item in lab_obligations
                        if _linked_checks(session, item.id, actor_type="student")
                    ),
                    "median_recorded_minutes": (
                        round(statistics.median(runtimes) / 60, 1) if runtimes else 0
                    ),
                    "avg_time_minutes": (
                        round(statistics.median(runtimes) / 60, 1) if runtimes else 0
                    ),
                    "runtime_samples": len(runtimes),
                }
            )
        total_passed = sum(student["labs_passed"] for student in students)
        overdue = sum(1 for student in students if student["at_risk"])
        return {
            "is_archived": group.is_archived,
            "total_labs": len({obligation.lab_id for obligation in obligations}),
            "total_students": len(students),
            "total_passed": total_passed,
            "total_possible": len(obligations),
            "total_at_risk": overdue,
            "overdue_incomplete": overdue,
            "students": students,
            "labs": labs,
        }


def students_progress(group_ids=None):
    sync_assignment_obligations()
    with SessionLocal() as session:
        obligations = _obligations(session, group_ids=group_ids)
        _prime_evidence_cache(session, obligations)
        obligations_by_student = defaultdict(list)
        for obligation in obligations:
            obligations_by_student[obligation.student_id].append(obligation)

        roster_query = (
            select(User, Group)
            .join(GroupMember, GroupMember.user_id == User.id)
            .join(Group, Group.id == GroupMember.group_id)
            .where(GroupMember.status == "approved", User.role == "student")
            .order_by(User.id, Group.name)
        )
        if group_ids is not None:
            roster_query = roster_query.where(Group.id.in_(group_ids))

        users_by_student = {}
        groups_by_student = defaultdict(list)
        for roster_user, group in session.execute(roster_query).all():
            student_id = roster_user.internal_id or roster_user.email
            users_by_student[student_id] = roster_user
            groups_by_student[student_id].append(group)

        result = []
        for student_id, roster_user in users_by_student.items():
            student_obligations = obligations_by_student.get(student_id, [])
            groups = groups_by_student[student_id]
            # A student's email is only shown here if at least one of their (in-scope)
            # groups is still non-archived -- if every group in scope is archived, this
            # view has no non-archived reason to display their PII.
            all_archived = bool(groups) and all(group.is_archived for group in groups)
            result.append(
                {
                    "student_id": student_id,
                    "email": None if all_archived else roster_user.email,
                    "semester": roster_user.semester,
                    "study_program": None if all_archived else roster_user.study_program,
                    "groups": [
                        {"id": group.id, "name": group.name, "is_archived": group.is_archived}
                        for group in groups
                    ],
                    **_student_progress(session, student_obligations),
                }
            )
        return result


def _week_start(value: datetime) -> datetime:
    start = value - timedelta(days=value.weekday())
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def instructor_analytics(owner_group_ids, group_id=None, status="active"):
    """owner_group_ids restricts every candidate group to the caller's own
    groups; group_id (already ownership-checked by the route) further narrows
    to a single group within that scope. `status` filters the group roster to
    "active" (default: active and not archived), "archived", or "all"."""
    sync_assignment_obligations()
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        scope_ids = {group_id} if group_id is not None else set(owner_group_ids)
        obligations = _obligations(session, group_ids=scope_ids)
        if group_id is None and status != "all":
            if status == "archived":
                status_group_ids = set(
                    session.scalars(select(Group.id).where(Group.is_archived.is_(True))).all()
                )
            else:
                status_group_ids = set(
                    session.scalars(select(Group.id).where(Group.is_archived.is_(False))).all()
                )
            obligations = [item for item in obligations if item.group_id in status_group_ids]
        _prime_evidence_cache(session, obligations)
        student_ids = {item.student_id for item in obligations}
        completed = sum(1 for item in obligations if _achieved(session, item))
        all_sessions = {
            lab_session.id: lab_session
            for obligation in obligations
            for lab_session in _linked_sessions(session, obligation.id)
        }
        closed_durations = [
            (_aware(item.ended_at) - _aware(item.started_at)).total_seconds()
            for item in all_sessions.values()
            if item.ended_at
        ]
        week_ago = now - timedelta(days=7)
        active_students = {
            item.student_id for item in all_sessions.values() if _aware(item.started_at) >= week_ago
        }
        running_leases = session.scalars(
            select(RuntimeLease).where(RuntimeLease.status == "running")
        ).all()
        active_now_students_all = {lease.student_id for lease in running_leases}
        active_now_leases = (
            [lease for lease in running_leases if lease.student_id in student_ids]
            if group_id is not None
            else running_leases
        )
        active_now_sessions = len(active_now_leases)
        active_now_students = len({lease.student_id for lease in active_now_leases})
        overdue_eligible = [
            item for item in obligations if item.deadline and _aware(item.deadline) < now
        ]
        overdue_students = {
            item.student_id for item in overdue_eligible if not _achieved(session, item)
        }
        current_week = _week_start(now)
        weekly = []
        for index in range(8):
            start = current_week - timedelta(weeks=7 - index)
            end = start + timedelta(weeks=1)
            eligible = [item for item in obligations if _aware(item.eligible_at) < end]
            achieved = sum(1 for item in eligible if _achieved(session, item, cutoff=end))
            sessions = [
                item for item in all_sessions.values() if start <= _aware(item.started_at) < end
            ]
            weekly.append(
                {
                    "week": start.strftime("%d %b") + (" WTD" if index == 7 else ""),
                    "completion_rate": round(achieved / len(eligible) * 100) if eligible else 0,
                    "completed_assignments": achieved,
                    "eligible_assignments": len(eligible),
                    "sessions": len(sessions),
                    "active_students": len({item.student_id for item in sessions}),
                    "is_partial": index == 7,
                }
            )
        labs = []
        for lab_id in sorted({item.lab_id for item in obligations}):
            lab_obligations = [item for item in obligations if item.lab_id == lab_id]
            started = [item for item in lab_obligations if _linked_sessions(session, item.id)]
            checked = [
                item
                for item in lab_obligations
                if _linked_checks(session, item.id, actor_type="student")
            ]
            lab_runtimes = []
            for item in lab_obligations:
                total = sum(
                    (_aware(value.ended_at) - _aware(value.started_at)).total_seconds()
                    for value in _linked_sessions(session, item.id)
                    if value.ended_at
                )
                if total:
                    lab_runtimes.append(total)
            failures = defaultdict(lambda: {"label": "", "failed": 0, "observed": 0})
            for obligation in lab_obligations:
                for criterion in criterion_evidence(session, obligation, actor_type="student"):
                    if criterion["kind"] != "objective" or criterion["current_passed"] is None:
                        continue
                    value = failures[criterion["name"]]
                    value["label"] = criterion["label"]
                    value["observed"] += 1
                    if not criterion["current_passed"]:
                        value["failed"] += 1
            common = max(failures.values(), key=lambda value: value["failed"], default=None)
            lab_student_ids = {item.student_id for item in lab_obligations}
            eligible_by_student = {
                item.student_id: _aware(item.eligible_at) for item in lab_obligations
            }
            environment_events = session.scalars(
                select(LifecycleEvidence).where(
                    LifecycleEvidence.lab_id == lab_id,
                    LifecycleEvidence.result == "error",
                    LifecycleEvidence.student_id.in_(lab_student_ids),
                )
            ).all()
            feedback = feedback_analytics(lab_id, student_ids=lab_student_ids)
            labs.append(
                {
                    "lab_id": lab_id,
                    "title": _title(lab_id),
                    "completion_rate": round(
                        sum(1 for item in lab_obligations if _achieved(session, item))
                        / len(lab_obligations)
                        * 100
                    )
                    if lab_obligations
                    else 0,
                    "started_rate": round(len(started) / len(lab_obligations) * 100)
                    if lab_obligations
                    else 0,
                    "check_submission_rate": round(len(checked) / len(lab_obligations) * 100)
                    if lab_obligations
                    else 0,
                    "median_recorded_minutes": (
                        round(statistics.median(lab_runtimes) / 60) if lab_runtimes else 0
                    ),
                    "runtime_samples": len(lab_runtimes),
                    "open_sessions": sum(
                        1
                        for value in all_sessions.values()
                        if value.lab_id == lab_id and value.ended_at is None
                    ),
                    "students_passed": sum(
                        1 for item in lab_obligations if _achieved(session, item)
                    ),
                    "students_started": len(started),
                    "students_checked": len(checked),
                    "students_assigned": len(lab_obligations),
                    "common_failed_criterion": (
                        common["label"] if common and common["failed"] else None
                    ),
                    "criterion_failure_rate": (
                        round(common["failed"] / common["observed"] * 100)
                        if common and common["observed"]
                        else None
                    ),
                    "environment_errors": sum(
                        1
                        for event in environment_events
                        if _aware(event.occurred_at) >= eligible_by_student[event.student_id]
                    ),
                    **feedback,
                }
            )
        if group_id is not None:
            group_candidate_ids = {group_id}
        elif status == "all":
            group_candidate_ids = set(owner_group_ids)
        elif status == "archived":
            group_candidate_ids = set(
                session.scalars(select(Group.id).where(Group.is_archived.is_(True))).all()
            ) & set(owner_group_ids)
        else:
            group_candidate_ids = set(
                session.scalars(select(Group.id).where(Group.is_archived.is_(False))).all()
            ) & set(owner_group_ids)
        groups = []
        roster_student_ids = set()
        for candidate_id in sorted(group_candidate_ids):
            group = session.get(Group, candidate_id)
            if group is None:
                continue
            group_obligations = [item for item in obligations if item.group_id == candidate_id]
            group_student_ids = {
                member.user.internal_id or member.user.email
                for member in group.members
                if member.status == "approved"
            }
            roster_student_ids.update(group_student_ids)
            group_completed = sum(1 for item in group_obligations if _achieved(session, item))
            group_overdue = {
                item.student_id
                for item in group_obligations
                if item.deadline and _aware(item.deadline) < now and not _achieved(session, item)
            }
            active = len(active_students & group_student_ids)
            active_now = len(active_now_students_all & group_student_ids)
            groups.append(
                {
                    "id": candidate_id,
                    "name": group.name,
                    "is_archived": group.is_archived,
                    "completion_rate": round(group_completed / len(group_obligations) * 100)
                    if group_obligations
                    else 0,
                    "active_rate": round(active / len(group_student_ids) * 100)
                    if group_student_ids
                    else 0,
                    "at_risk": len(group_overdue),
                    "completed_assignments": group_completed,
                    "eligible_assignments": len(group_obligations),
                    "active_students": active,
                    "active_now_students": active_now,
                    "total_students": len(group_student_ids),
                    "labs_assigned": len({item.lab_id for item in group_obligations}),
                    "overdue_incomplete": len(group_overdue),
                    "pending_count": sum(
                        1 for member in group.members if member.status == "pending"
                    ),
                }
            )
        group = session.get(Group, group_id) if group_id is not None else None
        archived_groups_count = session.scalar(
            select(func.count())
            .select_from(Group)
            .where(Group.is_archived.is_(True), Group.id.in_(owner_group_ids))
        )
        return {
            "scope_name": group.name if group else None,
            "as_of": _iso(now),
            "timezone": "Europe/Berlin",
            "window_label": "Last 8 weeks; current week to date",
            "status": status,
            "archived_groups_count": archived_groups_count,
            "total_groups": len(groups),
            "total_labs": len(list_scenarios()),
            "total_students": len(roster_student_ids),
            "completion_rate": round(completed / len(obligations) * 100) if obligations else 0,
            "completed_assignments": completed,
            "eligible_assignments": len(obligations),
            "active_this_week": len(active_students),
            "active_now_sessions": active_now_sessions,
            "active_now_students": active_now_students,
            "at_risk": len(overdue_students),
            "overdue_incomplete": len(overdue_students),
            "overdue_eligible": len(overdue_eligible),
            "median_session_minutes": (
                round(statistics.median(closed_durations) / 60) if closed_durations else 0
            ),
            "median_runtime_samples": len(closed_durations),
            "open_sessions": sum(1 for item in all_sessions.values() if item.ended_at is None),
            "weekly": weekly,
            "labs": labs,
            "groups": groups,
        }


def students_assigned_lab(lab_id: str, group_ids=None) -> int:
    """How many distinct students currently have this lab assigned.

    Lets the feedback view distinguish "nobody has this lab" from "they have it
    and have not responded" -- two states that otherwise render identically as
    an empty page.
    """
    sync_assignment_obligations()
    with SessionLocal() as session:
        obligations = _obligations(session, group_ids=group_ids, lab_id=lab_id)
        return len({item.student_id for item in obligations})


def recent_activity(student_ids: set[str], limit: int = 10, redact_email: bool = False):
    """Lifecycle events for a set of students, newest first.

    `redact_email` drops the per-event email the same way an archived group's
    roster drops it. The pseudonymous `student_id` stays either way -- it is
    what the instructor needs to open a session, and it is not PII.
    """
    if not student_ids:
        return []
    with SessionLocal() as session:
        events = session.scalars(
            select(LifecycleEvidence)
            .where(LifecycleEvidence.student_id.in_(student_ids))
            .order_by(LifecycleEvidence.occurred_at.desc())
            .limit(limit)
        ).all()
        emails = (
            {}
            if redact_email
            else {
                user.internal_id: user.email
                for user in session.scalars(
                    select(User).where(User.internal_id.in_(student_ids))
                ).all()
            }
        )
        return [
            {
                "timestamp": _iso(event.occurred_at),
                "action": event.action,
                "student_id": event.student_id,
                "student_email": emails.get(event.student_id),
                "lab_id": event.lab_id,
                "lab_title": _title(event.lab_id),
                "result": event.result,
                "actor_type": event.actor_type,
                "reason": event.reason,
            }
            for event in events
        ]


def student_results(student_id: str, group_id=None):
    detail = student_detail(student_id, group_id=group_id)
    labs = []
    for lab in detail["labs"]:
        runtime = sum(item.get("duration_seconds") or 0 for item in lab["sessions"])
        latest = max(
            (item.get("started_at") for item in lab["sessions"] if item.get("started_at")),
            default=None,
        )
        labs.append(
            {
                "lab_id": lab["lab_id"],
                "lab_title": lab["lab_title"],
                "assignment_id": lab["assignment_id"],
                "group_id": lab["group_id"],
                "group_name": lab["group_name"],
                "semester": lab["semester"],
                "result": "passed"
                if lab["ever_passed"]
                else "failed"
                if lab["sessions"]
                else "not_attempted",
                "sessions_attempted": len(lab["sessions"]),
                "total_time_seconds": runtime,
                "last_active": latest,
            }
        )
    return {
        "labs": labs,
        "total_sessions": sum(item["sessions_attempted"] for item in labs),
        "total_time_seconds": sum(item["total_time_seconds"] for item in labs),
        "total_passed": sum(1 for item in labs if item["result"] == "passed"),
        "total_labs": len(labs),
    }
