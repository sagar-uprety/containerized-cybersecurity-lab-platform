import json
import threading
import time
from pathlib import Path

from app.config import settings


LAB_STATE = {}
LAB_STATE_LOCK = threading.Lock()


def state_key(lab_id: str, student_id: str) -> str:
    return f"{lab_id}:{student_id}"


def update_runtime_state(lab_id: str, student_id: str, status_text: str, **extra) -> None:
    with LAB_STATE_LOCK:
        value = LAB_STATE.setdefault(
            state_key(lab_id, student_id),
            {"started_at": time.time(), "last_seen": time.time()},
        )
        value["status"] = status_text
        value.update(extra)


def runtime_state_for(lab_id: str, student_id: str) -> dict:
    with LAB_STATE_LOCK:
        return dict(LAB_STATE.get(state_key(lab_id, student_id), {}))


def forget_runtime_state(lab_id: str, student_id: str) -> None:
    with LAB_STATE_LOCK:
        LAB_STATE.pop(state_key(lab_id, student_id), None)


def touch_runtime_state(lab_id: str, student_id: str) -> None:
    with LAB_STATE_LOCK:
        key = state_key(lab_id, student_id)
        if key in LAB_STATE:
            LAB_STATE[key]["last_seen"] = time.time()


def tracked_runtime_items():
    with LAB_STATE_LOCK:
        return list(LAB_STATE.items())


def remove_runtime_key(key: str) -> None:
    with LAB_STATE_LOCK:
        LAB_STATE.pop(key, None)


def load_check_result(lab_id: str, student_id: str):
    result_path = Path(settings.RESULTS_DIR) / f"{lab_id}_{student_id}.json"
    if not result_path.exists():
        return None
    try:
        return json.loads(result_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
