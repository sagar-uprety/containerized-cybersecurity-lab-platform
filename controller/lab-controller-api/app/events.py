import json
import threading
import time
from pathlib import Path
from typing import Optional

from app.config import settings
from app.feedback import save_lifecycle_event

EVENT_LOCK = threading.Lock()


def record_event(
    action: str,
    lab_id: str,
    student_id: str,
    actor: str,
    result: str,
    duration_seconds: Optional[float] = None,
    detail: Optional[str] = None,
    session_id: Optional[str] = None,
    actor_type: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    event = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lab": lab_id,
        "student": student_id,
        "actor": actor,
        "action": action,
        "result": result,
    }
    if duration_seconds is not None:
        event["duration_seconds"] = round(duration_seconds, 3)
    if detail:
        event["detail"] = detail[:240]
    if session_id:
        event["session_id"] = session_id
    if actor_type:
        event["actor_type"] = actor_type
    if reason:
        event["reason"] = reason

    event_path = Path(settings.EVENT_LOG_PATH)
    event_path.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOCK, event_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")

    # Also persist to the evidence store
    save_lifecycle_event(
        action=action,
        lab_id=lab_id,
        student_id=student_id,
        actor=actor,
        result=result,
        duration_seconds=duration_seconds,
        detail=detail,
        session_id=session_id,
        actor_type=actor_type,
        reason=reason,
    )


def read_recent_events(limit: int = 50):
    event_path = Path(settings.EVENT_LOG_PATH)
    if not event_path.exists():
        return []
    lines = event_path.read_text(encoding="utf-8").splitlines()[-limit:]
    events = []
    for line in lines:
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(events))
