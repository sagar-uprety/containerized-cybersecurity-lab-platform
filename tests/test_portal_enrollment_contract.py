"""Contract checks for multi-group enrollment.

Replaces the deleted "one pending or approved group per semester" rule.
Checks covered here:

- A student may hold approved memberships in two different groups within the
  same semester (previously rejected).
- A student may also hold memberships in groups across different semesters.
- Joining the same group twice is a no-op: `add_member` and
  `request_membership` both return the existing membership instead of
  creating a duplicate `group_members` row.
- Creating a group with a blank/missing semester still raises
  `ValueError("group semester is required")` from `repository.create_group`.
- A lab assigned to two of a student's groups produces two independent
  `AssignmentObligation` rows (different id, different group_id, same
  lab_id) once `feedback.sync_assignment_obligations()` materializes them.

Session/check evidence crediting (which obligation a run counts against) is
covered by a separate multi-group evidence contract test and is
intentionally not duplicated here.
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
    temp_dir = Path(tempfile.mkdtemp(prefix="portal-enrollment-contract-"))
    os.environ["PORTAL_DB_PATH"] = str(temp_dir / "portal.db")

    from app import feedback  # noqa: PLC0415
    from app import repository as repo  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.models import AssignmentObligation, GroupLab, GroupMember, User  # noqa: PLC0415
    from sqlalchemy import select  # noqa: PLC0415

    init_db()
    with SessionLocal() as session:
        instructor = User(
            email="semester-enrollment-instructor@example.invalid",
            password_hash=repo.hash_password("semester-enrollment-password"),
            role="instructor",
        )
        student = User(
            email="semester-enrollment@example.invalid",
            password_hash=repo.hash_password("semester-enrollment-password"),
            role="student",
            internal_id="student997",
            number=997,
            lab_password="workstation-test-password",
        )
        session.add_all([instructor, student])
        session.flush()
        owner_id = instructor.id

        ws_primary = repo.create_group(session, "System Security", owner_id, semester="WS 2026/27")
        ws_other = repo.create_group(session, "Advanced Security", owner_id, semester="WS 2026/27")
        ss_group = repo.create_group(session, "Security Fundamentals", owner_id, semester="SS 2026")
        archived_group = repo.create_group(
            session, "Archived Security", owner_id, semester="WS 2025/26"
        )
        # Archiving is the sole lifecycle gate now: this blocks new enrollment
        # below the same way the old is_active=False flag used to.
        repo.set_group_archived(session, archived_group.id, True)

        # ws_primary and ws_other both assign the same lab -- this is the case
        # that must produce two independent obligations below.
        session.add_all(
            [
                GroupLab(group_id=ws_primary.id, lab_id="redis-exposed"),
                GroupLab(group_id=ws_other.id, lab_id="redis-exposed"),
                GroupLab(group_id=archived_group.id, lab_id="ldap-anonymous-bind"),
            ]
        )
        session.flush()

        repo.add_member(session, ws_primary.id, student.id)
        repo.add_member(session, archived_group.id, student.id)

        # A second approved membership in the SAME semester used to raise;
        # now it must succeed.
        member_other = repo.request_membership(session, ws_other.id, student.id)
        assert member_other.status == "pending"
        approved_count = repo.approve_members(session, ws_other.id, [student.id])
        assert approved_count == 1

        # A membership in a different semester still works too.
        member_ss = repo.request_membership(session, ss_group.id, student.id)
        assert member_ss.status == "pending"

        approved_memberships = (
            session.execute(
                select(GroupMember).where(
                    GroupMember.user_id == student.id, GroupMember.status == "approved"
                )
            )
            .scalars()
            .all()
        )
        approved_group_ids = {m.group_id for m in approved_memberships}
        assert approved_group_ids == {ws_primary.id, ws_other.id, archived_group.id}
        # ws_primary and ws_other are both approved and share a semester.
        assert ws_primary.semester == ws_other.semester == "WS 2026/27"

        # Joining the same group twice is a no-op: both entry points return
        # the existing membership rather than creating a duplicate row.
        existing_primary_membership = next(
            m for m in approved_memberships if m.group_id == ws_primary.id
        )
        again_via_add = repo.add_member(session, ws_primary.id, student.id)
        assert again_via_add.id == existing_primary_membership.id
        again_via_request = repo.request_membership(session, ws_primary.id, student.id)
        assert again_via_request.id == existing_primary_membership.id
        duplicate_rows = (
            session.execute(
                select(GroupMember).where(
                    GroupMember.group_id == ws_primary.id, GroupMember.user_id == student.id
                )
            )
            .scalars()
            .all()
        )
        assert len(duplicate_rows) == 1

        try:
            repo.request_membership(session, archived_group.id, student.id + 1)
        except ValueError as exc:
            assert str(exc) == "group is not open for enrollment"
        else:
            raise AssertionError("archived group accepted an enrollment request")

        unarchived_lab_ids = {e["lab_id"] for e in repo.unarchived_labs_detail(session, student)}
        assert unarchived_lab_ids == {"redis-exposed"}
        assigned_labs = repo.assigned_labs_detail(session, student)
        assigned_lab_ids = {e["lab_id"] for e in assigned_labs}
        assert assigned_lab_ids == {"redis-exposed", "ldap-anonymous-bind"}

        # The same lab assigned via ws_primary and ws_other appears twice --
        # once per group -- rather than being collapsed to one entry.
        redis_entries = [e for e in assigned_labs if e["lab_id"] == "redis-exposed"]
        assert len(redis_entries) == 2
        assert {e["group_id"] for e in redis_entries} == {ws_primary.id, ws_other.id}

        try:
            repo.create_group(session, "Missing semester", owner_id)
        except ValueError as exc:
            assert str(exc) == "group semester is required"
        else:
            raise AssertionError("group without semester was accepted")

        assert ss_group.is_archived is False
        assert archived_group.is_archived is True

        session.commit()

    # feedback.sync_assignment_obligations() materializes one
    # AssignmentObligation row per (group_lab, user) pair for every approved
    # membership -- the same lab assigned via two groups must produce two
    # independent rows, not one shared row.
    changed = feedback.sync_assignment_obligations()
    assert changed == 3  # redis-exposed x2 (ws_primary, ws_other) + ldap-anonymous-bind x1

    with SessionLocal() as session:
        synced_student = repo.get_user_by_email(session, "semester-enrollment@example.invalid")
        redis_obligations = (
            session.execute(
                select(AssignmentObligation).where(
                    AssignmentObligation.user_id == synced_student.id,
                    AssignmentObligation.lab_id == "redis-exposed",
                )
            )
            .scalars()
            .all()
        )
        assert len(redis_obligations) == 2
        assert len({o.id for o in redis_obligations}) == 2
        assert {o.group_id for o in redis_obligations} == {ws_primary.id, ws_other.id}
        assert all(o.lab_id == "redis-exposed" for o in redis_obligations)

    main_source = (API_ROOT / "app/main.py").read_text(encoding="utf-8")
    detail_route = main_source.split('@app.get("/api/instructor/groups/{group_id}")', 1)[1].split(
        '@app.post("/api/instructor/groups/{group_id}/approve")', 1
    )[0]
    assert '"semester": group.semester' in detail_route
    assert '"is_archived": group.is_archived' in detail_route

    print("OK")


if __name__ == "__main__":
    main()
