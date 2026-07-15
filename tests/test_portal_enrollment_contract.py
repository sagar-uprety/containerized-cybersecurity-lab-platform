"""Contract checks for one pending or approved group per semester."""

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

    from app import repository as repo  # noqa: PLC0415
    from app.db import SessionLocal, init_db  # noqa: PLC0415
    from app.models import GroupLab, User  # noqa: PLC0415

    init_db()
    with SessionLocal() as session:
        student = User(
            email="semester-enrollment@example.invalid",
            password_hash=repo.hash_password("semester-enrollment-password"),
            role="student",
            internal_id="student997",
            number=997,
            lab_password="workstation-test-password",
        )
        session.add(student)
        session.flush()
        ws_primary = repo.create_group(session, "System Security", semester="WS 2026/27")
        ws_other = repo.create_group(session, "Advanced Security", semester="WS 2026/27")
        ss_group = repo.create_group(session, "Security Fundamentals", semester="SS 2026")
        inactive_group = repo.create_group(
            session, "Archived Security", semester="WS 2025/26", is_active=False
        )
        repo.add_member(session, ws_primary.id, student.id)
        repo.add_member(session, inactive_group.id, student.id)
        session.add_all(
            [
                GroupLab(group_id=ws_primary.id, lab_id="redis-exposed"),
                GroupLab(group_id=inactive_group.id, lab_id="ldap-anonymous-bind"),
            ]
        )
        session.flush()

        try:
            repo.request_membership(session, ws_other.id, student.id)
        except ValueError as exc:
            assert "WS 2026/27" in str(exc)
        else:
            raise AssertionError("second membership in the same semester was accepted")

        membership = repo.request_membership(session, ss_group.id, student.id)
        assert membership.status == "pending"

        try:
            repo.request_membership(session, inactive_group.id, student.id + 1)
        except ValueError as exc:
            assert str(exc) == "group is not open for enrollment"
        else:
            raise AssertionError("inactive group accepted an enrollment request")

        assert set(repo.active_labs_detail(session, student)) == {"redis-exposed"}
        assert set(repo.assigned_labs_detail(session, student)) == {
            "redis-exposed",
            "ldap-anonymous-bind",
        }

        try:
            repo.create_group(session, "Missing semester")
        except ValueError as exc:
            assert str(exc) == "group semester is required"
        else:
            raise AssertionError("group without semester was accepted")

        assert ss_group.is_active is True
        assert inactive_group.is_active is False

    main_source = (API_ROOT / "app/main.py").read_text(encoding="utf-8")
    detail_route = main_source.split('@app.get("/api/instructor/groups/{group_id}")', 1)[1].split(
        '@app.post("/api/instructor/groups/{group_id}/approve")', 1
    )[0]
    assert '"semester": group.semester' in detail_route
    assert '"is_active": group.is_active' in detail_route


if __name__ == "__main__":
    main()
