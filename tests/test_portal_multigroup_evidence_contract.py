"""Contract checks for multi-group evidence independence.

A student may enroll in any number of groups, including several in the same
semester. When two of a student's groups assign the SAME lab, that is two
independent `AssignmentObligation` rows: the student runs the lab once per
group and each run's evidence must credit EXACTLY ONE group. Passing in
group A must leave group B "not attempted".

The runtime is still one container per (student, lab) -- labctl derives
container names from student number + lab id -- so only one group's run of a
given lab can be live at a time; starting a second group's run while the
first is still `running` or merely `stopped` (not `end`ed) is rejected with
409.

Checks covered here:
- The shared lab yields two independent `AssignmentObligation` rows (brief
  precondition; the shape itself is covered by
  `test_portal_enrollment_contract.py`).
- `create_lab_session(..., group_id=<A>)` writes exactly one
  `SessionObligation`, pointed at group A's obligation.
- `save_check_result(..., group_id=<A>)` writes exactly one
  `CheckObligation`, pointed at group A's obligation.
- The core invariant: after a passing check credited to group A only,
  `analytics.student_results` reports group A "passed" and group B
  "not_attempted" for the same lab -- and a group-scoped call for group B
  sees only its own (still-unpassed) row.
- `create_lab_session(..., group_id=None)` still fans out to BOTH
  obligations -- the legacy path pre-migration rows depend on.
- `POST /api/labs/{lab_id}/start` for group B returns 409 while group A's
  run is live, whether group A's lease is `running` or merely `stopped`.

Generic session-outcome behaviour and enrollment rules are intentionally not
re-tested here; see the sibling contract files for those.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "controller/lab-controller-api"
sys.path.insert(0, str(API_ROOT))


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-multigroup-evidence-contract-"))
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
    from app.analytics import student_results  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.feedback import (  # noqa: PLC0415
        create_lab_session,
        save_check_result,
        sync_assignment_obligations,
    )
    from app.main import app  # noqa: PLC0415
    from app.models import (  # noqa: PLC0415
        AssignmentObligation,
        CheckObligation,
        GroupLab,
        SessionObligation,
        User,
    )
    from app.runtime_state import update_runtime_state  # noqa: PLC0415
    from fastapi.testclient import TestClient  # noqa: PLC0415
    from sqlalchemy import select  # noqa: PLC0415

    init_db()

    lab_id = "redis-exposed"
    student_internal_id = "student996"
    student_email = "multigroup-evidence@example.invalid"
    student_password = "multigroup-evidence-password"
    instructor_email = "multigroup-evidence-instructor@example.invalid"
    instructor_password = "multigroup-evidence-instructor-password"

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
            internal_id=student_internal_id,
            number=996,
            lab_password="workstation-test-password",
        )
        session.add_all([instructor, student])
        session.flush()
        owner_id = instructor.id
        student_pk = student.id

        group_a = repo.create_group(
            session, "Multigroup Evidence A", owner_id, semester="WS 2026/27"
        )
        group_b = repo.create_group(
            session, "Multigroup Evidence B", owner_id, semester="WS 2026/27"
        )
        group_a_id = group_a.id
        group_b_id = group_b.id
        session.add_all(
            [
                GroupLab(group_id=group_a_id, lab_id=lab_id),
                GroupLab(group_id=group_b_id, lab_id=lab_id),
            ]
        )
        session.flush()

        # Both approved directly (no pending step needed for this contract).
        repo.add_member(session, group_a_id, student_pk)
        repo.add_member(session, group_b_id, student_pk)
        session.commit()

    changed = sync_assignment_obligations()
    assert changed == 2

    # --- 1. Two independent obligations (brief precondition) -----------------
    with SessionLocal() as session:
        obligations = (
            session.execute(
                select(AssignmentObligation).where(
                    AssignmentObligation.student_id == student_internal_id,
                    AssignmentObligation.lab_id == lab_id,
                )
            )
            .scalars()
            .all()
        )
        assert len(obligations) == 2
        assert len({o.id for o in obligations}) == 2
        assert {o.group_id for o in obligations} == {group_a_id, group_b_id}
        assert all(o.lab_id == lab_id for o in obligations)
        obligation_a = next(o for o in obligations if o.group_id == group_a_id)
        obligation_b = next(o for o in obligations if o.group_id == group_b_id)
        obligation_a_id = obligation_a.id
        obligation_b_id = obligation_b.id

    # --- 2. A session credits exactly one group -------------------------------
    session_a = "multigroup-session-a"
    create_lab_session(session_a, lab_id, student_internal_id, group_id=group_a_id)
    with SessionLocal() as session:
        rows = (
            session.execute(
                select(SessionObligation).where(SessionObligation.session_id == session_a)
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].assignment_id == obligation_a_id
        assert rows[0].assignment_id != obligation_b_id

    # --- 3. A check credits exactly one group (this check also passes, for #4)
    passing_check = {
        "status": "fixed",
        "passed": True,
        "checker_version": 1,
        "checks": [],
    }
    check_a = save_check_result(
        lab_id,
        student_internal_id,
        passing_check,
        duration_seconds=1.5,
        session_id=session_a,
        actor_id=student_internal_id,
        actor_type="student",
        phase="student",
        group_id=group_a_id,
    )
    with SessionLocal() as session:
        rows = (
            session.execute(select(CheckObligation).where(CheckObligation.check_id == check_a))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].assignment_id == obligation_a_id
        assert rows[0].assignment_id != obligation_b_id

    # --- 4. THE CORE INVARIANT: results stay independent ----------------------
    results = student_results(student_internal_id)
    lab_rows = [row for row in results["labs"] if row["lab_id"] == lab_id]
    assert len(lab_rows) == 2
    row_a = next(row for row in lab_rows if row["group_id"] == group_a_id)
    row_b = next(row for row in lab_rows if row["group_id"] == group_b_id)
    assert row_a["result"] == "passed"
    assert row_b["result"] == "not_attempted"

    group_b_only = student_results(student_internal_id, group_id=group_b_id)
    group_b_only_lab_rows = [row for row in group_b_only["labs"] if row["lab_id"] == lab_id]
    assert len(group_b_only_lab_rows) == 1
    assert group_b_only_lab_rows[0]["group_id"] == group_b_id
    assert group_b_only_lab_rows[0]["result"] != "passed"
    assert group_b_only_lab_rows[0]["result"] == "not_attempted"

    # --- 5. Legacy fan-out preserved (group_id=None credits BOTH obligations)
    legacy_session = "multigroup-session-legacy"
    create_lab_session(legacy_session, lab_id, student_internal_id, group_id=None)
    with SessionLocal() as session:
        rows = (
            session.execute(
                select(SessionObligation).where(SessionObligation.session_id == legacy_session)
            )
            .scalars()
            .all()
        )
        assert len(rows) == 2
        assert {r.assignment_id for r in rows} == {obligation_a_id, obligation_b_id}

    # --- 6. The 409 same-container rule ---------------------------------------
    with TestClient(app) as client:
        login = client.post(
            "/api/login", json={"username": student_email, "password": student_password}
        )
        assert login.status_code == 200, login.text

        lab_detail = client.get(f"/api/labs/{lab_id}", params={"group_id": group_a_id})
        assert lab_detail.status_code == 200, lab_detail.text
        csrf_token = lab_detail.json()["csrf_token"]

        # Simulate group A's run already live, without invoking real labctl --
        # the 409 check happens before any labctl call in start_lab. Reuse
        # session_a (already a real LabSession row) since runtime_leases.session_id
        # has a foreign key into lab_sessions.
        update_runtime_state(
            lab_id,
            student_internal_id,
            "running",
            group_id=group_a_id,
            session_id=session_a,
        )

        running_start = client.post(
            f"/api/labs/{lab_id}/start",
            json={"csrf_token": csrf_token, "group_id": group_b_id},
        )
        assert running_start.status_code == 409, running_start.text

        # Merely stopped (not ended) must ALSO 409 -- only `end` frees the
        # container.
        update_runtime_state(lab_id, student_internal_id, "stopped")

        stopped_start = client.post(
            f"/api/labs/{lab_id}/start",
            json={"csrf_token": csrf_token, "group_id": group_b_id},
        )
        assert stopped_start.status_code == 409, stopped_start.text

    print("OK")


if __name__ == "__main__":
    main()
