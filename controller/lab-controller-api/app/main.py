import base64
import csv
import hashlib
import hmac
import io
import json
import logging
import os
import re
import shutil
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
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
    get_student_users,
    get_unarchived_labs_detail,
    get_visible_lab_ids,
    lookup_user,
)
from app.bootstrap import ensure_admin_bootstrap
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
    session_group_id,
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
    is_sample_lab,
    list_scenarios,
    load_lab_description,
    load_scenario_metadata,
    solution_notes_url,
    student_guide_url,
    terminal_owner_for_port,
    user_student_id,
    validate_lab_id,
)
from app.semesters import validate_semester
from app.ssh_client import run_labctl, run_labctl_system_status

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
    ensure_admin_bootstrap()
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
    # labctl can set the workstation account and terminal credential.
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
            actor=_actor_id(user),
            actor_type=user.get("role", "student"),
            result="success" if success else "error",
            duration_seconds=duration,
            detail=stderr if stderr else None,
            session_id=session_id,
            reason=reason,
        )
    return success, stdout, stderr, duration


def _run_system_check(
    lab_id: str, user: dict, session_id: str, phase: str, group_id: Optional[int]
):
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
        group_id=group_id,
    )
    update_runtime_state(
        lab_id,
        student_id,
        "running",
        last_seen=time.time(),
        last_check=check_result,
        group_id=group_id,
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
    # Block all student lab routes until the initial
    # password is changed. /api/me, /api/password, /api/logout do not call this.
    if user.get("must_change_password"):
        raise HTTPException(status_code=403, detail="password_change_required")


def _assignments_for_lab(assignments: list[dict], lab_id: str) -> list[dict]:
    """Filter an assignment-detail list (as returned by the get_*_labs_detail
    helpers in app.auth) down to the entries for one lab_id. A lab assigned in
    two of a student's groups appears as two entries with different group_id."""
    return [item for item in assignments if item["lab_id"] == lab_id]


def _resolve_lab_assignment(assignments: list[dict], lab_id: str, group_id: Optional[int]) -> dict:
    """Resolve exactly one assignment entry for (lab_id, group_id) out of a
    student's assignment-detail list. Shared by the read routes (lab detail,
    feedback, results) that must disambiguate when the same lab is assigned
    in more than one of the student's groups:
      - no candidates                           -> 404
      - exactly one candidate, no group_id given -> use it (keeps single-group
                                                     students working with no
                                                     client change)
      - >1 candidate, no group_id given          -> 400 naming the candidates
      - group_id given but not among candidates  -> 404
    """
    candidates = _assignments_for_lab(assignments, lab_id)
    if not candidates:
        raise HTTPException(status_code=404, detail="Lab not found")
    if group_id is not None:
        match = next((item for item in candidates if item["group_id"] == group_id), None)
        if match is None:
            raise HTTPException(status_code=404, detail="Lab not found")
        return match
    if len(candidates) == 1:
        return candidates[0]
    names = ", ".join(
        sorted({item.get("group_name") or str(item["group_id"]) for item in candidates})
    )
    raise HTTPException(
        status_code=400,
        detail=f"This lab is assigned in multiple groups ({names}); specify group_id.",
    )


def _resolve_start_group(assignments: list[dict], lab_id: str, group_id: Optional[int]) -> dict:
    """Validate the group_id the start-lab client sends against the student's
    approved assignments. Unlike _resolve_lab_assignment (used by the read
    routes, where an unknown group is a 404/400 "not found"), a bad group here
    is an authorization failure (403): the client is expected to always name
    the group it wants to start the lab for."""
    candidates = _assignments_for_lab(assignments, lab_id)
    if group_id is not None:
        match = next((item for item in candidates if item["group_id"] == group_id), None)
        if match is None:
            raise HTTPException(status_code=403, detail="Lab not assigned in that group")
        return match
    if len(candidates) == 1:
        return candidates[0]
    raise HTTPException(status_code=403, detail="group_id is required to start this lab")


def require_lab_visible(user: dict, lab_id: str) -> None:
    """Reject a student acting on a lab not assigned to one of their groups.

    Enforcement is server-side, not only UI hiding.
    """
    if user["role"] != "student":
        return
    if lab_id not in get_visible_lab_ids(user["username"]):
        raise HTTPException(status_code=403, detail="Lab not assigned")


def _actor_id(user: dict) -> str:
    """Who to record as the actor on an evidence row.

    Students are identified by their pseudonymous internal id (`studentNN`),
    never by email: the row already carries `student_id`, and `actor_type`
    already says whether a student, the system, or the scheduler acted, so an
    address here is redundant PII sitting in every evidence table.

    Instructors have no internal id, so they are still recorded by email. They
    act on the platform rather than being the subjects of the data it holds.
    """
    if user.get("role") == "student":
        return user_student_id(user)
    return user["username"]


def require_lab_assigned(user: dict, lab_id: str) -> None:
    """Allow historical access and safe shutdown after a group becomes archived."""
    if user["role"] != "student":
        return
    if not _assignments_for_lab(get_assigned_labs_detail(user["username"]), lab_id):
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
def api_labs(group_id: Optional[int] = None, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    # Archived groups drop out of the student's lab list entirely: the cohort is
    # finished, so there is nothing left to start. Their results stay readable
    # under /api/results, which is keyed on obligations rather than this list.
    assignments = get_unarchived_labs_detail(user["username"])
    if group_id is not None:
        assignments = [item for item in assignments if item["group_id"] == group_id]
    scenarios_by_id = {lab["id"]: lab for lab in list_scenarios()}
    student_id = user_student_id(user)
    runtime_states = dict(tracked_runtime_items())
    result = []
    # Return one row per assignment because groups can share a lab.
    for assignment in assignments:
        lab = scenarios_by_id.get(assignment["lab_id"])
        if lab is None:
            continue
        runtime_state = runtime_states.get(state_key(assignment["lab_id"], student_id), {})
        lease_group_id = runtime_state.get("group_id")
        # Only the lease-owning group sees live state; unscoped leases remain visible.
        if lease_group_id is None or lease_group_id == assignment["group_id"]:
            lab_status = runtime_state.get("status") or "not_created"
        else:
            lab_status = "not_created"
        result.append(
            {
                "assignment_id": assignment["assignment_id"],
                "id": lab["id"],
                "title": lab["title"],
                "difficulty": lab.get("difficulty"),
                "story": lab.get("story"),
                "status": lab_status,
                "deadline": assignment.get("deadline"),
                "group": {
                    "id": assignment.get("group_id"),
                    "name": assignment.get("group_name"),
                    "semester": assignment.get("semester"),
                    "is_archived": assignment.get("is_archived"),
                },
            }
        )
    return result


@app.get("/api/labs/{lab_id}")
def api_lab_detail(
    lab_id: str,
    _request: Request,
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    validate_lab_id(lab_id)
    # Expired assignments remain readable; archived assignments do not.
    assignments = get_unarchived_labs_detail(user["username"])
    assignment = _resolve_lab_assignment(assignments, lab_id, group_id)
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    student_id = user_student_id(user)
    runtime_state = runtime_state_for(lab_id, student_id)
    lease_group_id = runtime_state.get("group_id")
    if lease_group_id is None or lease_group_id == assignment["group_id"]:
        status_text = runtime_state.get("status") or "not_created"
    else:
        status_text = "not_created"

    check_results = get_check_results_for_student(lab_id, student_id)
    check_result = check_results[-1].get("check_result") if check_results else None
    endpoints = _build_endpoints(scenario, student_id, user)

    deadline = assignment.get("deadline")
    # Compute expiry server-side to keep lifecycle authorization consistent.
    expired = bool(deadline) and _aware_utc(datetime.fromisoformat(deadline)) < datetime.now(
        timezone.utc
    )

    return {
        "scenario": scenario,
        "status": status_text,
        "check_result": check_result,
        "endpoints": endpoints,
        "csrf_token": generate_token(user),
        "deadline": deadline,
        "expired": expired,
        "group": {
            "id": assignment.get("group_id"),
            "name": assignment.get("group_name"),
            "semester": assignment.get("semester"),
            "is_archived": assignment.get("is_archived"),
        },
    }


@app.get("/api/labs/{lab_id}/feedback")
def api_lab_feedback(
    lab_id: str,
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_assigned(user, lab_id)
    validate_lab_id(lab_id)
    # Feedback remains available for expired, unarchived assignments.
    assignment = _resolve_lab_assignment(
        get_unarchived_labs_detail(user["username"]), lab_id, group_id
    )
    student_id = user_student_id(user)
    runtime_state = runtime_state_for(lab_id, student_id)
    session_id = runtime_state.get("session_id", "")
    already_submitted = feedback_exists(lab_id, student_id, session_id)
    return {
        "lab_id": lab_id,
        "session_id": session_id,
        "already_submitted": already_submitted,
        "csrf_token": generate_token(user),
        "group": {
            "id": assignment.get("group_id"),
            "name": assignment.get("group_name"),
            "semester": assignment.get("semester"),
            "is_archived": assignment.get("is_archived"),
        },
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
    try:
        semester = validate_semester(body.get("semester"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    """First-login and self-service password change.

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

    raw_group_id = body.get("group_id")
    if raw_group_id in (None, ""):
        group_id: Optional[int] = None
    else:
        try:
            group_id = int(raw_group_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid group_id") from None
    assignment = _resolve_start_group(get_assigned_labs_detail(user["username"]), lab_id, group_id)
    group_id = assignment["group_id"]
    group_name = assignment.get("group_name") or str(group_id)

    student_id = user_student_id(user)
    current_key = state_key(lab_id, student_id)

    # Container identity excludes group, so reject cross-group lease collisions.
    existing_lease = runtime_state_for(lab_id, student_id)
    existing_group_id = existing_lease.get("group_id")
    if (
        existing_group_id is not None
        and existing_group_id != group_id
        and existing_lease.get("status") in ("running", "stopped")
    ):
        other_assignment = next(
            (
                item
                for item in _assignments_for_lab(get_assigned_labs_detail(user["username"]), lab_id)
                if item["group_id"] == existing_group_id
            ),
            None,
        )
        other_name = (other_assignment.get("group_name") if other_assignment else None) or str(
            existing_group_id
        )
        raise HTTPException(
            status_code=409,
            detail=f"You have this lab running for {other_name}. "
            f"End it before starting it for {group_name}.",
        )

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
            _actor_id(user),
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
            _actor_id(user),
            "error",
            duration_seconds=_duration,
            detail=stderr,
            actor_type="student",
        )
        logger.error("Lab start failed for %s/%s: %s", lab_id, student_id, stderr)
        update_runtime_state(lab_id, student_id, "error", group_id=group_id)
        raise HTTPException(status_code=502, detail="Failed to start lab")

    create_lab_session(session_id, lab_id, student_id, group_id=group_id)
    record_event(
        "start",
        lab_id,
        student_id,
        _actor_id(user),
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
        group_id=group_id,
    )
    _run_system_check(lab_id, user, session_id, "baseline", group_id=group_id)

    if _is_fetch(request):
        endpoints = _build_endpoints(scenario, student_id, user)
        return {"status": "running", "endpoints": endpoints, "group_id": group_id}
    return RedirectResponse(url=f"/labs/{lab_id}?group={group_id}", status_code=303)


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
    # The group comes from the lease, never the request body: mid-session the
    # client must not be able to re-attribute a run to a different group.
    lease = runtime_state_for(lab_id, student_id)
    session_id = lease.get("session_id")
    group_id = lease.get("group_id")
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
    redirect_url = f"/labs/{lab_id}" + (f"?group={group_id}" if group_id is not None else "")
    return RedirectResponse(url=redirect_url, status_code=303)


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
    # Reset keeps the SAME group as the lease it is resetting -- it is not a
    # place to re-attribute a run, only to restart it.
    previous_lease = runtime_state_for(lab_id, student_id)
    previous_session_id = previous_lease.get("session_id")
    group_id = previous_lease.get("group_id")
    success, _stdout, stderr, _duration = run_action(
        "reset", lab_id, user, session_id=previous_session_id
    )
    if not success:
        update_runtime_state(lab_id, student_id, "error")
        logger.error("Lab reset failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to reset lab")
    close_lab_session(previous_session_id, "reset", "student_reset")
    session_id = str(uuid.uuid4())
    create_lab_session(session_id, lab_id, student_id, group_id=group_id)
    record_event(
        "start",
        lab_id,
        student_id,
        _actor_id(user),
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
        group_id=group_id,
    )
    _run_system_check(lab_id, user, session_id, "baseline", group_id=group_id)
    if _is_fetch(request):
        return {"status": "running"}
    redirect_url = f"/labs/{lab_id}" + (f"?group={group_id}" if group_id is not None else "")
    return RedirectResponse(url=redirect_url, status_code=303)


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
    # The group comes from the lease, never the request body -- see stop_lab.
    lease = runtime_state_for(lab_id, student_id)
    session_id = lease.get("session_id")
    group_id = lease.get("group_id")
    if session_id:
        _run_system_check(lab_id, user, session_id, "final", group_id=group_id)
    success, _stdout, stderr, _duration = run_action("destroy", lab_id, user, session_id=session_id)
    if not success:
        update_runtime_state(lab_id, student_id, "error")
        logger.error("Lab end failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to end lab")
    close_lab_session(session_id, "end", "student_end")
    update_runtime_state(lab_id, student_id, "ended")
    redirect_path = f"/labs/{lab_id}/feedback" + (
        f"?group={group_id}" if group_id is not None else ""
    )
    if _is_fetch(request):
        return {"status": "ended", "redirect": redirect_path}
    return RedirectResponse(url=redirect_path, status_code=303)


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
    # The group comes from the lease, never the request body -- see stop_lab.
    lease = runtime_state_for(lab_id, student_id)
    session_id = lease.get("session_id")
    group_id = lease.get("group_id")
    success, stdout, stderr, duration = run_action(
        "check", lab_id, user, session_id=session_id, record_action=False
    )
    if not success:
        record_event(
            "check",
            lab_id,
            student_id,
            _actor_id(user),
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
            _actor_id(user),
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
        _actor_id(user),
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
        actor_id=_actor_id(user),
        actor_type="student",
        phase="student",
        group_id=group_id,
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
    redirect_url = f"/labs/{lab_id}" + (f"?group={group_id}" if group_id is not None else "")
    return RedirectResponse(url=redirect_url, status_code=303)


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
    # Land the student on their results rather than the portal home -- and on
    # the specific group's results when it's cheaply known, since a student
    # can run the same lab under more than one group.
    group_id = session_group_id(session_id)
    redirect_path = "/results" + (f"?group={group_id}" if group_id is not None else "")
    if _is_fetch(request):
        return {"ok": True, "redirect": redirect_path}
    return RedirectResponse(url=redirect_path, status_code=303)


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
            if g.is_archived and my_membership is None:
                continue
            result.append(
                {
                    "id": g.id,
                    "name": g.name,
                    "semester": g.semester,
                    "is_archived": g.is_archived,
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
def heartbeat(
    lab_id: str,
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_visible(user, lab_id)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    if group_id is not None:
        # A liveness touch only -- validate the caller's group against the
        # lease, but never use it to mutate attribution (that stays owned by
        # start/stop/end, sourced from the lease itself).
        lease_group_id = runtime_state_for(lab_id, student_id).get("group_id")
        if lease_group_id is not None and lease_group_id != group_id:
            raise HTTPException(status_code=409, detail="This lab is running for a different group")
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

    terminal_owner = terminal_owner_for_port(terminal_port, user)

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


def require_admin(user: dict) -> None:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _owner_group_ids(session, owner_id: int) -> set:
    return repo.owned_group_ids(session, owner_id)


def _owner_unarchived_group_ids(session, owner_id: int) -> set:
    """Like _owner_group_ids but drops archived groups -- used for the
    CROSS-group student aggregates (no group_id in the URL) so a finished,
    archived cohort's obligations/PII don't surface on the all-groups student
    pages. Group-SCOPED routes (an explicit group_id, or /groups/{id} itself)
    must keep using _owner_group_ids so an instructor can still open an
    archived group directly."""
    return repo.owned_group_ids(session, owner_id, include_archived=False)


def _owner_student_ids(session, owner_id: int) -> set:
    """student_id (internal_id/email) values visible to this instructor -
    the roster of any student who is a member of one of their own groups."""
    return {
        student.internal_id or student.email
        for student in repo.list_students_for_owner(session, owner_id)
    }


def _instructor_to_dict(user) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "active": bool(user.active),
        "must_change_password": bool(user.must_change_password),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@app.get("/api/admin/csrf")
def api_admin_csrf(user: dict = Depends(get_authenticated_user)):
    require_admin(user)
    return {"csrf_token": generate_token(user)}


@app.get("/api/admin/instructors")
def api_list_instructors(user: dict = Depends(get_authenticated_user)):
    require_admin(user)
    with SessionLocal() as session:
        return [_instructor_to_dict(i) for i in repo.list_instructors(session)]


@app.post("/api/admin/instructors")
async def api_create_instructor(request: Request, user: dict = Depends(get_authenticated_user)):
    require_admin(user)
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
            instructor, initial_password = repo.create_instructor(session, email)
            session.commit()
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {
            **_instructor_to_dict(instructor),
            # Shown to the admin exactly once; only the hash is stored.
            "initial_password": initial_password,
        }


@app.post("/api/admin/instructors/{instructor_id}/disable")
async def api_disable_instructor(
    instructor_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_admin(user)
    try:
        body = await request.json()
    except Exception:
        body = None
    _require_instructor_csrf(request, user, body)
    with SessionLocal() as session:
        target = repo.get_user_by_id(session, instructor_id)
        if target is None or target.role != "instructor":
            raise HTTPException(status_code=404, detail="Instructor not found")
        repo.set_user_active(session, instructor_id, False)
        session.commit()
    return {"ok": True}


@app.post("/api/admin/instructors/{instructor_id}/enable")
async def api_enable_instructor(
    instructor_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_admin(user)
    try:
        body = await request.json()
    except Exception:
        body = None
    _require_instructor_csrf(request, user, body)
    with SessionLocal() as session:
        target = repo.get_user_by_id(session, instructor_id)
        if target is None or target.role != "instructor":
            raise HTTPException(status_code=404, detail="Instructor not found")
        repo.set_user_active(session, instructor_id, True)
        session.commit()
    return {"ok": True}


@app.post("/api/admin/instructors/{instructor_id}/reset-password")
async def api_reset_instructor_password(
    instructor_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    require_admin(user)
    try:
        body = await request.json()
    except Exception:
        body = None
    _require_instructor_csrf(request, user, body)
    with SessionLocal() as session:
        target = repo.get_user_by_id(session, instructor_id)
        if target is None or target.role != "instructor":
            raise HTTPException(status_code=404, detail="Instructor not found")
        new_password = repo.reset_password(session, target)
        session.commit()
        # Shown to the admin exactly once; only the hash is stored.
        return {"ok": True, "new_password": new_password}


# Portal disk paths remain independent of the worker runtime package.
_PORTAL_DISK_PATHS = ("/", str(Path(settings.PORTAL_DB_PATH).parent))


def _read_proc_stat_totals() -> Optional[tuple[int, int]]:
    """(idle, total) jiffies from /proc/stat, or None off Linux."""
    try:
        with Path("/proc/stat").open(encoding="utf-8") as handle:
            line = handle.readline()
    except OSError:
        return None
    values = [int(v) for v in line.split()[1:]]
    if len(values) < 4:
        return None
    idle = values[3] + (values[4] if len(values) > 4 else 0)  # idle + iowait
    return idle, sum(values)


def _portal_cpu_percent(sample_seconds: float = 0.2) -> Optional[float]:
    """Busy percentage for the management host, averaged over its cores.

    Deliberately a local reimplementation rather than importing
    labctl_core.system_status: the portal is not allowed to depend on the lab
    runtime package (tools/pre_commit/validate_architecture_imports.py).
    """
    first = _read_proc_stat_totals()
    if first is None:
        return None
    time.sleep(sample_seconds)
    second = _read_proc_stat_totals()
    if second is None:
        return None
    total_delta = second[1] - first[1]
    if total_delta <= 0:
        return 0.0
    return round((1 - (second[0] - first[0]) / total_delta) * 100, 1)


def _portal_memory_status() -> dict:
    """Memory for the management host, or an empty dict off Linux."""
    values: dict[str, int] = {}
    try:
        with Path("/proc/meminfo").open(encoding="utf-8") as handle:
            for line in handle:
                key, _, rest = line.partition(":")
                fields = rest.strip().split()
                if fields:
                    values[key] = int(fields[0])  # kB
    except OSError:
        return {}
    total_kb = values.get("MemTotal", 0)
    available_kb = values.get("MemAvailable", values.get("MemFree", 0))
    used_kb = max(total_kb - available_kb, 0)
    return {
        "memory_total_mb": round(total_kb / 1024),
        "memory_used_mb": round(used_kb / 1024),
        "memory_percent": round((used_kb / total_kb) * 100, 1) if total_kb else 0.0,
    }


def _portal_disk_status() -> list[dict]:
    """Disk usage for the management host, one entry per distinct filesystem."""
    by_device: dict[int, dict] = {}
    for path in _PORTAL_DISK_PATHS:
        try:
            device = Path(path).stat().st_dev
            usage = shutil.disk_usage(path)
        except OSError:
            continue
        if device in by_device:
            continue
        by_device[device] = {
            "path": path,
            "total_gb": round(usage.total / 1024**3, 1),
            "used_gb": round((usage.total - usage.free) / 1024**3, 1),
            "free_gb": round(usage.free / 1024**3, 1),
            "percent": round(((usage.total - usage.free) / usage.total) * 100, 1)
            if usage.total
            else 0.0,
        }
    return list(by_device.values())


@app.get("/api/admin/system-status")
def api_admin_system_status(user: dict = Depends(get_authenticated_user)):
    """Worker (x01) CPU/memory/disk and running-lab count, via the restricted
    labctl-ssh-wrapper's read-only `system-status` verb (no lab/student args,
    no destructive capability), plus the management host's own disk usage.

    The worker's numbers come over SSH and can fail independently; the portal's
    are read locally and are always available, so a worker outage still leaves
    the admin able to see whether x02 is filling up.
    """
    require_admin(user)
    portal = {
        "cpu_percent": _portal_cpu_percent(),
        "cores": os.cpu_count(),
        "disks": _portal_disk_status(),
        **_portal_memory_status(),
    }
    ok, stdout, stderr = run_labctl_system_status()
    if not ok:
        raise HTTPException(status_code=502, detail=stderr or "worker unreachable")
    try:
        status = json.loads(stdout)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="worker returned malformed status") from None
    status["portal"] = portal
    return status


@app.get("/api/instructor/labs")
def api_instructor_labs(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        owner_students = _owner_student_ids(session, user["id"])
    runtime_states = dict(tracked_runtime_items())
    labs = []
    for scenario in list_scenarios():
        lab_id = scenario["id"]
        active_count = 0
        total_students = 0
        for student in get_student_users().values():
            if student["student_id"] not in owner_students:
                continue
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
                # Sourced from the student guide's opening paragraph, not
                # scenario.yaml -- see load_lab_description. None when the
                # guide doesn't parse cleanly; the UI falls back for that lab.
                "description": load_lab_description(lab_id),
                "active_sessions": active_count,
                "total_students": total_students,
                "student_guide_url": student_guide_url(scenario),
                "solution_notes_url": solution_notes_url(scenario),
                "instructor_guide_url": instructor_guide_url(scenario),
                "is_sample": is_sample_lab(lab_id),
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
    with SessionLocal() as session:
        owner_students = _owner_student_ids(session, user["id"])

    for student in get_student_users().values():
        student_id = student["student_id"]
        if student_id not in owner_students:
            continue
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
            commands = get_command_events_for_student(lab_id, student_id)
            check_results = get_check_results_for_student(lab_id, student_id)
            lifecycle_events = get_lifecycle_events_for_student(lab_id, student_id)

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
        "feedback_count": sum(
            1 for record in list_feedback(lab_id) if record["student_id"] in owner_students
        ),
        "is_sample": is_sample_lab(lab_id),
    }


@app.get("/api/instructor/labs/{lab_id}/sessions/{student_id}")
def api_instructor_session_detail(
    lab_id: str, student_id: str, user: dict = Depends(get_authenticated_user)
):
    require_instructor(user)
    validate_lab_id(lab_id)
    with SessionLocal() as session:
        if student_id not in _owner_student_ids(session, user["id"]):
            raise HTTPException(status_code=404, detail="Student not found")
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


@app.get("/api/instructor/students/{student_id}")
def api_instructor_student_detail(
    student_id: str,
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    with SessionLocal() as session:
        owner_ids = _owner_group_ids(session, user["id"])
        if student_id not in _owner_student_ids(session, user["id"]):
            raise HTTPException(status_code=404, detail="Student not found")
        if group_id is not None and group_id not in owner_ids:
            raise HTTPException(status_code=404, detail="Group not found")
        # Group views include archived obligations; aggregate views do not.
        scope_ids = (
            owner_ids if group_id is not None else _owner_unarchived_group_ids(session, user["id"])
        )
    return analytics_service.student_detail(student_id, group_id=group_id, group_ids=scope_ids)


def _aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite drops tzinfo on read even though deadlines are always written as
    UTC-aware (see the assign-lab endpoint). Re-attach UTC before comparing
    against datetime.now(timezone.utc), or the comparison raises TypeError."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _build_session_history(lifecycle):
    """Group lifecycle events into newest-first start-to-end sessions.

    Ignore events before a start and collapse consecutive starts to the latest one.
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
    with SessionLocal() as session:
        owner_students = _owner_student_ids(session, user["id"])
        owner_group_ids = _owner_group_ids(session, user["id"])
    summary = feedback_analytics(lab_id, student_ids=owner_students)
    # An empty feedback page has two very different causes: nobody in the
    # instructor's groups has this lab assigned, or they have it and have not
    # responded. Report the assigned count so the UI can say which.
    summary["assigned_students"] = analytics_service.students_assigned_lab(
        lab_id, group_ids=owner_group_ids
    )
    responses = [
        record for record in list_feedback(lab_id) if record["student_id"] in owner_students
    ]
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
    status: str = "active",
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    if status not in ("active", "archived", "all"):
        raise HTTPException(status_code=400, detail="status must be active, archived, or all")
    with SessionLocal() as session:
        owner_ids = _owner_group_ids(session, user["id"])
        if group_id is not None and group_id not in owner_ids:
            raise HTTPException(status_code=404, detail="Group not found")
    return analytics_service.instructor_analytics(owner_ids, group_id=group_id, status=status)


@app.get("/api/results")
def api_student_results(
    group_id: Optional[int] = None, user: dict = Depends(get_authenticated_user)
):
    require_student(user)
    return analytics_service.student_results(user_student_id(user), group_id=group_id)


@app.get("/api/results/{lab_id}")
def api_student_lab_results(
    lab_id: str,
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_student(user)
    require_lab_assigned(user, lab_id)
    student_id = user_student_id(user)
    result = analytics_service.student_results(student_id, group_id=group_id)
    candidates = [item for item in result["labs"] if item["lab_id"] == lab_id]
    if not candidates:
        raise HTTPException(status_code=404, detail="Result not found")
    if group_id is None and len(candidates) > 1:
        names = ", ".join(
            sorted({item.get("group_name") or str(item.get("group_id")) for item in candidates})
        )
        raise HTTPException(
            status_code=400,
            detail=f"This lab has results in multiple groups ({names}); specify group_id.",
        )
    lab = candidates[0]
    detail = analytics_service.student_detail(student_id, group_id=group_id)
    lab_detail = next(
        (
            item
            for item in detail["labs"]
            if item["lab_id"] == lab_id and item["group_id"] == lab["group_id"]
        ),
        None,
    )
    if lab_detail is None:
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
# Instructor management API: students, groups, and assignments
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
        if student_id not in _owner_student_ids(session, user["id"]):
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
        "is_archived": group.is_archived,
        "members": [
            {
                "student_id": m.user.internal_id or m.user.email,
                # Archiving suppresses member PII in this group's own responses,
                # the same way the roster and activity feed do.
                "email": None if group.is_archived else m.user.email,
            }
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
        "is_archived": group.is_archived,
        "archived_at": group.archived_at.isoformat() if group.archived_at else None,
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "member_count": sum(1 for m in group.members if m.status == "approved"),
        "pending_count": sum(1 for m in group.members if m.status == "pending"),
        "lab_count": len(group.labs),
    }


@app.get("/api/instructor/groups")
def api_list_groups(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        return [_group_summary(g) for g in repo.list_groups(session, owner_id=user["id"])]


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
    try:
        semester = validate_semester(body.get("semester"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    with SessionLocal() as session:
        try:
            group = repo.create_group(session, name, user["id"], semester=semester)
            session.commit()
            return _group_to_dict(group)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/api/instructor/groups/{group_id}")
def api_delete_group(group_id: int, request: Request, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    _require_instructor_csrf(request, user)
    with SessionLocal() as session:
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
        repo.delete_group(session, group_id)
        session.commit()
    return {"ok": True}


@app.post("/api/instructor/groups/{group_id}/archive")
async def api_archive_group(
    group_id: int, request: Request, user: dict = Depends(get_authenticated_user)
):
    """Archives a finished group: blocks new enrollment and start/reset/check
    (existing members may still stop/end a running lab) and, going forward,
    suppresses student email/study_program in this group's own roster and
    results views. Aggregate analytics stay intact (they key on the non-PII
    student_id). Permanent -- there is no unarchive route; the instructor
    wanted a hard guarantee that a finished cohort can never be reopened."""
    require_instructor(user)
    try:
        body = await request.json()
    except Exception:
        body = None
    _require_instructor_csrf(request, user, body)
    with SessionLocal() as session:
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
        group = repo.archive_group(session, group_id)
        session.commit()
        return _group_summary(group)


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
    if semester is not None:
        try:
            semester = validate_semester(semester)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    with SessionLocal() as session:
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
        try:
            group = repo.rename_group(session, group_id, name, semester=semester)
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
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
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
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
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
        # Validate the incoming deadline, allowing one minute for clock skew.
        if _aware_utc(deadline) < datetime.now(timezone.utc) - timedelta(minutes=1):
            raise HTTPException(status_code=400, detail="Deadline cannot be in the past")
    with SessionLocal() as session:
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
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
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
        if not repo.unassign_lab(session, group_id, lab_id):
            raise HTTPException(status_code=404, detail="Assignment not found")
        session.commit()
    sync_assignment_obligations()
    return {"ok": True}


@app.get("/api/instructor/groups/{group_id}")
def api_group_detail(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        group = repo.get_owned_group(session, group_id, user["id"])
        if group is None:
            raise HTTPException(status_code=404, detail="Group not found")
        pending = [
            {
                "user_id": m.user.id,
                "student_id": m.user.internal_id or m.user.email,
                "email": None if group.is_archived else m.user.email,
                "semester": m.user.semester,
                "study_program": None if group.is_archived else m.user.study_program,
                "requested_at": m.requested_at.isoformat() if m.requested_at else None,
            }
            for m in group.members
            if m.status == "pending"
        ]
        approved = [
            {
                "user_id": m.user.id,
                "student_id": m.user.internal_id or m.user.email,
                "email": None if group.is_archived else m.user.email,
                "semester": m.user.semester,
                "study_program": None if group.is_archived else m.user.study_program,
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
        recent_activity = analytics_service.recent_activity(
            member_ids, redact_email=group.is_archived
        )

        return {
            "id": group.id,
            "name": group.name,
            "semester": group.semester,
            "is_archived": group.is_archived,
            "archived_at": group.archived_at.isoformat() if group.archived_at else None,
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
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
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
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
        try:
            count = repo.reject_members(session, group_id, user_ids)
            session.commit()
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return {"rejected": count}


@app.get("/api/instructor/groups/{group_id}/progress")
def api_group_progress(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    with SessionLocal() as session:
        if repo.get_owned_group(session, group_id, user["id"]) is None:
            raise HTTPException(status_code=404, detail="Group not found")
    result = analytics_service.group_progress(group_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Group not found")
    return result


@app.get("/api/instructor/groups/{group_id}/export-csv")
def api_group_export_csv(group_id: int, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)

    with SessionLocal() as session:
        group = repo.get_owned_group(session, group_id, user["id"])
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
                        "" if group.is_archived else m.user.email,
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
def api_instructor_students_progress(
    group_id: Optional[int] = None,
    user: dict = Depends(get_authenticated_user),
):
    require_instructor(user)
    with SessionLocal() as session:
        if group_id is not None:
            if repo.get_owned_group(session, group_id, user["id"]) is None:
                raise HTTPException(status_code=404, detail="Group not found")
            scope_ids = {group_id}
        else:
            # Cross-group aggregate excludes archived cohorts, same as the
            # other all-groups views.
            scope_ids = _owner_unarchived_group_ids(session, user["id"])
    return analytics_service.students_progress(group_ids=scope_ids)


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


@app.get("/account/password", response_class=HTMLResponse)
def student_account_password_spa():
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


@app.get("/instructor/students/{student_id}", response_class=HTMLResponse)
def instructor_student_detail_spa(student_id: str):
    _ = student_id
    return _serve_spa()


@app.get("/instructor/pending", response_class=HTMLResponse)
def instructor_pending_spa():
    return _serve_spa()


@app.get("/instructor/account/password", response_class=HTMLResponse)
def instructor_account_password_spa():
    return _serve_spa()


@app.get("/admin/login", response_class=HTMLResponse)
def admin_login_spa():
    return _serve_spa()


@app.get("/admin", response_class=HTMLResponse)
def admin_spa():
    return _serve_spa()


@app.get("/admin/account/password", response_class=HTMLResponse)
def admin_account_password_spa():
    return _serve_spa()


@app.get("/admin/system-usage", response_class=HTMLResponse)
def admin_system_usage_spa():
    return _serve_spa()


@app.get("/instructor/groups", response_class=HTMLResponse)
def instructor_groups_spa():
    return _serve_spa()


@app.get("/instructor/lab-catalogue", response_class=HTMLResponse)
def instructor_lab_catalogue_spa():
    return _serve_spa()


@app.get("/enrollment", response_class=HTMLResponse)
def enrollment_spa():
    return _serve_spa()


@app.get("/instructor/groups/{group_id}", response_class=HTMLResponse)
def instructor_group_detail_spa(group_id: int):
    _ = group_id
    return _serve_spa()


@app.get("/instructor/groups/{group_id}/labs", response_class=HTMLResponse)
@app.get("/instructor/groups/{group_id}/students", response_class=HTMLResponse)
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


# Must stay registered before /instructor/labs/{lab_id}/{student_id} below:
# routes match in registration order, and that catch-all would otherwise
# swallow "feedback" as a student_id.
@app.get("/instructor/labs/{lab_id}/feedback", response_class=HTMLResponse)
def instructor_lab_feedback_spa(lab_id: str):
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
