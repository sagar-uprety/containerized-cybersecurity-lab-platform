"""SQLite engine and session factory for canonical x02 portal state.

The portal owns identity, assignments, runtime leases, and normalized evidence.
It lives on x02 next to FastAPI; SQLite must remain local to that process.
"""

import contextlib
from collections.abc import Iterator
from pathlib import Path

import sqlalchemy
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models import Base

_DB_PATH = Path(settings.PORTAL_DB_PATH)

# check_same_thread=False: FastAPI may touch a session from a worker thread.
# A short busy_timeout (set per-connection below) avoids "database is locked"
# under the portal's light concurrency without needing a server DB.
engine = create_engine(
    f"sqlite:///{_DB_PATH}",
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def _migrate_columns() -> None:
    """Add columns introduced after initial schema without a full migration tool."""
    migrations = [
        ("users", "semester", "TEXT"),
        ("users", "study_program", "TEXT"),
        ("users", "synthetic", "BOOLEAN NOT NULL DEFAULT 0"),
        ("group_members", "status", "TEXT NOT NULL DEFAULT 'approved'"),
        ("group_members", "requested_at", "TEXT NOT NULL DEFAULT '2025-01-01T00:00:00+00:00'"),
        ("group_members", "approved_at", "TEXT"),
        ("group_members", "synthetic", "BOOLEAN NOT NULL DEFAULT 0"),
        ("group_labs", "deadline", "TEXT"),
        ("group_labs", "assigned_at", "TEXT NOT NULL DEFAULT '2025-01-01T00:00:00+00:00'"),
        ("group_labs", "synthetic", "BOOLEAN NOT NULL DEFAULT 0"),
        ("groups", "synthetic", "BOOLEAN NOT NULL DEFAULT 0"),
        ("groups", "semester", "TEXT"),
        ("groups", "is_active", "BOOLEAN NOT NULL DEFAULT 1"),
    ]
    with engine.connect() as conn:
        for table, column, col_type in migrations:
            with contextlib.suppress(Exception):
                conn.execute(sqlalchemy.text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        conn.commit()


def init_db() -> None:
    """Create the database file and all tables if they do not exist."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _migrate_columns()


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session that is always closed."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _engine() -> Engine:
    return engine
