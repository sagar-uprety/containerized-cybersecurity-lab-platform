import base64
import csv
import hashlib
import hmac
import io
import json
import logging
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
)
from fastapi.staticfiles import StaticFiles

from app import analytics as analytics_service
from app import repository as repo
from app.auth import (
    authenticate_credentials,
    change_password,
    get_assigned_labs_detail,
    get_readable_labs_detail,
    get_student_users,
    get_visible_lab_ids,
    lookup_user,
)
from app.config import settings
from app.db import SessionLocal, init_db
from app.events import record_event
from app.feedback import (
    build_evidence_export,
    close_lab_session,
    create_lab_session,
    feedback_analytics,
    feedback_exists,
    get_check_results_for_student,
    get_command_events_for_student,
    get_lab_sessions_for_student,
    get_lifecycle_events_for_student,
    list_feedback,
    save_check_result,
    save_command_events,
    save_feedback,
    sync_assignment_obligations,
)
from app.form_tokens import generate_token, validate_token
from app.runtime_state import (
    remove_runtime_key,
    remove_student_runtime,
    runtime_state_for,
    state_key,
    touch_runtime_state,
    tracked_labs_for_student,
    tracked_runtime_items,
    update_runtime_state,
)
from app.scenarios import (
    endpoint_ports,
    instructor_guide_url,
    list_scenarios,
    load_scenario_metadata,
    solution_notes_url,
    student_guide_url,
    terminal_owner_for_port,
    user_student_id,
    validate_lab_id,
)
from app.seed import seed_if_empty
from app.ssh_client import run_labctl

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Thesis Lab Portal",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.mount(
    "/static",
    StaticFiles(directory=str(Path(__file__).resolve().parent / "static")),
    name="static",
)

SPA_INDEX = Path(__file__).resolve().parent / "static" / "dist" / "index.html"

SESSION_SECRET = settings.PORTAL_DB_PATH.encode() + b"thesis-lab-portal-session"
SESSION_COOKIE = "portal_session"
SESSION_MAX_AGE = 86400


@app.on_event("startup")
def _startup_init_db() -> None:
    init_db()
    seed_if_empty()
    sync_assignment_obligations()


def _sign_session_token(username: str) -> str:
    payload = f"{username}:{int(time.time())}"
    sig = hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()[:32]
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def _verify_session_token(token: str) -> Optional[str]:
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        parts = decoded.rsplit(":", 2)
        if len(parts) != 3:
            return None
        username, ts_str, sig = parts
        payload = f"{username}:{ts_str}"
        expected = hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, expected):
            return None
        if time.time() - int(ts_str) > SESSION_MAX_AGE:
            return None
    except Exception:
        return None
    else:
        return username


def get_authenticated_user(request: Request) -> dict:
    cookie_token = request.cookies.get(SESSION_COOKIE)
    if cookie_token:
        username = _verify_session_token(cookie_token)
        if username:
            user_dict = lookup_user(username)
            if user_dict:
                return user_dict
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except Exception:
            raise HTTPException(
                status_code=401, detail="Invalid credentials", headers={"WWW-Authenticate": "Basic"}
            ) from None
        user_dict = authenticate_credentials(username, password)
        if not user_dict:
            raise HTTPException(
                status_code=401, detail="Invalid credentials", headers={"WWW-Authenticate": "Basic"}
            )
        return user_dict
    raise HTTPException(status_code=401, detail="Not authenticated")


def _is_fetch(request: Request) -> bool:
    return request.headers.get("x-requested-with") == "fetch"


def _save_command_logs_from_output(lab_id: str, student_id: str, stdout: str) -> None:
    command_logs = []
    for line in stdout.splitlines():
        if line.startswith("command_logs:"):
            try:
                value = json.loads(line.split(":", 1)[1].strip())
            except json.JSONDecodeError:
                continue
            if isinstance(value, list):
                command_logs.extend(item for item in value if isinstance(item, dict))
    json_start = stdout.find("{")
    if json_start >= 0:
        try:
            value = json.loads(stdout[json_start:])
        except json.JSONDecodeError:
            value = None
        if isinstance(value, dict) and isinstance(value.get("command_logs"), list):
            command_logs.extend(item for item in value["command_logs"] if isinstance(item, dict))
    if command_logs:
        save_command_events(lab_id, student_id, command_logs)


def _fast_lab_status(lab_id: str, student_id: str) -> str:
    """Read canonical operational status from x02 SQLite without SSH."""
    rs = runtime_state_for(lab_id, student_id)
    return rs.get("status") or "not_created"


def run_action(
    verb: str,
    lab_id: str,
    user: dict,
    session_id: Optional[str] = None,
    record_action: bool = True,
    reason: Optional[str] = None,
) -> tuple[bool, str, str, float]:
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    # Provisioning verbs need the student's lab password injected on stdin so
    # labctl can set the workstation account / terminal credential (Decision B).
    lab_password = user.get("lab_password") if verb in ("start", "reset") else None
    started = time.monotonic()
    success, stdout, stderr = run_labctl(verb, lab_id, student_id, lab_password=lab_password)
    duration = time.monotonic() - started
    if success and stdout:
        _save_command_logs_from_output(lab_id, student_id, stdout)
    if record_action:
        record_event(
            action="end" if verb == "destroy" else verb,
            lab_id=lab_id,
            student_id=student_id,
            actor=user["username"],
            actor_type=user.get("role", "student"),
            result="success" if success else "error",
            duration_seconds=duration,
            detail=stderr if stderr else None,
            session_id=session_id,
            reason=reason,
        )
    return success, stdout, stderr, duration


def _run_system_check(lab_id: str, user: dict, session_id: str, phase: str):
    student_id = user_student_id(user)
    success, stdout, stderr, duration = run_action(
        "check", lab_id, user, session_id=session_id, record_action=False
    )
    if not success:
        record_event(
            "check",
            lab_id,
            student_id,
            "system",
            "error",
            duration_seconds=duration,
            detail=stderr,
            session_id=session_id,
            actor_type="system",
            reason=phase,
        )
        return None
    try:
        json_start = stdout.find("{")
        if json_start < 0:
            raise ValueError("missing JSON object")
        check_result = json.loads(stdout[json_start:])
    except (json.JSONDecodeError, ValueError) as exc:
        record_event(
            "check",
            lab_id,
            student_id,
            "system",
            "error",
            detail=str(exc),
            session_id=session_id,
            actor_type="system",
            reason=phase,
        )
        return None
    record_event(
        "check",
        lab_id,
        student_id,
        "system",
        "success",
        duration_seconds=duration,
        session_id=session_id,
        actor_type="system",
        reason=phase,
    )
    save_check_result(
        lab_id,
        student_id,
        check_result,
        duration_seconds=duration,
        session_id=session_id,
        actor_id="system",
        actor_type="system",
        phase=phase,
    )
    update_runtime_state(
        lab_id,
        student_id,
        "running",
        last_seen=time.time(),
        last_check=check_result,
    )
    return check_result


def running_student_count(exclude_key: Optional[str] = None) -> int:
    return sum(
        1
        for key, runtime_state in tracked_runtime_items()
        if key != exclude_key and runtime_state.get("status") == "running"
    )


def scenario_idle_timeout(scenario: dict):
    lifecycle = scenario.get("lifecycle", {})
    if settings.EVALUATION_MODE:
        return lifecycle.get("evaluation_idle_timeout_minutes")
    return lifecycle.get("idle_timeout_minutes")


def require_student(user: dict) -> None:
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    # password is changed. /api/me, /api/password, /api/logout do not call this.
    if user.get("must_change_password"):
        raise HTTPException(status_code=403, detail="password_change_required")


def require_lab_visible(user: dict, lab_id: str) -> None:
    """Reject (403) a student acting on a lab not assigned to one of their
    if user["role"] != "student":
        return
    if lab_id not in get_visible_lab_ids(user["username"]):
        raise HTTPException(status_code=403, detail="Lab not assigned")


def require_lab_assigned(user: dict, lab_id: str) -> None:
    """Allow historical access and safe shutdown after a group becomes inactive."""
    if user["role"] != "student":
        return
    if lab_id not in get_assigned_labs_detail(user["username"]):
        raise HTTPException(status_code=403, detail="Lab not assigned")


async def _parse_action_body(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body") from None
        if "csrf_token" not in body:
            raise HTTPException(status_code=400, detail="csrf_token required")
        return body
    try:
        form = await request.form()
        return dict(form)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid form data") from None


def _build_endpoints(scenario: dict, student_id: str, user: dict) -> dict:
    ports = endpoint_ports(scenario, student_id, user)
    endpoints = {
        "browser_terminal": f"/terminal/{ports['terminal']}/",
        "ssh": f"ssh {student_id}@{settings.WORKER_HOST} -p {ports['ssh']}",
        "guide_url": student_guide_url(scenario),
    }
    if "app" in ports:
        endpoints["app"] = f"http://{settings.WORKER_HOST}:{ports['app']}/"
    return endpoints


# ---------------------------------------------------------------------------
# JSON API endpoints (consumed by React SPA)
# ---------------------------------------------------------------------------


@app.get("/api/me")
def api_me(user: dict = Depends(get_authenticated_user)):
    return {
        "username": user["username"],
        "email": user.get("email") or user["username"],
        "role": user["role"],
        "student_id": user.get("student_id") or user["username"],
        "must_change_password": user.get("must_change_password", False),
    }


@app.get("/api/workstation-access")
def api_workstation_access(user: dict = Depends(get_authenticated_user)):
    require_student(user)
    workstation_password = user.get("lab_password")
    if not workstation_password:
        raise HTTPException(status_code=409, detail="Workstation password is not configured")
    return JSONResponse(
        {
            "student_id": user_student_id(user),
            "workstation_password": workstation_password,
        },
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/labs")
def api_labs(user: dict = Depends(get_authenticated_user)):
    require_student(user)
    assignments = get_assigned_labs_detail(user["username"])
    labs = [lab for lab in list_scenarios() if lab["id"] in assignments]
    student_id = user_student_id(user)
    runtime_states = dict(tracked_runtime_items())
    result = []
    for lab in labs:
        lab_status = runtime_states.get(state_key(lab["id"], student_id), {}).get(
            "status", "not_created"
        )
        detail = assignments.get(lab["id"], {})
        result.append(
            {
                "id": lab["id"],
                "title": lab["title"],
                "difficulty": lab.get("difficulty"),
                "story": lab.get("story"),
                "status": lab_status,
                "deadline": detail.get("deadline"),
                "group": {
                    "id": detail.get("group_id"),
                    "name": detail.get("group_name"),
                    "semester": detail.get("semester"),
                    "is_active": detail.get("is_active"),
                },
            }
        )
    return result


@app.get("/api/labs/{lab_id}")
def api_lab_detail(lab_id: str, _request: Request, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    validate_lab_id(lab_id)
    assignments = get_readable_labs_detail(user["username"])
    if lab_id not in assignments:
        raise HTTPException(status_code=404, detail="Lab not found")
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    student_id = user_student_id(user)
    status_text = _fast_lab_status(lab_id, student_id)

    check_results = get_check_results_for_student(lab_id, student_id)
    check_result = check_results[-1].get("check_result") if check_results else None
    endpoints = _build_endpoints(scenario, student_id, user)

    return {
        "scenario": scenario,
        "status": status_text,
        "check_result": check_result,
        "endpoints": endpoints,
        "csrf_token": generate_token(user),
        "deadline": assignments.get(lab_id, {}).get("deadline"),
        "group": {
            "id": assignments.get(lab_id, {}).get("group_id"),
            "name": assignments.get(lab_id, {}).get("group_name"),
            "semester": assignments.get(lab_id, {}).get("semester"),
            "is_active": assignments.get(lab_id, {}).get("is_active"),
        },
    }


@app.get("/api/labs/{lab_id}/feedback")
def api_lab_feedback(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    require_lab_assigned(user, lab_id)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    runtime_state = runtime_state_for(lab_id, student_id)
    session_id = runtime_state.get("session_id", "")
    already_submitted = feedback_exists(lab_id, student_id, session_id)
    return {
        "lab_id": lab_id,
        "session_id": session_id,
        "already_submitted": already_submitted,
        "csrf_token": generate_token(user),
    }


# ---------------------------------------------------------------------------
# Auth endpoints (session cookie based)
# ---------------------------------------------------------------------------


@app.post("/api/register")
async def api_register(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    semester = body.get("semester", "").strip() or None
    study_program = body.get("study_program", "").strip() or None
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    errors = repo.validate_registration_password(password)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))
    with SessionLocal() as session:
        try:
            user = repo.register_student(session, email, password, semester, study_program)
            session.commit()
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        user_dict = {
            "username": user.email,
            "email": user.email,
            "role": user.role,
            "student_id": user.internal_id,
            "must_change_password": False,
        }
    token = _sign_session_token(user_dict["username"])
    response = JSONResponse(
        {
            "user": {
                "username": user_dict["username"],
                "role": user_dict["role"],
                "student_id": user_dict["student_id"],
                "must_change_password": False,
            }
        }
    )
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@app.post("/api/login")
async def api_login(request: Request):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    username = body.get("username", "").strip()
    password = body.get("password", "")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")
    user_dict = authenticate_credentials(username, password)
    if not user_dict:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = _sign_session_token(user_dict["username"])
    response = JSONResponse(
        {
            "user": {
                "username": user_dict["username"],
                "role": user_dict["role"],
                "student_id": user_dict.get("student_id") or user_dict["username"],
                "must_change_password": user_dict.get("must_change_password", False),
            }
        }
    )
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@app.post("/api/logout")
def api_logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.post("/api/password")
async def api_change_password(request: Request, user: dict = Depends(get_authenticated_user)):

    Deliberately does not call require_student so a student with
    must_change_password set can still reach it (require_student would block).
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    current = body.get("current_password", "")
    new = body.get("new_password", "")
    if not current or not new:
        raise HTTPException(status_code=400, detail="Current and new password required")
    if len(new) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    if not change_password(user["username"], current, new):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Existing POST endpoints (JSON response for fetch, redirect otherwise)
# ---------------------------------------------------------------------------


@app.post("/api/labs/{lab_id}/start")
async def start_lab(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_visible(user, lab_id)
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    student_id = user_student_id(user)
    current_key = state_key(lab_id, student_id)

    for scenario in list_scenarios():
        if scenario["id"] == lab_id:
            continue
        if _fast_lab_status(scenario["id"], student_id) == "running":
            raise HTTPException(
                status_code=409,
                detail=f"Another lab ({scenario['title']}) is already running. "
                "End or stop it before starting a new one.",
            )

    if running_student_count(exclude_key=current_key) >= settings.MAX_CONCURRENT_STUDENTS:
        record_event(
            "start",
            lab_id,
            student_id,
            user["username"],
            "rejected",
            detail="capacity",
            actor_type="student",
            reason="capacity",
        )
        raise HTTPException(
            status_code=503,
            detail="Maximum concurrent students reached. Try again later.",
        )

    session_id = str(uuid.uuid4())
    success, _stdout, stderr, _duration = run_action("start", lab_id, user, record_action=False)
    if not success:
        record_event(
            "start",
            lab_id,
            student_id,
            user["username"],
            "error",
            duration_seconds=_duration,
            detail=stderr,
            actor_type="student",
        )
        logger.error("Lab start failed for %s/%s: %s", lab_id, student_id, stderr)
        update_runtime_state(lab_id, student_id, "error")
        raise HTTPException(status_code=502, detail="Failed to start lab")

    create_lab_session(session_id, lab_id, student_id)
    record_event(
        "start",
        lab_id,
        student_id,
        user["username"],
        "success",
        duration_seconds=_duration,
        session_id=session_id,
        actor_type="student",
    )
    update_runtime_state(
        lab_id,
        student_id,
        "running",
        started_at=time.time(),
        last_seen=time.time(),
        session_id=session_id,
    )
    _run_system_check(lab_id, user, session_id, "baseline")

    if _is_fetch(request):
        endpoints = _build_endpoints(scenario, student_id, user)
        return {"status": "running", "endpoints": endpoints}
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/api/labs/{lab_id}/stop")
async def stop_lab(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_assigned(user, lab_id)
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    student_id = user_student_id(user)
    session_id = runtime_state_for(lab_id, student_id).get("session_id")
    success, _stdout, stderr, _duration = run_action("stop", lab_id, user, session_id=session_id)
    update_runtime_state(
        lab_id,
        student_id,
        "stopped" if success else "error",
        last_seen=time.time(),
    )
    if not success:
        logger.error("Lab stop failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to stop lab")
    close_lab_session(session_id, "stop", "student_stop")
    if _is_fetch(request):
        return {"status": "stopped"}
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/api/labs/{lab_id}/reset")
async def reset_lab(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_visible(user, lab_id)
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    student_id = user_student_id(user)
    previous_session_id = runtime_state_for(lab_id, student_id).get("session_id")
    success, _stdout, stderr, _duration = run_action(
        "reset", lab_id, user, session_id=previous_session_id
    )
    if not success:
        update_runtime_state(lab_id, student_id, "error")
        logger.error("Lab reset failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to reset lab")
    close_lab_session(previous_session_id, "reset", "student_reset")
    session_id = str(uuid.uuid4())
    create_lab_session(session_id, lab_id, student_id)
    record_event(
        "start",
        lab_id,
        student_id,
        user["username"],
        "success",
        session_id=session_id,
        actor_type="student",
        reason="reset",
    )
    update_runtime_state(
        lab_id,
        student_id,
        "running",
        started_at=time.time(),
        last_seen=time.time(),
        last_check=None,
        session_id=session_id,
    )
    _run_system_check(lab_id, user, session_id, "baseline")
    if _is_fetch(request):
        return {"status": "running"}
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/api/labs/{lab_id}/end")
async def end_lab(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_assigned(user, lab_id)
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    student_id = user_student_id(user)
    session_id = runtime_state_for(lab_id, student_id).get("session_id")
    if session_id:
        _run_system_check(lab_id, user, session_id, "final")
    success, _stdout, stderr, _duration = run_action("destroy", lab_id, user, session_id=session_id)
    if not success:
        update_runtime_state(lab_id, student_id, "error")
        logger.error("Lab end failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to end lab")
    close_lab_session(session_id, "end", "student_end")
    update_runtime_state(lab_id, student_id, "ended")
    if _is_fetch(request):
        return {"status": "ended", "redirect": f"/labs/{lab_id}/feedback"}
    return RedirectResponse(url=f"/labs/{lab_id}/feedback", status_code=303)


@app.post("/api/labs/{lab_id}/check")
async def check_lab(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_visible(user, lab_id)
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    student_id = user_student_id(user)
    session_id = runtime_state_for(lab_id, student_id).get("session_id")
    success, stdout, stderr, duration = run_action(
        "check", lab_id, user, session_id=session_id, record_action=False
    )
    if not success:
        record_event(
            "check",
            lab_id,
            student_id,
            user["username"],
            "error",
            duration_seconds=duration,
            detail=stderr,
            session_id=session_id,
            actor_type="student",
        )
        logger.error("Lab check failed for %s/%s: %s", lab_id, student_id, stderr)
        update_runtime_state(lab_id, student_id, "error")
        if _is_fetch(request):
            return JSONResponse(
                {"detail": "Failed to run check"},
                status_code=502,
            )
        raise HTTPException(status_code=502, detail="Failed to run check")

    try:
        json_start = stdout.find("{")
        if json_start < 0:
            raise ValueError("missing JSON object")
        check_result = json.loads(stdout[json_start:])
    except (json.JSONDecodeError, ValueError) as exc:
        record_event(
            "check",
            lab_id,
            student_id,
            user["username"],
            "error",
            detail=str(exc),
            session_id=session_id,
            actor_type="student",
        )
        raise HTTPException(status_code=502, detail="Checker did not return valid JSON") from exc

    record_event(
        "check",
        lab_id,
        student_id,
        user["username"],
        "success",
        duration_seconds=duration,
        session_id=session_id,
        actor_type="student",
    )
    save_check_result(
        lab_id,
        student_id,
        check_result,
        duration_seconds=duration,
        session_id=session_id,
        actor_id=user["username"],
        actor_type="student",
        phase="student",
    )
    update_runtime_state(
        lab_id,
        student_id,
        "running",
        last_seen=time.time(),
        last_check=check_result,
    )
    if _is_fetch(request):
        return JSONResponse(check_result)
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/api/labs/{lab_id}/feedback")
async def submit_feedback(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_assigned(user, lab_id)
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    session_id = body.get("session_id", "")
    section_a = body.get("section_a", "")
    rating = int(body.get("rating", 3))
    comment = body.get("comment", "")
    issue_category = body.get("issue_category")
    if not session_id:
        runtime_state = runtime_state_for(lab_id, student_id)
        session_id = runtime_state.get("session_id", "")
    try:
        save_feedback(
            lab_id,
            student_id,
            session_id,
            section_a,
            rating,
            comment,
            issue_category=issue_category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if _is_fetch(request):
        return {"ok": True}
    return RedirectResponse(url="/portal", status_code=303)


@app.get("/api/enrollment-options")
def api_enrollment_options(user: dict = Depends(get_authenticated_user)):
    require_student(user)
    with SessionLocal() as session:
        db_user = repo.get_user_by_email(session, user["username"])
        if db_user is None:
            raise HTTPException(status_code=404, detail="User not found")
        groups = repo.list_groups(session)
        result = []
        for g in groups:
            my_membership = next((m for m in g.members if m.user_id == db_user.id), None)
            if not g.is_active and my_membership is None:
                continue
            result.append(
                {
                    "id": g.id,
                    "name": g.name,
                    "semester": g.semester,
                    "is_active": g.is_active,
                    "created_at": g.created_at.isoformat() if g.created_at else None,
                    "member_count": sum(1 for m in g.members if m.status == "approved"),
                    "status": my_membership.status if my_membership else None,
                }
            )
        return result


@app.post("/api/enroll/{group_id}")
def api_enroll(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    with SessionLocal() as session:
        db_user = repo.get_user_by_email(session, user["username"])
        if db_user is None:
            raise HTTPException(status_code=404, detail="User not found")
        try:
            member = repo.request_membership(session, group_id, db_user.id)
            session.commit()
        except ValueError as exc:
            status_code = 404 if "not found" in str(exc) else 409
            raise HTTPException(status_code=status_code, detail=str(exc)) from exc
        return {"status": member.status, "group_id": group_id}


@app.post("/api/heartbeat/{lab_id}")
def heartbeat(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    require_lab_visible(user, lab_id)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    touch_runtime_state(lab_id, student_id)
    return {"status": "ok", "lab_id": lab_id, "student": student_id}


# ---------------------------------------------------------------------------
# Internal / terminal auth (unchanged)
# ---------------------------------------------------------------------------


@app.get("/internal/terminal-auth")
@app.get("/internal/terminal-auth/{terminal_port}")
def terminal_auth(
    request: Request,
    terminal_port: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    if terminal_port is None:
        original_uri = request.headers.get("x-original-uri", "")
        match = re.match(r"^/terminal/([0-9]+)/", original_uri)
        if not match:
            raise HTTPException(status_code=400, detail="Missing terminal endpoint")
        terminal_port = int(match.group(1))

    terminal_owner = terminal_owner_for_port(terminal_port)

    if not terminal_owner:
        raise HTTPException(status_code=404, detail="Unknown terminal endpoint")

    allowed = user["role"] == "student" and user_student_id(user) == terminal_owner["student_id"]
    if not allowed:
        raise HTTPException(status_code=403, detail="Terminal is not assigned to this user")

    credential = f"{terminal_owner['student_id']}:{terminal_owner['lab_password']}"
    encoded = base64.b64encode(credential.encode("utf-8")).decode("ascii")
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.headers["X-Terminal-Authorization"] = f"Basic {encoded}"
    return response


# ---------------------------------------------------------------------------
# Internal / instructor auth (for nginx auth_request)
# ---------------------------------------------------------------------------


@app.get("/internal/instructor-auth")
def instructor_auth(
    user: dict = Depends(get_authenticated_user),
):
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Instructor JSON API endpoints
# ---------------------------------------------------------------------------


def require_instructor(user: dict) -> None:
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")


@app.get("/api/instructor/labs")
def api_instructor_labs(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    runtime_states = dict(tracked_runtime_items())
    labs = []
    for scenario in list_scenarios():
        lab_id = scenario["id"]
        active_count = 0
        total_students = 0
        for student in get_student_users().values():
            total_students += 1
            if (
                runtime_states.get(state_key(lab_id, student["student_id"]), {}).get("status")
                == "running"
            ):
                active_count += 1
        labs.append(
            {
                "id": lab_id,
                "title": scenario["title"],
                "difficulty": scenario.get("difficulty"),
                "active_sessions": active_count,
                "total_students": total_students,
                "student_guide_url": student_guide_url(scenario),
                "solution_notes_url": solution_notes_url(scenario),
                "instructor_guide_url": instructor_guide_url(scenario),
            }
        )
    return labs


@app.get("/api/instructor/labs/{lab_id}")
def api_instructor_lab_detail(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    validate_lab_id(lab_id)
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    active_sessions = []
    completed_sessions = []
    runtime_states = dict(tracked_runtime_items())

    for student in get_student_users().values():
        student_id = student["student_id"]
        runtime_state = runtime_states.get(state_key(lab_id, student_id), {})
        status_text = runtime_state.get("status", "not_created")
        session_id = runtime_state.get("session_id", "")
        started_at = runtime_state.get("started_at")
        last_seen = runtime_state.get("last_seen")

        session_info = {
            "student_id": student_id,
            "status": status_text,
            "session_id": session_id,
            "started_at": started_at,
            "last_seen": last_seen,
            "feedback_submitted": feedback_exists(lab_id, student_id, session_id),
        }

        if status_text == "running":
            active_sessions.append(session_info)
        elif status_text in ("ended", "stopped", "not_created"):
            # Fetch commands and check results for completed sessions
            commands = get_command_events_for_student(lab_id, student_id)
            check_results = get_check_results_for_student(lab_id, student_id)
            lifecycle_events = get_lifecycle_events_for_student(lab_id, student_id)

            # Calculate duration from lifecycle events or runtime state
            duration_seconds = None
            if lifecycle_events:
                start_events = [e for e in lifecycle_events if e.get("action") == "start"]
                end_events = [
                    e for e in lifecycle_events if e.get("action") in ("end", "destroy", "stop")
                ]
                if start_events and end_events:
                    try:
                        start_ts = time.mktime(
                            time.strptime(start_events[-1]["timestamp"], "%Y-%m-%dT%H:%M:%SZ")
                        )
                        end_ts = time.mktime(
                            time.strptime(end_events[-1]["timestamp"], "%Y-%m-%dT%H:%M:%SZ")
                        )
                        duration_seconds = round(end_ts - start_ts, 1)
                    except (ValueError, KeyError):
                        pass

            if duration_seconds is None and started_at and last_seen:
                duration_seconds = round(last_seen - started_at, 1)

            # Get latest check result
            latest_check = None
            if check_results:
                latest_check = check_results[-1].get("check_result")

            session_info.update(
                {
                    "commands": commands,
                    "duration_seconds": duration_seconds,
                    "check_result": latest_check,
                    "check_count": len(check_results),
                }
            )
            completed_sessions.append(session_info)

    return {
        "scenario": scenario,
        "active_sessions": active_sessions,
        "completed_sessions": completed_sessions,
        "feedback_count": len(list_feedback(lab_id)),
    }


@app.get("/api/instructor/labs/{lab_id}/sessions/{student_id}")
def api_instructor_session_detail(
    lab_id: str, student_id: str, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    validate_lab_id(lab_id)
    status_text = _fast_lab_status(lab_id, student_id)
    runtime_state = runtime_state_for(lab_id, student_id)
    session_id = runtime_state.get("session_id", "")
    started_at = runtime_state.get("started_at")
    last_seen = runtime_state.get("last_seen")

    commands = get_command_events_for_student(lab_id, student_id)
    check_results = get_check_results_for_student(lab_id, student_id)
    lifecycle_events = get_lifecycle_events_for_student(lab_id, student_id)
    sessions = get_lab_sessions_for_student(lab_id, student_id)
    latest_session = sessions[0] if sessions else None
    duration_seconds = latest_session.get("duration_seconds") if latest_session else None

    latest_check = None
    if check_results:
        latest_check = check_results[-1].get("check_result")

    scenario = load_scenario_metadata(lab_id)

    return {
        "lab_id": lab_id,
        "student_id": student_id,
        "status": status_text,
        "session_id": session_id,
        "started_at": started_at,
        "last_seen": last_seen,
        "duration_seconds": duration_seconds,
        "commands": commands,
        "check_results": check_results,
        "latest_check": latest_check,
        "lifecycle_events": lifecycle_events,
        "sessions": sessions,
        "scenario": scenario,
        "feedback_submitted": feedback_exists(lab_id, student_id, session_id),
    }


@app.get("/api/instructor/students")
def api_instructor_students(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        students = repo.list_users(session, role="student")
        return [
            {
                # student_id/username kept for backward compatibility with the UI
                "student_id": s.internal_id or s.email,
                "username": s.email,
                "email": s.email,
                "number": s.number,
                "must_change_password": bool(s.must_change_password),
                "active": bool(s.active),
                "groups": [
                    {"id": m.group.id, "name": m.group.name}
                    for m in s.memberships
                    if m.status == "approved"
                ],
            }
            for s in students
        ]


@app.get("/api/instructor/students/{student_id}")
def api_instructor_student_detail(
    student_id: str,
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    return analytics_service.student_detail(student_id, group_id=group_id)


def _aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite drops tzinfo on read even though deadlines are always written as
    UTC-aware (see the assign-lab endpoint). Re-attach UTC before comparing
    against datetime.now(timezone.utc), or the comparison raises TypeError."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _build_session_history(lifecycle):
    """Group lifecycle events into discrete sessions (start→end).

    A session starts at a "start" event and ends at the next
    "end"/"stop"/"destroy"/"auto_stop" event. Events before the first
    "start" (orphans from before session tracking) are discarded.
    Consecutive "start" events without an intervening end collapse into
    one session (treats the last start as the real start).
    Returns newest session first.
    """
    end_actions = {"end", "stop", "destroy", "auto_stop"}
    sessions = []
    current = None
    for ev in lifecycle:
        action = ev.get("action", "")
        ts = ev.get("timestamp", "")
        if action == "start":
            if current and current.get("ended_at"):
                sessions.append(current)
            current = {"started_at": ts, "ended_at": None, "check_count": 0}
        elif action in end_actions:
            if current and not current.get("ended_at"):
                current["ended_at"] = ts
                current["outcome"] = action
                sessions.append(current)
                current = None
        elif action == "check":
            if current:
                current["check_count"] = current.get("check_count", 0) + 1

    if current and not current.get("ended_at"):
        current["outcome"] = "running"
        sessions.append(current)

    def _parse_ts(s):
        try:
            return time.mktime(time.strptime(s, "%Y-%m-%dT%H:%M:%SZ"))
        except (ValueError, TypeError):
            return None

    for s in sessions:
        t0 = _parse_ts(s["started_at"])
        t1 = _parse_ts(s.get("ended_at"))
        s["duration_seconds"] = round(t1 - t0, 1) if t0 and t1 else None
        if "outcome" not in s:
            s["outcome"] = "end"

    sessions.reverse()
    return sessions


@app.get("/api/instructor/feedback/{lab_id}")
def api_instructor_feedback(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    validate_lab_id(lab_id)
    summary = feedback_analytics(lab_id)
    responses = list_feedback(lab_id)
    summary["responses"] = (
        [
            {
                "response_id": response["response_id"],
                "timestamp": response["timestamp"],
                "section_a": response["section_a"],
                "comment": response["comment"],
                "issue_category": response.get("issue_category"),
                "synthetic": response.get("synthetic", False),
            }
            for response in responses
        ]
        if len(responses) >= 5
        else []
    )
    return summary


@app.get("/api/instructor/analytics")
def api_instructor_analytics(
    group_id: Optional[int] = None,
    include_inactive: bool = False,
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    return analytics_service.instructor_analytics(
        group_id=group_id, include_inactive=include_inactive
    )


@app.get("/api/results")
def api_student_results(user: dict = Depends(get_authenticated_user)):
    require_student(user)
    return analytics_service.student_results(user_student_id(user))


@app.get("/api/results/{lab_id}")
def api_student_lab_results(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    require_lab_assigned(user, lab_id)
    result = analytics_service.student_results(user_student_id(user))
    lab = next((item for item in result["labs"] if item["lab_id"] == lab_id), None)
    detail = analytics_service.student_detail(user_student_id(user))
    lab_detail = next((item for item in detail["labs"] if item["lab_id"] == lab_id), None)
    if lab is None or lab_detail is None:
        raise HTTPException(status_code=404, detail="Result not found")
    return {**lab, **lab_detail}


@app.post("/api/instructor/evidence/export")
async def api_export_evidence(request: Request, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    validate_token(body.get("csrf_token", ""), user)
    evaluation_id = body.get("evaluation_id", "")
    anonymize = bool(body.get("anonymize", False))
    if not evaluation_id:
        raise HTTPException(status_code=400, detail="evaluation_id required")
    build_evidence_export(evaluation_id, anonymize=anonymize)
    return {"ok": True, "download_url": f"/api/instructor/evidence/export/{evaluation_id}"}


@app.get("/api/instructor/evidence/export/{export_id}")
def api_download_export(export_id: str, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    export_path = (
        Path(settings.PORTAL_DB_PATH).parent / "evidence" / "exports" / f"{export_id}.tar.gz"
    )
    if not export_path.is_file():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(
        str(export_path),
        media_type="application/gzip",
        filename=f"{export_id}.tar.gz",
    )


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------


def _require_instructor_csrf(request: Request, user: dict, body: Optional[dict] = None) -> None:
    """Validate a form token from the JSON body (POST) or X-CSRF-Token header
    (DELETE). State-changing instructor actions are CSRF-protected like the
    student lifecycle actions."""
    token = ""
    if isinstance(body, dict):
        token = body.get("csrf_token", "")
    if not token:
        token = request.headers.get("x-csrf-token", "")
    validate_token(token, user)


def _destroy_student_labs(student_id: str) -> None:
    """Best-effort teardown of a student's lab instances before removal, so the
    freed student number/ports are safe to reuse (see repository.next_free_number)."""
    for lab_id in tracked_labs_for_student(student_id):
        try:
            success, stdout, _stderr = run_labctl("destroy", lab_id, student_id)
            if success:
                _save_command_logs_from_output(lab_id, student_id, stdout)
                remove_runtime_key(state_key(lab_id, student_id))
        except Exception:
            logger.warning("Teardown failed for %s/%s", lab_id, student_id)
    remove_student_runtime(student_id)


@app.get("/api/instructor/csrf")
def api_instructor_csrf(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    return {"csrf_token": generate_token(user)}


@app.post("/api/instructor/students")
async def api_create_student(request: Request, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    email = body.get("email", "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    with SessionLocal() as session:
        try:
            student, initial_password = repo.create_student(session, email)
            session.commit()
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {
            "student_id": student.internal_id,
            "email": student.email,
            "number": student.number,
            # Shown to the instructor exactly once; only the hash is stored.
            "initial_password": initial_password,
        }


@app.delete("/api/instructor/students/{student_id}")
def api_delete_student(
    student_id: str, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    _require_instructor_csrf(request, user)
    with SessionLocal() as session:
        target = repo.get_user_by_internal_id(session, student_id)
        if target is None or target.role != "student":
            raise HTTPException(status_code=404, detail="Student not found")
        user_id = target.id
    # Tear down running labs before deleting (releases ports for number reuse).
    _destroy_student_labs(student_id)
    with SessionLocal() as session:
        repo.remove_user(session, user_id)
        session.commit()
    return {"ok": True}


def _group_to_dict(group) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "semester": group.semester,
        "is_active": group.is_active,
        "members": [
            {"student_id": m.user.internal_id or m.user.email, "email": m.user.email}
            for m in group.members
            if m.status == "approved"
        ],
        "labs": [gl.lab_id for gl in group.labs],
    }


def _group_summary(group) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "semester": group.semester,
        "is_active": group.is_active,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "member_count": sum(1 for m in group.members if m.status == "approved"),
        "pending_count": sum(1 for m in group.members if m.status == "pending"),
        "lab_count": len(group.labs),
    }


@app.get("/api/instructor/groups")
def api_list_groups(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        return [_group_summary(g) for g in repo.list_groups(session)]


@app.post("/api/instructor/groups")
async def api_create_group(request: Request, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    semester = body.get("semester", "").strip() or None
    is_active = bool(body.get("is_active", True))
    with SessionLocal() as session:
        try:
            group = repo.create_group(session, name, semester=semester, is_active=is_active)
            session.commit()
            return _group_to_dict(group)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/api/instructor/groups/{group_id}")
def api_delete_group(group_id: int, request: Request, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    _require_instructor_csrf(request, user)
    with SessionLocal() as session:
        if not repo.delete_group(session, group_id):
            raise HTTPException(status_code=404, detail="Group not found")
        session.commit()
    return {"ok": True}


@app.post("/api/instructor/groups/{group_id}/rename")
async def api_rename_group(
    group_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    semester = body.get("semester")
    is_active = body.get("is_active")
    with SessionLocal() as session:
        try:
            group = repo.rename_group(
                session,
                group_id,
                name,
                semester=semester,
                is_active=None if is_active is None else bool(is_active),
            )
            if group is None:
                raise HTTPException(status_code=404, detail="Group not found")
            session.commit()
            return _group_summary(group)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/instructor/groups/{group_id}/members")
async def api_add_member(
    group_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    student_id = body.get("student_id", "").strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required")
    with SessionLocal() as session:
        target = repo.get_user_by_internal_id(session, student_id)
        if target is None or target.role != "student":
            raise HTTPException(status_code=404, detail="Student not found")
        try:
            repo.add_member(session, group_id, target.id)
            session.commit()
        except ValueError as exc:
            status_code = 404 if "not found" in str(exc) else 409
            raise HTTPException(status_code=status_code, detail=str(exc)) from exc
        group = repo.get_group(session, group_id)
        return _group_to_dict(group)


@app.delete("/api/instructor/groups/{group_id}/members/{student_id}")
def api_remove_member(
    group_id: int,
    student_id: str,
    request: Request,
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    _require_instructor_csrf(request, user)
    with SessionLocal() as session:
        target = repo.get_user_by_internal_id(session, student_id)
        if target is None:
            raise HTTPException(status_code=404, detail="Student not found")
        if not repo.remove_member(session, group_id, target.id):
            raise HTTPException(status_code=404, detail="Membership not found")
        session.commit()
    return {"ok": True}


@app.post("/api/instructor/groups/{group_id}/labs")
async def api_assign_lab(
    group_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    lab_id = body.get("lab_id", "").strip()
    if not lab_id:
        raise HTTPException(status_code=400, detail="lab_id is required")
    validate_lab_id(lab_id)
    if load_scenario_metadata(lab_id) is None:
        raise HTTPException(status_code=404, detail="Lab not found")
    deadline = None
    deadline_str = body.get("deadline")
    if deadline_str:
        try:
            dl = deadline_str.replace("Z", "+00:00")
            deadline = datetime.fromisoformat(dl)
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid deadline format") from None
    with SessionLocal() as session:
        try:
            repo.assign_lab(session, group_id, lab_id, deadline=deadline)
            session.commit()
            sync_assignment_obligations()
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        group = repo.get_group(session, group_id)
        return _group_to_dict(group)


@app.delete("/api/instructor/groups/{group_id}/labs/{lab_id}")
def api_unassign_lab(
    group_id: int,
    lab_id: str,
    request: Request,
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    _require_instructor_csrf(request, user)
    with SessionLocal() as session:
        if not repo.unassign_lab(session, group_id, lab_id):
            raise HTTPException(status_code=404, detail="Assignment not found")
        session.commit()
    sync_assignment_obligations()
    return {"ok": True}


@app.get("/api/instructor/groups/{group_id}")
def api_group_detail(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        group = repo.get_group(session, group_id)
        if group is None:
            raise HTTPException(status_code=404, detail="Group not found")
        pending = [
            {
                "user_id": m.user.id,
                "student_id": m.user.internal_id or m.user.email,
                "email": m.user.email,
                "semester": m.user.semester,
                "study_program": m.user.study_program,
                "requested_at": m.requested_at.isoformat() if m.requested_at else None,
            }
            for m in group.members
            if m.status == "pending"
        ]
        approved = [
            {
                "user_id": m.user.id,
                "student_id": m.user.internal_id or m.user.email,
                "email": m.user.email,
                "semester": m.user.semester,
                "study_program": m.user.study_program,
            }
            for m in group.members
            if m.status == "approved"
        ]
        labs = [
            {
                "lab_id": gl.lab_id,
                "deadline": gl.deadline.isoformat() if gl.deadline else None,
            }
            for gl in group.labs
        ]

        member_ids = {
            m.user.internal_id or m.user.email for m in group.members if m.status == "approved"
        }
        recent_activity = analytics_service.recent_activity(member_ids)

        return {
            "id": group.id,
            "name": group.name,
            "semester": group.semester,
            "is_active": group.is_active,
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "pending_members": pending,
            "approved_members": approved,
            "labs": labs,
            "recent_activity": recent_activity,
            "csrf_token": generate_token(user),
        }


@app.post("/api/instructor/groups/{group_id}/approve")
async def api_approve_members(
    group_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    user_ids = body.get("user_ids", [])
    if not isinstance(user_ids, list) or not user_ids:
        raise HTTPException(status_code=400, detail="user_ids list required")
    with SessionLocal() as session:
        try:
            count = repo.approve_members(session, group_id, user_ids)
            session.commit()
            sync_assignment_obligations()
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"approved": count}


@app.post("/api/instructor/groups/{group_id}/reject")
async def api_reject_members(
    group_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from None
    _require_instructor_csrf(request, user, body)
    user_ids = body.get("user_ids", [])
    if not isinstance(user_ids, list) or not user_ids:
        raise HTTPException(status_code=400, detail="user_ids list required")
    with SessionLocal() as session:
        try:
            count = repo.reject_members(session, group_id, user_ids)
            session.commit()
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"rejected": count}


@app.get("/api/instructor/groups/{group_id}/progress")
def api_group_progress(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    result = analytics_service.group_progress(group_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return result


def _legacy_api_group_progress(group_id: int):
    """Retained temporarily for migration comparison; not exposed as a route."""
    with SessionLocal() as session:
        group = repo.get_group(session, group_id)
        if group is None:
            raise HTTPException(status_code=404, detail="Group not found")
        approved = [m for m in group.members if m.status == "approved"]
        lab_ids = [gl.lab_id for gl in group.labs]
        total_labs = len(lab_ids)

        now = datetime.now(timezone.utc)
        lab_deadlines = {gl.lab_id: _aware_utc(gl.deadline) for gl in group.labs}

        students = []
        total_group_passed = 0
        total_at_risk = 0
        lab_stats: dict[str, dict] = {
            lid: {"passed": 0, "attempted": 0, "total_time": 0.0} for lid in lab_ids
        }
        for m in approved:
            sid = m.user.internal_id or m.user.email
            passed = 0
            passed_lab_ids: set[str] = set()
            total_sessions = 0
            last_active = None
            total_time = 0.0
            for lid in lab_ids:
                crs = get_check_results_for_student(lid, sid)
                lifecycle = get_lifecycle_events_for_student(lid, sid)
                sessions = _build_session_history(lifecycle)
                total_sessions += len(sessions)
                for s in sessions:
                    if s.get("duration_seconds"):
                        total_time += s["duration_seconds"]
                    ts = s.get("started_at")
                    if ts and (last_active is None or ts > last_active):
                        last_active = ts
                    ts_end = s.get("ended_at")
                    if ts_end and (last_active is None or ts_end > last_active):
                        last_active = ts_end
                if sessions:
                    lab_stats[lid]["attempted"] += 1
                    for s in sessions:
                        if s.get("duration_seconds"):
                            lab_stats[lid]["total_time"] += s["duration_seconds"]
                if crs:
                    latest = crs[-1].get("check_result", {})
                    if latest.get("passed") or latest.get("status") == "fixed":
                        passed += 1
                        passed_lab_ids.add(lid)
                        lab_stats[lid]["passed"] += 1
            total_group_passed += passed
            at_risk = any(
                lab_deadlines.get(lid) and lab_deadlines[lid] < now and lid not in passed_lab_ids
                for lid in lab_ids
            )
            if at_risk:
                total_at_risk += 1
            students.append(
                {
                    "user_id": m.user.id,
                    "student_id": sid,
                    "email": m.user.email,
                    "semester": m.user.semester,
                    "study_program": m.user.study_program,
                    "labs_assigned": total_labs,
                    "labs_passed": passed,
                    "total_sessions": total_sessions,
                    "last_active": last_active,
                    "total_time_seconds": round(total_time, 1),
                    "at_risk": at_risk,
                }
            )

        lab_summaries = []
        for lid in lab_ids:
            sc = load_scenario_metadata(lid)
            ls = lab_stats[lid]
            n = len(approved) or 1
            lab_summaries.append(
                {
                    "lab_id": lid,
                    "title": sc["title"] if sc else lid,
                    "pass_rate": round(ls["passed"] / n * 100) if n else 0,
                    "avg_time_minutes": round(ls["total_time"] / max(ls["attempted"], 1) / 60, 1),
                    "students_attempted": ls["attempted"],
                    "students_passed": ls["passed"],
                }
            )

        return {
            "total_labs": total_labs,
            "total_students": len(approved),
            "total_passed": total_group_passed,
            "total_possible": total_labs * len(approved),
            "total_at_risk": total_at_risk,
            "students": students,
            "labs": lab_summaries,
        }


@app.get("/api/instructor/groups/{group_id}/export-csv")
def api_group_export_csv(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)

    with SessionLocal() as session:
        group = repo.get_group(session, group_id)
        if group is None:
            raise HTTPException(status_code=404, detail="Group not found")
        approved = [m for m in group.members if m.status == "approved"]
        lab_ids = [gl.lab_id for gl in group.labs]

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["Student", "Email", "Lab", "Passed", "Sessions", "Time Spent (min)", "Last Active"]
        )

        for m in approved:
            sid = m.user.internal_id or m.user.email
            for lid in lab_ids:
                crs = get_check_results_for_student(lid, sid)
                lifecycle = get_lifecycle_events_for_student(lid, sid)
                sessions = _build_session_history(lifecycle)
                passed = False
                if crs:
                    latest = crs[-1].get("check_result", {})
                    passed = bool(latest.get("passed") or latest.get("status") == "fixed")
                total_time = sum(s.get("duration_seconds", 0) or 0 for s in sessions)
                last_active = None
                for s in sessions:
                    for ts_key in ("started_at", "ended_at"):
                        ts = s.get(ts_key)
                        if ts and (last_active is None or ts > last_active):
                            last_active = ts
                sc = load_scenario_metadata(lid)
                lab_title = sc["title"] if sc else lid
                writer.writerow(
                    [
                        sid,
                        m.user.email,
                        lab_title,
                        "Yes" if passed else "No",
                        len(sessions),
                        round(total_time / 60, 1) if total_time else 0,
                        last_active or "",
                    ]
                )

        csv_content = buf.getvalue()
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{group.name}-grades.csv"'},
        )


@app.get("/api/instructor/students-progress")
def api_instructor_students_progress(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    return analytics_service.students_progress()


def _legacy_api_instructor_students_progress():
    """Retained temporarily for migration comparison; not exposed as a route."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        students = repo.list_users(session, role="student")
        result = []
        for s in students:
            sid = s.internal_id or s.email
            memberships = [m for m in s.memberships if m.status == "approved"]
            groups = [{"id": m.group.id, "name": m.group.name} for m in memberships]

            # labs_assigned must match what the group-progress page counts: labs
            # actually assigned to one of the student's approved groups, not
            # "any lab the student happened to start a session for" (that was
            # the old behavior and produced a different denominator than the
            # per-group progress view for the same student).
            assigned_lab_ids: set[str] = set()
            lab_deadlines: dict[str, datetime | None] = {}
            for m in memberships:
                for gl in m.group.labs:
                    assigned_lab_ids.add(gl.lab_id)
                    dl = _aware_utc(gl.deadline)
                    existing = lab_deadlines.get(gl.lab_id)
                    if existing is None or (dl and dl > existing):
                        lab_deadlines[gl.lab_id] = dl

            labs_passed = 0
            passed_lab_ids: set[str] = set()
            total_sessions = 0
            total_time = 0.0
            last_active = None
            for lid in assigned_lab_ids:
                crs = get_check_results_for_student(lid, sid)
                lifecycle = get_lifecycle_events_for_student(lid, sid)
                sessions = _build_session_history(lifecycle)
                total_sessions += len(sessions)
                for sess in sessions:
                    if sess.get("duration_seconds"):
                        total_time += sess["duration_seconds"]
                    for ts_key in ("started_at", "ended_at"):
                        ts = sess.get(ts_key)
                        if ts and (last_active is None or ts > last_active):
                            last_active = ts
                if crs:
                    latest = crs[-1].get("check_result", {})
                    if latest.get("passed") or latest.get("status") == "fixed":
                        labs_passed += 1
                        passed_lab_ids.add(lid)

            at_risk = any(
                lab_deadlines.get(lid) and lab_deadlines[lid] < now and lid not in passed_lab_ids
                for lid in assigned_lab_ids
            )

            result.append(
                {
                    "student_id": sid,
                    "email": s.email,
                    "semester": s.semester,
                    "study_program": s.study_program,
                    "groups": groups,
                    "labs_passed": labs_passed,
                    "labs_assigned": len(assigned_lab_ids),
                    "total_sessions": total_sessions,
                    "total_time_seconds": round(total_time, 1),
                    "last_active": last_active,
                    "at_risk": at_risk,
                }
            )
        return result


# ---------------------------------------------------------------------------
# React SPA serving (student + instructor portal)
# ---------------------------------------------------------------------------


def _serve_spa():
    if not SPA_INDEX.is_file():
        return HTMLResponse(
            "<h1>Portal UI not built</h1>"
            "<p>Run <code>cd controller/lab-portal-ui && npm run build</code></p>",
            status_code=503,
        )
    return FileResponse(str(SPA_INDEX))


@app.get("/signup", response_class=HTMLResponse)
def signup_spa():
    return _serve_spa()


@app.get("/privacy-policy", response_class=HTMLResponse)
def privacy_policy_spa():
    return _serve_spa()


@app.get("/", response_class=HTMLResponse)
def index():
    return _serve_spa()


@app.get("/portal", response_class=HTMLResponse)
def portal_overview():
    return _serve_spa()


@app.get("/results", response_class=HTMLResponse)
@app.get("/results/{lab_id}", response_class=HTMLResponse)
def student_results_spa(lab_id: Optional[str] = None):
    _ = lab_id
    return _serve_spa()


@app.get("/workstation-access", response_class=HTMLResponse)
def workstation_access_spa():
    return _serve_spa()


@app.get("/labs/{lab_id}", response_class=HTMLResponse)
def lab_detail_spa(lab_id: str):
    _ = lab_id
    return _serve_spa()


@app.get("/labs/{lab_id}/feedback", response_class=HTMLResponse)
def feedback_spa(lab_id: str):
    _ = lab_id
    return _serve_spa()


@app.get("/instructor/login", response_class=HTMLResponse)
def instructor_login_spa():
    return _serve_spa()


@app.get("/instructor", response_class=HTMLResponse)
def instructor_spa():
    return _serve_spa()


@app.get("/instructor/results", response_class=HTMLResponse)
def instructor_results_spa():
    return _serve_spa()


@app.get("/instructor/analytics", response_class=HTMLResponse)
def instructor_analytics_spa():
    return _serve_spa()


@app.get("/instructor/students", response_class=HTMLResponse)
def instructor_students_spa():
    return _serve_spa()


@app.get("/instructor/pending", response_class=HTMLResponse)
def instructor_pending_spa():
    return _serve_spa()


@app.get("/instructor/account/password", response_class=HTMLResponse)
def instructor_account_password_spa():
    return _serve_spa()


@app.get("/instructor/groups", response_class=HTMLResponse)
def instructor_groups_spa():
    return _serve_spa()


@app.get("/enrollment", response_class=HTMLResponse)
def enrollment_spa():
    return _serve_spa()


@app.get("/instructor/groups/{group_id}", response_class=HTMLResponse)
def instructor_group_detail_spa(group_id: int):
    _ = group_id
    return _serve_spa()


@app.get("/instructor/groups/{group_id}/labs", response_class=HTMLResponse)
@app.get("/instructor/groups/{group_id}/pending", response_class=HTMLResponse)
@app.get("/instructor/groups/{group_id}/activity", response_class=HTMLResponse)
def instructor_group_section_spa(group_id: int):
    _ = group_id
    return _serve_spa()


@app.get("/instructor/groups/{group_id}/results", response_class=HTMLResponse)
def instructor_group_results_spa(group_id: int):
    _ = group_id
    return _serve_spa()


@app.get("/instructor/groups/{group_id}/analytics", response_class=HTMLResponse)
def instructor_group_analytics_spa(group_id: int):
    _ = group_id
    return _serve_spa()


@app.get("/instructor/labs/{lab_id}", response_class=HTMLResponse)
def instructor_lab_spa(lab_id: str):
    _ = lab_id
    return _serve_spa()


@app.get("/instructor/labs/{lab_id}/{student_id}", response_class=HTMLResponse)
def instructor_session_spa(lab_id: str, student_id: str):
    _ = lab_id
    _ = student_id
    return _serve_spa()


@app.get("/instructor/groups/{group_id}/students/{student_id}", response_class=HTMLResponse)
def instructor_group_student_spa(group_id: int, student_id: str):
    _ = group_id
    _ = student_id
    return _serve_spa()


@app.get(
    "/instructor/groups/{group_id}/students/{student_id}/labs/{lab_id}",
    response_class=HTMLResponse,
)
def instructor_group_session_spa(group_id: int, student_id: str, lab_id: str):
    _ = group_id
    _ = student_id
    _ = lab_id
    return _serve_spa()


# ---------------------------------------------------------------------------
# Background scheduler (unchanged)
# ---------------------------------------------------------------------------


def lab_lifecycle_manager():
    while True:
        try:
            current_time = time.time()
            tracked_items = tracked_runtime_items()

            for key, runtime_state in tracked_items:
                try:
                    lab_id, student_id = key.split(":", 1)
                except ValueError:
                    continue

                scenario = load_scenario_metadata(lab_id)
                if not scenario:
                    continue

                lifecycle = scenario.get("lifecycle", {})
                idle_timeout = scenario_idle_timeout(scenario)
                max_runtime = lifecycle.get("max_runtime_minutes")
                destroy_timeout = lifecycle.get("retention_after_stop_minutes")
                last_seen = runtime_state.get("last_seen", current_time)
                started_at = runtime_state.get("started_at", current_time)
                idle_minutes = (current_time - last_seen) / 60
                runtime_minutes = (current_time - started_at) / 60

                should_stop_for_idle = (
                    runtime_state.get("status") == "running"
                    and idle_timeout is not None
                    and idle_minutes > float(idle_timeout)
                )
                should_stop_for_runtime = (
                    runtime_state.get("status") == "running"
                    and max_runtime is not None
                    and runtime_minutes > float(max_runtime)
                )

                if should_stop_for_idle or should_stop_for_runtime:
                    reason = "max_runtime" if should_stop_for_runtime else "idle"
                    session_id = runtime_state.get("session_id")
                    success, stdout, stderr = run_labctl("stop", lab_id, student_id)
                    if success:
                        _save_command_logs_from_output(lab_id, student_id, stdout)
                    record_event(
                        "auto_stop",
                        lab_id,
                        student_id,
                        "scheduler",
                        "success" if success else "error",
                        detail=reason if success else stderr,
                        session_id=session_id,
                        actor_type="system",
                        reason=reason,
                    )
                    if success:
                        close_lab_session(session_id, "auto_stop", reason)
                        update_runtime_state(lab_id, student_id, "stopped", last_seen=current_time)
                    else:
                        update_runtime_state(lab_id, student_id, "error")

                elif (
                    runtime_state.get("status") == "stopped"
                    and destroy_timeout is not None
                    and idle_minutes > float(destroy_timeout)
                ):
                    success, stdout, stderr = run_labctl("destroy", lab_id, student_id)
                    if success:
                        _save_command_logs_from_output(lab_id, student_id, stdout)
                    record_event(
                        "retention_cleanup",
                        lab_id,
                        student_id,
                        "scheduler",
                        "success" if success else "error",
                        detail=stderr if stderr else None,
                        session_id=runtime_state.get("session_id"),
                        actor_type="system",
                        reason="retention",
                    )
                    if success:
                        remove_runtime_key(key)
        except Exception as exc:
            record_event("scheduler", "system", "system", "scheduler", "error", detail=str(exc))

        time.sleep(settings.SCHEDULER_INTERVAL_SECONDS)


if settings.ENABLE_SCHEDULER:
    threading.Thread(target=lab_lifecycle_manager, daemon=True).start()
