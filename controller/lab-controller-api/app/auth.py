"""Database-backed portal authentication using email identities and PBKDF2 passwords."""

from typing import Optional

from app import repository as repo
from app.db import SessionLocal
from app.models import User


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.email,
        "email": user.email,
        "role": user.role,
        "student_id": user.internal_id or user.email,
        "number": user.number,
        "lab_password": user.lab_password,
        "must_change_password": bool(user.must_change_password),
        "active": bool(user.active),
    }


def authenticate_credentials(username: str, password: str) -> Optional[dict]:
    """Return the user dict if email+password is valid and the user is active."""
    if not username or not password:
        return None
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or not user.active:
            return None
        if not repo.verify_password(password, user.password_hash):
            return None
        return _user_to_dict(user)


def lookup_user(username: str) -> Optional[dict]:
    """Resolve a user dict by login id (email) without checking a password.

    Used by the session-cookie path, where the signature already proves
    identity.
    """
    if not username:
        return None
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or not user.active:
            return None
        return _user_to_dict(user)


def get_student_users() -> dict:
    """All active students keyed by login id (email)."""
    with SessionLocal() as session:
        return {
            user.email: _user_to_dict(user)
            for user in repo.list_users(session, role="student")
            if user.active
        }


def change_password(username: str, current_password: str, new_password: str) -> bool:
    """Verify the current password and set a new one, clearing must_change.

    Returns False if the user is missing/inactive or the current password is
    wrong; the caller maps that to 401.
    """
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or not user.active:
            return False
        if not repo.verify_password(current_password, user.password_hash):
            return False
        repo.set_password(session, user, new_password)
        session.commit()
        return True


def get_visible_lab_ids(username: str) -> set:
    """Lab ids a student may see/run (union across their groups)."""
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or user.role != "student":
            return set()
        return repo.visible_lab_ids(session, user)


def get_assigned_labs_detail(username: str) -> list:
    """All approved-group assignments, including expired and archived ones.

    One entry per (group, lab) assignment -- a lab assigned in two of the
    student's groups appears twice, each with its own group/assignment_id.
    """
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or user.role != "student":
            return []
        return repo.assigned_labs_detail(session, user)


def get_unarchived_labs_detail(username: str) -> list:
    """Approved non-archived assignments, including expired ones, grouped by assignment."""
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or user.role != "student":
            return []
        return repo.unarchived_labs_detail(session, user)


def get_readable_labs_detail(username: str) -> list:
    """Approved assignments within deadline, including archived groups. One
    entry per (group, lab) assignment -- see `get_assigned_labs_detail`."""
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or user.role != "student":
            return []
        return repo.readable_labs_detail(session, user)


def get_visible_labs_detail(username: str) -> list:
    """[{"assignment_id", "lab_id", "deadline", "group_id", "group_name",
    "semester", "is_archived"}]. One entry per (group, lab) assignment -- a lab
    assigned to two of the student's groups appears twice.
    """
    with SessionLocal() as session:
        user = repo.get_user_by_email(session, username)
        if user is None or user.role != "student":
            return []
        return repo.visible_labs_detail(session, user)
