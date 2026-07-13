from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.models import RuntimeLease


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _datetime(value, default: datetime) -> datetime:
    if isinstance(value, datetime):
        return _aware(value)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc)
    return default


def state_key(lab_id: str, student_id: str) -> str:
    return f"{lab_id}:{student_id}"


def _as_dict(lease: RuntimeLease) -> dict:
    return {
        "status": lease.status,
        "session_id": lease.session_id,
        "started_at": _aware(lease.started_at).timestamp(),
        "last_seen": _aware(lease.last_seen_at).timestamp(),
    }


def update_runtime_state(lab_id: str, student_id: str, status_text: str, **extra) -> None:
    now = _utcnow()
    key = state_key(lab_id, student_id)
    with SessionLocal() as session:
        lease = session.get(RuntimeLease, key)
        if lease is None:
            lease = RuntimeLease(
                id=key,
                lab_id=lab_id,
                student_id=student_id,
                status=status_text,
                started_at=_datetime(extra.get("started_at"), now),
                last_seen_at=_datetime(extra.get("last_seen"), now),
                session_id=extra.get("session_id"),
                updated_at=now,
            )
            session.add(lease)
        else:
            lease.status = status_text
            lease.updated_at = now
            if "started_at" in extra:
                lease.started_at = _datetime(extra["started_at"], now)
            if "last_seen" in extra:
                lease.last_seen_at = _datetime(extra["last_seen"], now)
            if "session_id" in extra:
                lease.session_id = extra["session_id"]
        session.commit()


def runtime_state_for(lab_id: str, student_id: str) -> dict:
    with SessionLocal() as session:
        lease = session.get(RuntimeLease, state_key(lab_id, student_id))
        return _as_dict(lease) if lease else {}


def session_id_for(lab_id: str, student_id: str):
    return runtime_state_for(lab_id, student_id).get("session_id")


def forget_runtime_state(lab_id: str, student_id: str) -> None:
    remove_runtime_key(state_key(lab_id, student_id))


def touch_runtime_state(lab_id: str, student_id: str) -> None:
    with SessionLocal() as session:
        lease = session.get(RuntimeLease, state_key(lab_id, student_id))
        if lease is not None:
            lease.last_seen_at = _utcnow()
            lease.updated_at = lease.last_seen_at
            session.commit()


def tracked_runtime_items():
    with SessionLocal() as session:
        leases = session.scalars(select(RuntimeLease)).all()
        return [(lease.id, _as_dict(lease)) for lease in leases]


def tracked_labs_for_student(student_id: str) -> list[str]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(RuntimeLease.lab_id).where(
                    RuntimeLease.student_id == student_id,
                    RuntimeLease.status.in_(["running", "stopped", "error"]),
                )
            ).all()
        )


def remove_student_runtime(student_id: str) -> None:
    with SessionLocal() as session:
        leases = session.scalars(
            select(RuntimeLease).where(RuntimeLease.student_id == student_id)
        ).all()
        for lease in leases:
            session.delete(lease)
        session.commit()


def remove_runtime_key(key: str) -> None:
    with SessionLocal() as session:
        lease = session.get(RuntimeLease, key)
        if lease is not None:
            session.delete(lease)
            session.commit()
