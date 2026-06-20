"""SQLite engine, session factory, and schema init for the portal identity store.

The portal owns this database (users, groups, lab assignments). It lives on the
management host (x02) next to the FastAPI process — SQLite is embedded, so the
"""

from collections.abc import Iterator
from pathlib import Path

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


def init_db() -> None:
    """Create the database file and all tables if they do not exist."""
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session that is always closed."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _engine() -> Engine:
    return engine
