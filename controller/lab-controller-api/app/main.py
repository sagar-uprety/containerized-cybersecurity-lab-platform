import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import threading
import time
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

from app.auth import get_student_users, get_user_registry
from app.config import settings
from app.events import record_event
from app.feedback import (
    build_evidence_export,
    feedback_exists,
    get_check_results_for_student,
    get_command_events_for_student,
    get_lifecycle_events_for_student,
    list_feedback,
    save_check_result,
    save_command_events,
    save_feedback,
)
from app.form_tokens import generate_token, validate_token
from app.runtime_state import (
    load_check_result,
    remove_runtime_key,
    runtime_state_for,
    state_key,
    touch_runtime_state,
    tracked_runtime_items,
    update_runtime_state,
)
from app.scenarios import (
    endpoint_ports,
    instructor_guide_url,
    list_scenarios,
    load_scenario_metadata,
    solution_guide_url,
    student_guide_url,
    terminal_owner_for_port,
    user_student_id,
    validate_lab_id,
)
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

SESSION_SECRET = settings.PORTAL_USERS_FILE.encode() + b"thesis-lab-portal-session"
SESSION_COOKIE = "portal_session"
SESSION_MAX_AGE = 86400


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
            user_dict = get_user_registry().get(username)
            if user_dict:
                return {
                    "username": user_dict["username"],
                    "password": user_dict["password"],
                    "role": user_dict["role"],
                    "student_id": user_dict["student_id"],
                    "number": user_dict.get("number"),
                }
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except Exception:
            raise HTTPException(
                status_code=401, detail="Invalid credentials", headers={"WWW-Authenticate": "Basic"}
            ) from None
        user_dict = get_user_registry().get(username)
        if not user_dict:
            raise HTTPException(
                status_code=401, detail="Invalid credentials", headers={"WWW-Authenticate": "Basic"}
            )
        if not secrets.compare_digest(password.encode(), user_dict["password"].encode()):
            raise HTTPException(
                status_code=401, detail="Invalid credentials", headers={"WWW-Authenticate": "Basic"}
            )
        return {
            "username": user_dict["username"],
            "password": user_dict["password"],
            "role": user_dict["role"],
            "student_id": user_dict["student_id"],
            "number": user_dict.get("number"),
        }
    raise HTTPException(status_code=401, detail="Not authenticated")


def _is_fetch(request: Request) -> bool:
    return request.headers.get("x-requested-with") == "fetch"


def parse_status_output(stdout: str) -> tuple[str, list[dict]]:
    lines = stdout.splitlines()
    state = lines[0].strip() if lines else "not_created"
    command_logs = []
    for line in lines[1:]:
        if not line.startswith("command_logs:"):
            continue
        try:
            parsed = json.loads(line.split(":", 1)[1].strip())
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            command_logs = [entry for entry in parsed if isinstance(entry, dict)]
    return state, command_logs


def get_lab_status(lab_id: str, student_id: str) -> str:
    success, stdout, _stderr = run_labctl("status", lab_id, student_id)
    if not success:
        return "error"
    status_text, _command_logs = parse_status_output(stdout)
    return status_text or "not_created"


def get_lab_status_details(lab_id: str, student_id: str) -> tuple[str, list[dict]]:
    success, stdout, _stderr = run_labctl("status", lab_id, student_id)
    if not success:
        return "error", []
    status_text, command_logs = parse_status_output(stdout)
    if command_logs:
        save_command_events(lab_id, student_id, command_logs)
    return status_text, command_logs


def run_action(verb: str, lab_id: str, user: dict) -> tuple[bool, str, str, float]:
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    started = time.monotonic()
    success, stdout, stderr = run_labctl(verb, lab_id, student_id)
    duration = time.monotonic() - started
    record_event(
        action="end" if verb == "destroy" else verb,
        lab_id=lab_id,
        student_id=student_id,
        actor=user["username"],
        result="success" if success else "error",
        duration_seconds=duration,
        detail=stderr if stderr else None,
    )
    return success, stdout, stderr, duration


def running_student_count(exclude_key: Optional[str] = None) -> int:
    count = 0
    for lab in list_scenarios():
        lab_id = lab["id"]
        for student in get_student_users().values():
            key = state_key(lab_id, student["student_id"])
            if exclude_key and key == exclude_key:
                continue
            if get_lab_status(lab_id, student["student_id"]) == "running":
                count += 1
    return count


def scenario_idle_timeout(scenario: dict):
    lifecycle = scenario.get("lifecycle", {})
    if settings.EVALUATION_MODE:
        return lifecycle.get("evaluation_idle_timeout_minutes")
    return lifecycle.get("idle_timeout_minutes")


def require_student(user: dict) -> None:
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student access required")


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
        "role": user["role"],
        "student_id": user.get("student_id") or user["username"],
    }


@app.get("/api/labs")
def api_labs(user: dict = Depends(get_authenticated_user)):
    require_student(user)
    labs = list_scenarios()
    student_id = user_student_id(user)
    result = []
    for lab in labs:
        lab_status = get_lab_status(lab["id"], student_id)
        result.append(
            {
                "id": lab["id"],
                "title": lab["title"],
                "difficulty": lab.get("difficulty"),
                "story": lab.get("story"),
                "status": lab_status,
            }
        )
    return result


@app.get("/api/labs/{lab_id}")
def api_lab_detail(lab_id: str, _request: Request, user: dict = Depends(get_authenticated_user)):
    require_student(user)
    validate_lab_id(lab_id)
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    student_id = user_student_id(user)
    status_text = get_lab_status(lab_id, student_id)
    if status_text == "running":
        update_runtime_state(lab_id, student_id, "running", last_seen=time.time())

    runtime_state = runtime_state_for(lab_id, student_id)
    check_result = runtime_state.get("last_check") or load_check_result(lab_id, student_id)
    endpoints = _build_endpoints(scenario, student_id, user)

    return {
        "scenario": scenario,
        "status": status_text,
        "check_result": check_result,
        "endpoints": endpoints,
        "csrf_token": generate_token(user),
    }


@app.get("/api/labs/{lab_id}/feedback")
def api_lab_feedback(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_student(user)
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
    user_dict = get_user_registry().get(username)
    if not user_dict:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not secrets.compare_digest(password.encode(), user_dict["password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = _sign_session_token(username)
    response = JSONResponse(
        {
            "user": {
                "username": user_dict["username"],
                "role": user_dict["role"],
                "student_id": user_dict.get("student_id") or user_dict["username"],
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
        if get_lab_status(scenario["id"], student_id) == "running":
            raise HTTPException(
                status_code=409,
                detail=f"Another lab ({scenario['title']}) is already running. "
                "End or stop it before starting a new one.",
            )

    if running_student_count(exclude_key=current_key) >= settings.MAX_CONCURRENT_STUDENTS:
        record_event("start", lab_id, student_id, user["username"], "rejected", detail="capacity")
        raise HTTPException(
            status_code=503,
            detail="Maximum concurrent students reached. Try again later.",
        )

    success, _stdout, stderr, _duration = run_action("start", lab_id, user)
    if not success:
        logger.error("Lab start failed for %s/%s: %s", lab_id, student_id, stderr)
        update_runtime_state(lab_id, student_id, "error")
        raise HTTPException(status_code=502, detail="Failed to start lab")

    update_runtime_state(
        lab_id,
        student_id,
        "running",
        started_at=time.time(),
        last_seen=time.time(),
    )

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
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    success, _stdout, stderr, _duration = run_action("stop", lab_id, user)
    student_id = user_student_id(user)
    update_runtime_state(
        lab_id,
        student_id,
        "stopped" if success else "error",
        last_seen=time.time(),
    )
    if not success:
        logger.error("Lab stop failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to stop lab")
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
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    success, _stdout, stderr, _duration = run_action("reset", lab_id, user)
    student_id = user_student_id(user)
    update_runtime_state(
        lab_id,
        student_id,
        "running" if success else "error",
        started_at=time.time(),
        last_seen=time.time(),
        last_check=None,
    )
    if not success:
        logger.error("Lab reset failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to reset lab")
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
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    success, _stdout, stderr, _duration = run_action("destroy", lab_id, user)
    student_id = user_student_id(user)
    update_runtime_state(lab_id, student_id, "ended")
    if not success:
        logger.error("Lab end failed for %s/%s: %s", lab_id, student_id, stderr)
        raise HTTPException(status_code=502, detail="Failed to end lab")
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
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    success, stdout, stderr, duration = run_action("check", lab_id, user)
    student_id = user_student_id(user)
    if not success:
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
        record_event("check", lab_id, student_id, user["username"], "error", detail=str(exc))
        raise HTTPException(status_code=502, detail="Checker did not return valid JSON") from exc

    save_check_result(lab_id, student_id, check_result, duration_seconds=duration)
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
    body = await _parse_action_body(request)
    validate_token(body["csrf_token"], user)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    session_id = body.get("session_id", "")
    section_a = body.get("section_a", "")
    section_b_rating = int(body.get("section_b_rating", 3))
    section_b = body.get("section_b", "")
    if not session_id:
        runtime_state = runtime_state_for(lab_id, student_id)
        session_id = runtime_state.get("session_id", "")
    save_feedback(lab_id, student_id, session_id, section_a, section_b_rating, section_b)
    if _is_fetch(request):
        return {"ok": True}
    return RedirectResponse(url="/portal", status_code=303)


@app.post("/api/heartbeat/{lab_id}")
def heartbeat(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_student(user)
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

    credential = f"{terminal_owner['student_id']}:{terminal_owner['password']}"
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
    labs = []
    for scenario in list_scenarios():
        lab_id = scenario["id"]
        active_count = 0
        total_students = 0
        for student in get_student_users().values():
            total_students += 1
            if get_lab_status(lab_id, student["student_id"]) == "running":
                active_count += 1
        labs.append(
            {
                "id": lab_id,
                "title": scenario["title"],
                "difficulty": scenario.get("difficulty"),
                "active_sessions": active_count,
                "total_students": total_students,
                "student_guide_url": student_guide_url(scenario),
                "solution_guide_url": solution_guide_url(scenario),
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

    for student in get_student_users().values():
        student_id = student["student_id"]
        status_text = get_lab_status(lab_id, student_id)
        runtime_state = runtime_state_for(lab_id, student_id)
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
    status_text = get_lab_status(lab_id, student_id)
    runtime_state = runtime_state_for(lab_id, student_id)
    session_id = runtime_state.get("session_id", "")
    started_at = runtime_state.get("started_at")
    last_seen = runtime_state.get("last_seen")

    commands = get_command_events_for_student(lab_id, student_id)
    check_results = get_check_results_for_student(lab_id, student_id)
    lifecycle_events = get_lifecycle_events_for_student(lab_id, student_id)

    duration_seconds = None
    if lifecycle_events:
        start_events = [e for e in lifecycle_events if e.get("action") == "start"]
        end_events = [e for e in lifecycle_events if e.get("action") in ("end", "destroy", "stop")]
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
        "scenario": scenario,
        "feedback": list_feedback(lab_id)
        if feedback_exists(lab_id, student_id, session_id)
        else None,
    }


@app.get("/api/instructor/students")
def api_instructor_students(user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    return [
        {"student_id": s["student_id"], "username": s["username"]}
        for s in get_student_users().values()
    ]


@app.get("/api/instructor/students/{student_id}")
def api_instructor_student_detail(student_id: str, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    sessions = []
    for scenario in list_scenarios():
        lab_id = scenario["id"]
        status_text = get_lab_status(lab_id, student_id)
        runtime_state = runtime_state_for(lab_id, student_id)
        session_id = runtime_state.get("session_id", "")
        started_at = runtime_state.get("started_at")
        last_seen = runtime_state.get("last_seen")

        check_results = get_check_results_for_student(lab_id, student_id)
        latest_check = None
        if check_results:
            latest_check = check_results[-1].get("check_result")

        sessions.append(
            {
                "lab_id": lab_id,
                "lab_title": scenario["title"],
                "status": status_text,
                "session_id": session_id,
                "started_at": started_at,
                "last_seen": last_seen,
                "check_result": latest_check,
                "feedback_submitted": feedback_exists(lab_id, student_id, session_id),
            }
        )
    return {
        "student_id": student_id,
        "sessions": sessions,
    }


@app.get("/api/instructor/feedback/{lab_id}")
def api_instructor_feedback(lab_id: str, user: dict = Depends(get_authenticated_user)):
    require_instructor(user)
    validate_lab_id(lab_id)
    return list_feedback(lab_id)


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
        Path(settings.RUNTIME_STATE_PATH).parent / "evidence" / "exports" / f"{export_id}.tar.gz"
    )
    if not export_path.is_file():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(
        str(export_path),
        media_type="application/gzip",
        filename=f"{export_id}.tar.gz",
    )


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


@app.get("/", response_class=HTMLResponse)
def index():
    return _serve_spa()


@app.get("/portal", response_class=HTMLResponse)
def portal_overview():
    return _serve_spa()


@app.get("/labs/{lab_id}", response_class=HTMLResponse)
def lab_detail_spa(lab_id: str):
    _ = lab_id
    return _serve_spa()


@app.get("/labs/{lab_id}/feedback", response_class=HTMLResponse)
def feedback_spa(lab_id: str):
    _ = lab_id
    return _serve_spa()


@app.get("/instructor", response_class=HTMLResponse)
def instructor_spa():
    return _serve_spa()


@app.get("/instructor/search", response_class=HTMLResponse)
def instructor_search_spa():
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
                    success, _stdout, stderr = run_labctl("stop", lab_id, student_id)
                    record_event(
                        "auto_stop",
                        lab_id,
                        student_id,
                        "scheduler",
                        "success" if success else "error",
                        detail=reason if success else stderr,
                    )
                    update_runtime_state(lab_id, student_id, "stopped", last_seen=current_time)

                elif (
                    runtime_state.get("status") == "stopped"
                    and destroy_timeout is not None
                    and idle_minutes > float(destroy_timeout)
                ):
                    success, _stdout, stderr = run_labctl("destroy", lab_id, student_id)
                    record_event(
                        "retention_cleanup",
                        lab_id,
                        student_id,
                        "scheduler",
                        "success" if success else "error",
                        detail=stderr if stderr else None,
                    )
                    if success:
                        remove_runtime_key(key)
        except Exception as exc:
            record_event("scheduler", "system", "system", "scheduler", "error", detail=str(exc))

        time.sleep(settings.SCHEDULER_INTERVAL_SECONDS)


if settings.ENABLE_SCHEDULER:
    threading.Thread(target=lab_lifecycle_manager, daemon=True).start()
