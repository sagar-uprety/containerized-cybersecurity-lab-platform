"""Initial administrator bootstrap."""

import logging

from sqlalchemy import select

from app import repository as repo
from app.db import SessionLocal
from app.models import User

logger = logging.getLogger(__name__)


def ensure_admin_bootstrap() -> None:
    """Create the first administrator when none exists."""
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
