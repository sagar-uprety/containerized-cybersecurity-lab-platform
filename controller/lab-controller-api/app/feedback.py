import io
import json
import tarfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from app.config import settings

EVIDENCE_DIR = Path(settings.RUNTIME_STATE_PATH).parent / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

_FEEDBACK_LOCK = threading.Lock()
_CHECK_RESULT_LOCK = threading.Lock()
_LIFECYCLE_LOCK = threading.Lock()
_COMMAND_LOCK = threading.Lock()


def _append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")


def save_feedback(
    lab_id: str,
    student_id: str,
    session_id: str,
    section_a: str,
    section_b_rating: int,
    section_b: str,
) -> str:
    """Persist a student feedback response and return its ID."""
    response_id = str(uuid.uuid4())
    record = {
        "response_id": response_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lab_id": lab_id,
        "student_id": student_id,
        "session_id": session_id,
        "section_a": section_a,
        "section_b_rating": section_b_rating,
        "section_b": section_b,
    }
    with _FEEDBACK_LOCK:
        _append_jsonl(EVIDENCE_DIR / "feedback-responses.jsonl", record)
    return response_id


def feedback_exists(lab_id: str, student_id: str, session_id: str) -> bool:
    """Return True if the student has already submitted feedback for this lab session."""
    path = EVIDENCE_DIR / "feedback-responses.jsonl"
    if not path.exists():
        return False
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                if (
                    record.get("lab_id") == lab_id
                    and record.get("student_id") == student_id
                    and record.get("session_id") == session_id
                ):
                    return True
    except (OSError, json.JSONDecodeError):
        pass
    return False


def list_feedback(lab_id: Optional[str] = None):
    """Return all feedback responses, optionally filtered by lab_id."""
    path = EVIDENCE_DIR / "feedback-responses.jsonl"
    if not path.exists():
        return []
    responses = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                if lab_id is None or record.get("lab_id") == lab_id:
                    responses.append(record)
    except (OSError, json.JSONDecodeError):
        pass
    return responses


def get_check_results_for_student(lab_id: str, student_id: str) -> list[dict]:
    """Return all check results for a specific lab and student."""
    path = EVIDENCE_DIR / "check-results.jsonl"
    if not path.exists():
        return []
    results = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                if record.get("lab_id") == lab_id and record.get("student_id") == student_id:
                    results.append(record)
    except (OSError, json.JSONDecodeError):
        pass
    return results


def get_command_events_for_student(lab_id: str, student_id: str) -> list[dict]:
    """Return all command events for a specific lab and student."""
    path = EVIDENCE_DIR / "command-events.jsonl"
    if not path.exists():
        return []
    results = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                if record.get("lab_id") == lab_id and record.get("student_id") == student_id:
                    results.append(record)
    except (OSError, json.JSONDecodeError):
        pass
    return results


def get_lifecycle_events_for_student(lab_id: str, student_id: str) -> list[dict]:
    """Return all lifecycle events for a specific lab and student."""
    path = EVIDENCE_DIR / "lifecycle-events.jsonl"
    if not path.exists():
        return []
    results = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                if record.get("lab_id") == lab_id and record.get("student_id") == student_id:
                    results.append(record)
    except (OSError, json.JSONDecodeError):
        pass
    return results


def any_pending_feedback(student_id: str) -> bool:
    """Return True if the student has any unsubmitted feedback for previously ended sessions."""
    from app.runtime_state import LAB_STATE  # noqa: PLC0415

    for key, value in LAB_STATE.items():
        if not isinstance(value, dict):
            continue
        parts = key.split(":", 1)
        if len(parts) != 2:
            continue
        lab_id, sid = parts
        if sid != student_id:
            continue
        if value.get("status") not in ("ended", "stopped", "destroyed", "not_created"):
            continue
        session_id = value.get("session_id")
        if not session_id:
            continue
        if not feedback_exists(lab_id, student_id, session_id):
            return True
    return False


def save_check_result(
    lab_id: str,
    student_id: str,
    check_result: dict[str, Any],
    duration_seconds: float,
) -> str:
    """Persist a check result to the evidence store and return its ID."""
    result_id = str(uuid.uuid4())
    record = {
        "result_id": result_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lab_id": lab_id,
        "student_id": student_id,
        "duration_seconds": round(duration_seconds, 3),
        "check_result": check_result,
    }
    with _CHECK_RESULT_LOCK:
        _append_jsonl(EVIDENCE_DIR / "check-results.jsonl", record)
    return result_id


def save_lifecycle_event(
    action: str,
    lab_id: str,
    student_id: str,
    actor: str,
    result: str,
    duration_seconds: Optional[float] = None,
    detail: Optional[str] = None,
) -> None:
    """Duplicate lifecycle event into the evidence store."""
    record = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lab_id": lab_id,
        "student_id": student_id,
        "actor": actor,
        "action": action,
        "result": result,
    }
    if duration_seconds is not None:
        record["duration_seconds"] = round(duration_seconds, 3)
    if detail:
        record["detail"] = detail[:240]
    with _LIFECYCLE_LOCK:
        _append_jsonl(EVIDENCE_DIR / "lifecycle-events.jsonl", record)


_SEEN_COMMAND_KEYS: set[str] = set()


def save_command_events(lab_id: str, student_id: str, command_logs: list[dict]) -> None:
    """Persist terminal command logs into the evidence store."""
    with _COMMAND_LOCK:
        path = EVIDENCE_DIR / "command-events.jsonl"
        for entry in command_logs:
            key = (
                f"{lab_id}:{student_id}:"
                f"{entry.get('session_id', '')}:{entry.get('timestamp', '')}:"
                f"{entry.get('command', '')}"
            )
            if key in _SEEN_COMMAND_KEYS:
                continue
            _SEEN_COMMAND_KEYS.add(key)
            record = {
                "timestamp": entry.get(
                    "timestamp", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                ),
                "lab_id": lab_id,
                "student_id": student_id,
                "session_id": entry.get("session_id", ""),
                "event": entry.get("event", ""),
                "command": entry.get("command", ""),
            }
            if "duration_seconds" in entry:
                record["duration_seconds"] = entry["duration_seconds"]
            _append_jsonl(path, record)


def build_evidence_export(
    evaluation_id: str,
    anonymize: bool = False,
) -> Path:
    """Bundle feedback, check history, and lifecycle events into a tar.gz."""
    export_dir = EVIDENCE_DIR / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    export_path = export_dir / f"{evaluation_id}.tar.gz"

    # Collect records
    feedback_records = list_feedback()
    check_records = []
    lifecycle_records = []
    command_records = []

    check_path = EVIDENCE_DIR / "check-results.jsonl"
    if check_path.exists():
        with check_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    try:
                        check_records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    lifecycle_path = EVIDENCE_DIR / "lifecycle-events.jsonl"
    if lifecycle_path.exists():
        with lifecycle_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    try:
                        lifecycle_records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    command_path = EVIDENCE_DIR / "command-events.jsonl"
    if command_path.exists():
        with command_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    try:
                        command_records.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    if anonymize:
        pseudonym_map: dict[str, str] = {}
        counter = 1

        def _pseudonym(sid: str) -> str:
            nonlocal counter
            if sid not in pseudonym_map:
                pseudonym_map[sid] = f"student_{counter:04d}"
                counter += 1
            return pseudonym_map[sid]

        for record in feedback_records:
            record["student_id"] = _pseudonym(record["student_id"])
        for record in check_records:
            record["student_id"] = _pseudonym(record["student_id"])
        for record in lifecycle_records:
            record["student_id"] = _pseudonym(record["student_id"])
        for record in command_records:
            record["student_id"] = _pseudonym(record["student_id"])

    manifest = {
        "evaluation_id": evaluation_id,
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "anonymized": anonymize,
        "feedback_count": len(feedback_records),
        "check_count": len(check_records),
        "lifecycle_count": len(lifecycle_records),
        "command_count": len(command_records),
    }

    with tarfile.open(export_path, "w:gz") as tar:
        # Add manifest
        manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
        manifest_info = tarfile.TarInfo(name="manifest.json")
        manifest_info.size = len(manifest_bytes)
        tar.addfile(manifest_info, io.BytesIO(manifest_bytes))

        for name, records in (
            ("feedback.jsonl", feedback_records),
            ("checks.jsonl", check_records),
            ("lifecycle.jsonl", lifecycle_records),
            ("commands.jsonl", command_records),
        ):
            if records:
                data = "\n".join(json.dumps(r, sort_keys=True) for r in records) + "\n"
                data_bytes = data.encode("utf-8")
                info = tarfile.TarInfo(name=name)
                info.size = len(data_bytes)
                tar.addfile(info, io.BytesIO(data_bytes))

    return export_path
