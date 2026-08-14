
Idempotent: only seeds when the users table is empty. Re-running is a no-op.
Legacy usernames (e.g. `student01`, `instructor`) are not emails, so a synthetic
`<username>@thesis.local` email is assigned as the new login id. The legacy
password becomes both the initial portal-login password and the lab password;
seeded users are NOT forced to change it (only portal-created students are).
"""

import logging
import re
from pathlib import Path

import yaml
from sqlalchemy import select

from app import repository as repo
from app.config import settings
from app.db import SessionLocal
from app.models import User

logger = logging.getLogger(__name__)


def _synth_email(username: str) -> str:
    return username if "@" in username else f"{username}@thesis.local"


def _derive_number(entry: dict, internal_id: str):
    number = entry.get("number")
    if number is not None:
        return int(number)
    match = re.fullmatch(r"student([0-9]{2,4})", internal_id)
    return int(match.group(1)) if match else None


def seed_if_empty() -> int:
    """Seed users from PORTAL_USERS_FILE if the DB has no users. Returns count."""
    with SessionLocal() as session:
        if session.execute(select(User).limit(1)).first() is not None:
            return 0

        path = Path(settings.PORTAL_USERS_FILE)
        if not path.exists():
            logger.info("No legacy users file at %s; skipping seed", path)
            return 0

        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        seeded = 0
        for entry in data.get("users", []):
            username = str(entry.get("username", "")).strip()
            password = str(entry.get("password", ""))
            role = str(entry.get("role", "student")).strip()
            if not username or not password or role not in {"student", "instructor"}:
                continue

            email = _synth_email(username)
            if role == "instructor":
                user = User(
                    email=email,
                    password_hash=repo.hash_password(password),
                    role="instructor",
                    must_change_password=False,
                    active=True,
                )
            else:
                internal_id = str(entry.get("student_id") or username).strip()
                user = User(
                    email=email,
                    password_hash=repo.hash_password(password),
                    role="student",
                    internal_id=internal_id,
                    number=_derive_number(entry, internal_id),
                    lab_password=password,
                    must_change_password=False,
                    active=True,
                )
            session.add(user)
            seeded += 1

        session.commit()
        logger.info("Seeded %d users from %s", seeded, path)
        return seeded


def ensure_admin_bootstrap() -> None:
    """Create the first admin account if none exists yet.

    Chicken-and-egg: the admin panel manages instructor accounts, but nothing
    can create the first admin account through the panel itself. Runs on every
    startup and is a no-op once an admin exists. The generated password is
    logged once (WARNING, so it survives default log levels) — the admin must
    change it on first login (must_change_password=True).
    """
    with SessionLocal() as session:
        if session.execute(select(User).where(User.role == "admin").limit(1)).first() is not None:
            return
        admin, password = repo.create_admin(session, "admin@thesis.local")
        session.commit()
        logger.warning(
            "Bootstrapped initial admin account %s with password: %s "
            "(change it on first login; this is logged only once)",
            admin.email,
            password,
        )
