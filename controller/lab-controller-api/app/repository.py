
All functions take an explicit Session so callers control transaction scope.
Mutating helpers flush but do not commit unless noted; the caller commits.
"""

# Defer annotation evaluation so PEP 604 (`X | None`) signatures stay valid on
# the x02 deploy target (Python 3.9). SQLAlchemy models avoid this by using
# typing.Optional instead, since it resolves Mapped[...] annotations eagerly.
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Group, GroupLab, GroupMember, User

# Password hashing uses stdlib PBKDF2-HMAC-SHA256 (no native deps) so it builds
# on the constrained x02 deploy target (ppc64le, Python 3.9, no Rust toolchain).
# Stored format: "pbkdf2_sha256$<rounds>$<b64 salt>$<b64 hash>".
_PBKDF2_ALGO = "pbkdf2_sha256"
_PBKDF2_ROUNDS = 240000


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(plain: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return (
        f"{_PBKDF2_ALGO}${_PBKDF2_ROUNDS}$"
        f"{base64.b64encode(salt).decode('ascii')}${base64.b64encode(dk).decode('ascii')}"
    )


def verify_password(plain: str, hashed: str) -> bool:
    try:
        algo, rounds, salt_b64, hash_b64 = hashed.split("$")
        if algo != _PBKDF2_ALGO:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, int(rounds))
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


def generate_password(length: int = 12) -> str:
    """Readable, URL-safe random password the instructor can share once."""
    return secrets.token_urlsafe(length)[:length]


def internal_id_from_number(number: int) -> str:
    # Zero-pad to 2 digits minimum so it always matches student([0-9]{2,4}).
    return f"student{number:02d}"


def validate_registration_password(password: str) -> list[str]:
    errors = []
    if len(password) < 8:
        errors.append("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", password):
        errors.append("Password must contain at least one digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        errors.append("Password must contain at least one special character")
    return errors


# --------------------------------------------------------------------------- #
# Number allocation
# --------------------------------------------------------------------------- #
def next_free_number(session: Session) -> int:
    """Allocate a student number as max+1 over current student numbers.

    Numbers map to deterministic ports (base + number). Deleting the highest
    student frees that number for reuse on the next create; mid-range gaps are
    student's lab instances first, releasing the associated ports/containers.
    """
    current_max = session.execute(select(func.max(User.number))).scalar_one_or_none()
    return 1 if current_max is None else int(current_max) + 1


# --------------------------------------------------------------------------- #
# User CRUD
# --------------------------------------------------------------------------- #
def get_user_by_email(session: Session, email: str) -> User | None:
    email = (email or "").strip().lower()
    if not email:
        return None
    return session.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_user_by_id(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)


def get_user_by_internal_id(session: Session, internal_id: str) -> User | None:
    return session.execute(select(User).where(User.internal_id == internal_id)).scalar_one_or_none()


def list_users(session: Session, role: str | None = None) -> list[User]:
    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
    return list(session.execute(stmt.order_by(User.id)).scalars())


def create_student(
    session: Session,
    email: str,
    *,
    portal_password: str | None = None,
    lab_password: str | None = None,
) -> tuple[User, str]:
    """Create a student. Returns (user, initial_portal_password).

    The caller shows the returned plaintext portal password to the instructor
    exactly once; only the hash is stored. `must_change_password` is set so the
    student is forced to change it on first login.
    """
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("email is required")
    if get_user_by_email(session, email) is not None:
        raise ValueError(f"user with email {email} already exists")

    initial_password = portal_password or generate_password()
    number = next_free_number(session)
    user = User(
        email=email,
        password_hash=hash_password(initial_password),
        role="student",
        internal_id=internal_id_from_number(number),
        number=number,
        lab_password=lab_password or generate_password(),
        must_change_password=True,
        active=True,
    )
    session.add(user)
    session.flush()
    return user, initial_password


def register_student(
    session: Session,
    email: str,
    password: str,
    semester: str | None = None,
    study_program: str | None = None,
) -> User:
    """Self-registration: student picks their own password."""
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("email is required")
    if get_user_by_email(session, email) is not None:
        raise ValueError("An account with this email already exists")
    errors = validate_registration_password(password)
    if errors:
        raise ValueError("; ".join(errors))

    number = next_free_number(session)
    user = User(
        email=email,
        password_hash=hash_password(password),
        role="student",
        internal_id=internal_id_from_number(number),
        number=number,
        lab_password=generate_password(),
        semester=semester,
        study_program=study_program,
        must_change_password=False,
        active=True,
    )
    session.add(user)
    session.flush()
    return user


def create_instructor(session: Session, email: str, *, portal_password: str) -> User:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("email is required")
    user = User(
        email=email,
        password_hash=hash_password(portal_password),
        role="instructor",
        must_change_password=False,
        active=True,
    )
    session.add(user)
    session.flush()
    return user


def remove_user(session: Session, user_id: int) -> bool:
    user = session.get(User, user_id)
    if user is None:
        return False
    session.delete(user)  # cascades memberships
    session.flush()
    return True


def set_password(session: Session, user: User, new_password: str) -> None:
    if not new_password:
        raise ValueError("new password is required")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    session.flush()


# --------------------------------------------------------------------------- #
# Groups
# --------------------------------------------------------------------------- #
def create_group(session: Session, name: str) -> Group:
    name = (name or "").strip()
    if not name:
        raise ValueError("group name is required")
    existing = session.execute(select(Group).where(Group.name == name)).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"group {name} already exists")
    group = Group(name=name)
    session.add(group)
    session.flush()
    return group


def rename_group(session: Session, group_id: int, new_name: str) -> Group | None:
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("group name is required")
    group = session.get(Group, group_id)
    if group is None:
        return None
    existing = session.execute(
        select(Group).where(Group.name == new_name, Group.id != group_id)
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"group {new_name} already exists")
    group.name = new_name
    session.flush()
    return group


def delete_group(session: Session, group_id: int) -> bool:
    group = session.get(Group, group_id)
    if group is None:
        return False
    session.delete(group)  # cascades members + lab assignments
    session.flush()
    return True


def list_groups(session: Session) -> list[Group]:
    return list(session.execute(select(Group).order_by(Group.name)).scalars())


def get_group(session: Session, group_id: int) -> Group | None:
    return session.get(Group, group_id)


# --------------------------------------------------------------------------- #
# Membership
# --------------------------------------------------------------------------- #
def add_member(session: Session, group_id: int, user_id: int) -> GroupMember:
    if session.get(Group, group_id) is None:
        raise ValueError("group not found")
    if session.get(User, user_id) is None:
        raise ValueError("user not found")
    existing = session.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    member = GroupMember(group_id=group_id, user_id=user_id, status="approved")
    session.add(member)
    session.flush()
    return member


def request_membership(session: Session, group_id: int, user_id: int) -> GroupMember:
    if session.get(Group, group_id) is None:
        raise ValueError("group not found")
    if session.get(User, user_id) is None:
        raise ValueError("user not found")
    existing = session.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    member = GroupMember(group_id=group_id, user_id=user_id, status="pending")
    session.add(member)
    session.flush()
    return member


def approve_members(session: Session, group_id: int, user_ids: list[int]) -> int:
    if session.get(Group, group_id) is None:
        raise ValueError("group not found")
    count = 0
    for uid in user_ids:
        member = session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id == uid,
                GroupMember.status == "pending",
            )
        ).scalar_one_or_none()
        if member is not None:
            member.status = "approved"
            count += 1
    session.flush()
    return count


def reject_members(session: Session, group_id: int, user_ids: list[int]) -> int:
    if session.get(Group, group_id) is None:
        raise ValueError("group not found")
    count = 0
    for uid in user_ids:
        member = session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id == uid,
                GroupMember.status == "pending",
            )
        ).scalar_one_or_none()
        if member is not None:
            session.delete(member)
            count += 1
    session.flush()
    return count


def pending_members(session: Session, group_id: int) -> list[GroupMember]:
    return list(
        session.execute(
            select(GroupMember)
            .where(GroupMember.group_id == group_id, GroupMember.status == "pending")
            .order_by(GroupMember.requested_at)
        ).scalars()
    )


def remove_member(session: Session, group_id: int, user_id: int) -> bool:
    member = session.execute(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    ).scalar_one_or_none()
    if member is None:
        return False
    session.delete(member)
    session.flush()
    return True


# --------------------------------------------------------------------------- #
# Lab assignment (groups only)
# --------------------------------------------------------------------------- #
def assign_lab(
    session: Session,
    group_id: int,
    lab_id: str,
    deadline: datetime | None = None,
) -> GroupLab:
    if session.get(Group, group_id) is None:
        raise ValueError("group not found")
    lab_id = (lab_id or "").strip()
    if not lab_id:
        raise ValueError("lab_id is required")
    existing = session.execute(
        select(GroupLab).where(GroupLab.group_id == group_id, GroupLab.lab_id == lab_id)
    ).scalar_one_or_none()
    if existing is not None:
        existing.deadline = deadline
        session.flush()
        return existing
    assignment = GroupLab(group_id=group_id, lab_id=lab_id, deadline=deadline)
    session.add(assignment)
    session.flush()
    return assignment


def unassign_lab(session: Session, group_id: int, lab_id: str) -> bool:
    assignment = session.execute(
        select(GroupLab).where(GroupLab.group_id == group_id, GroupLab.lab_id == lab_id)
    ).scalar_one_or_none()
    if assignment is None:
        return False
    session.delete(assignment)
    session.flush()
    return True


def visible_labs(session: Session, user: User) -> set[str]:
    """Lab ids a student may see/run = union of assignments across their
    approved groups, excluding labs past their deadline.
    """
    return set(visible_labs_with_deadlines(session, user).keys())


def visible_labs_with_deadlines(session: Session, user: User) -> dict[str, str | None]:
    """Lab id → earliest deadline (ISO string) or None if no deadline.

    When a lab is assigned to multiple groups, the latest deadline wins
    (gives the student the most time).
    """
    now = datetime.now(timezone.utc)
    rows = session.execute(
        select(GroupLab.lab_id, GroupLab.deadline)
        .join(GroupMember, GroupMember.group_id == GroupLab.group_id)
        .where(
            GroupMember.user_id == user.id,
            GroupMember.status == "approved",
            (GroupLab.deadline.is_(None)) | (GroupLab.deadline >= now),
        )
    ).all()
    result: dict[str, str | None] = {}
    for lab_id, deadline in rows:
        if lab_id not in result:
            result[lab_id] = deadline.isoformat() if deadline else None
        elif deadline is None:
            result[lab_id] = None
        elif result[lab_id] is not None:
            existing = result[lab_id]
            candidate = deadline.isoformat()
            if candidate > existing:
                result[lab_id] = candidate
    return result
