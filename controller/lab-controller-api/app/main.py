import base64
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import yaml
from fastapi import Depends, FastAPI, Form, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.auth import get_current_user, get_student_users
from app.config import settings
from app.ssh_client import run_labctl

app = FastAPI(title="Thesis Lab Portal")
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))

LAB_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
FORM_TOKENS = {}
FORM_TOKEN_LOCK = threading.Lock()
LAB_STATE = {}
LAB_STATE_LOCK = threading.Lock()
EVENT_LOCK = threading.Lock()


def validate_lab_id(lab_id: str) -> None:
    if not LAB_ID_PATTERN.fullmatch(lab_id):
        raise HTTPException(status_code=404, detail="Lab not found")


def user_student_id(user: dict) -> str:
    return user.get("student_id") or user["username"]


def student_number(student_id: str, user: Optional[dict] = None) -> int:
    if user and user.get("number") is not None:
        return int(user["number"])
    match = re.fullmatch(r"student([0-9]{2,4})", student_id)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid student identity")
    return int(match.group(1))


def state_key(lab_id: str, student_id: str) -> str:
    return f"{lab_id}:{student_id}"


def generate_token(user: dict) -> str:
    token = str(uuid.uuid4())
    with FORM_TOKEN_LOCK:
        FORM_TOKENS[token] = {
            "username": user["username"],
            "created_at": time.time(),
        }
    return token


def validate_token(token: str, user: dict) -> None:
    now = time.time()
    with FORM_TOKEN_LOCK:
        token_state = FORM_TOKENS.get(token)
        expired = [
            existing
            for existing, value in FORM_TOKENS.items()
            if now - value["created_at"] > settings.FORM_TOKEN_TTL_SECONDS
        ]
        for existing in expired:
            FORM_TOKENS.pop(existing, None)

    if not token_state:
        raise HTTPException(status_code=400, detail="Invalid form token")
    if token_state["username"] != user["username"]:
        raise HTTPException(status_code=400, detail="Invalid form token")
    if now - token_state["created_at"] > settings.FORM_TOKEN_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="Expired form token")


def load_scenario_metadata(lab_id: str):
    validate_lab_id(lab_id)
    path = Path(settings.LABS_DIR) / lab_id / "scenario.yaml"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        scenario = yaml.safe_load(handle) or {}
    if scenario.get("id") != lab_id:
        raise HTTPException(status_code=500, detail="Scenario metadata id mismatch")
    return scenario


def list_scenarios():
    labs = []
    root = Path(settings.LABS_DIR)
    if not root.exists():
        return labs
    for scenario_path in sorted(root.glob("*/scenario.yaml")):
        lab_id = scenario_path.parent.name
        if not LAB_ID_PATTERN.fullmatch(lab_id):
            continue
        scenario = load_scenario_metadata(lab_id)
        if scenario:
            labs.append(scenario)
    return labs


def endpoint_ports(scenario: dict, student_id: str, user: Optional[dict] = None) -> dict:
    number = student_number(student_id, user)
    access = scenario.get("access", {})
    return {
        "terminal": int(access.get("browser_terminal_port_base", 19000)) + number,
        "ssh": int(access.get("ssh_port_base", 22000)) + number,
        "app": int(access.get("app_port_base", 18000)) + number,
    }


def student_guide_url(scenario: dict) -> str:
    documentation = scenario.get("documentation", {})
    return documentation.get("student_guide_url") or f"/docs/labs/{scenario['id']}/"


def get_lab_status(lab_id: str, student_id: str) -> str:
    success, stdout, _stderr = run_labctl("status", lab_id, student_id)
    if not success:
        return "error"
    status_text = stdout.strip()
    return status_text or "not_created"


def record_event(
    action: str,
    lab_id: str,
    student_id: str,
    actor: str,
    result: str,
    duration_seconds: Optional[float] = None,
    detail: Optional[str] = None,
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

    event_path = Path(settings.EVENT_LOG_PATH)
    event_path.parent.mkdir(parents=True, exist_ok=True)
    with EVENT_LOCK:
        with event_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, sort_keys=True) + "\n")


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


def update_runtime_state(lab_id: str, student_id: str, status_text: str, **extra) -> None:
    with LAB_STATE_LOCK:
        value = LAB_STATE.setdefault(
            state_key(lab_id, student_id),
            {"started_at": time.time(), "last_seen": time.time()},
        )
        value["status"] = status_text
        value.update(extra)


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


@app.get("/", response_class=HTMLResponse)
def index():
    return RedirectResponse(url="/portal")


@app.get("/portal", response_class=HTMLResponse)
def portal_overview(request: Request, user: dict = Depends(get_current_user)):
    labs = list_scenarios()
    student_id = user_student_id(user) if user["role"] == "student" else None
    states = {}
    if student_id:
        for lab in labs:
            states[lab["id"]] = get_lab_status(lab["id"], student_id)

    return templates.TemplateResponse(
        "overview.html",
        {
            "request": request,
            "user": user,
            "labs": labs,
            "states": states,
            "csrf_token": generate_token(user),
        },
    )


@app.get("/labs/{lab_id}", response_class=HTMLResponse)
def lab_detail(request: Request, lab_id: str, user: dict = Depends(get_current_user)):
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    student_id = user_student_id(user)
    if user["role"] == "admin":
        students = get_student_users()
        student_id = next(iter(students.values()))["student_id"]

    status_text = get_lab_status(lab_id, student_id)
    if status_text == "running":
        update_runtime_state(lab_id, student_id, "running", last_seen=time.time())

    ports = endpoint_ports(scenario, student_id, user if user["role"] == "student" else None)

    with LAB_STATE_LOCK:
        runtime_state = LAB_STATE.get(state_key(lab_id, student_id), {})
        check_result = runtime_state.get("last_check")

    return templates.TemplateResponse(
        "detail.html",
        {
            "request": request,
            "user": user,
            "student_id": student_id,
            "lab_id": lab_id,
            "scenario": scenario,
            "status": status_text,
            "check_result": check_result,
            "terminal_port": ports["terminal"],
            "ssh_port": ports["ssh"],
            "app_port": ports["app"],
            "host": settings.WORKER_HOST,
            "student_guide_url": student_guide_url(scenario),
            "csrf_token": generate_token(user),
        },
    )


@app.get("/labs/{lab_id}/status")
def lab_status(lab_id: str, user: dict = Depends(get_current_user)):
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")
    student_id = user_student_id(user)
    ports = endpoint_ports(scenario, student_id, user)
    return {
        "lab": lab_id,
        "student": student_id,
        "state": get_lab_status(lab_id, student_id),
        "endpoints": {
            "browser_terminal": f"/terminal/{ports['terminal']}/",
            "ssh": f"ssh {student_id}@{settings.WORKER_HOST} -p {ports['ssh']}",
            "demo_app": f"http://{settings.WORKER_HOST}:{ports['app']}/",
        },
    }


@app.post("/labs/{lab_id}/start")
def start_lab(
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    validate_token(csrf_token, user)
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    student_id = user_student_id(user)
    current_key = state_key(lab_id, student_id)
    if running_student_count(exclude_key=current_key) >= settings.MAX_CONCURRENT_STUDENTS:
        record_event("start", lab_id, student_id, user["username"], "rejected", detail="capacity")
        raise HTTPException(
            status_code=503,
            detail="Maximum concurrent students reached. Try again later.",
        )

    success, _stdout, stderr, _duration = run_action("start", lab_id, user)
    if not success:
        update_runtime_state(lab_id, student_id, "error")
        raise HTTPException(status_code=502, detail=stderr or "Failed to start lab")

    update_runtime_state(
        lab_id,
        student_id,
        "running",
        started_at=time.time(),
        last_seen=time.time(),
    )
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/labs/{lab_id}/stop")
def stop_lab(
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    validate_token(csrf_token, user)
    success, _stdout, stderr, _duration = run_action("stop", lab_id, user)
    student_id = user_student_id(user)
    update_runtime_state(lab_id, student_id, "stopped" if success else "error")
    if not success:
        raise HTTPException(status_code=502, detail=stderr or "Failed to stop lab")
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/labs/{lab_id}/reset")
def reset_lab(
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    validate_token(csrf_token, user)
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
        raise HTTPException(status_code=502, detail=stderr or "Failed to reset lab")
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/labs/{lab_id}/end")
def end_lab(
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    validate_token(csrf_token, user)
    success, _stdout, stderr, _duration = run_action("destroy", lab_id, user)
    student_id = user_student_id(user)
    with LAB_STATE_LOCK:
        LAB_STATE.pop(state_key(lab_id, student_id), None)
    if not success:
        raise HTTPException(status_code=502, detail=stderr or "Failed to end lab")
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/labs/{lab_id}/check")
def check_lab(
    request: Request,
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    validate_token(csrf_token, user)
    success, stdout, stderr, _duration = run_action("check", lab_id, user)
    student_id = user_student_id(user)
    if not success:
        update_runtime_state(lab_id, student_id, "error")
        if request.headers.get("x-requested-with") == "fetch":
            return JSONResponse(
                {"detail": stderr or "Failed to run check"},
                status_code=502,
            )
        raise HTTPException(status_code=502, detail=stderr or "Failed to run check")

    try:
        json_start = stdout.find("{")
        if json_start < 0:
            raise ValueError("missing JSON object")
        check_result = json.loads(stdout[json_start:])
    except (json.JSONDecodeError, ValueError) as exc:
        record_event("check", lab_id, student_id, user["username"], "error", detail=str(exc))
        raise HTTPException(status_code=502, detail="Checker did not return valid JSON")

    update_runtime_state(
        lab_id,
        student_id,
        "running",
        last_seen=time.time(),
        last_check=check_result,
    )
    if request.headers.get("x-requested-with") == "fetch":
        return JSONResponse(check_result)
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/api/heartbeat/{lab_id}")
def heartbeat(lab_id: str, user: dict = Depends(get_current_user)):
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    with LAB_STATE_LOCK:
        if state_key(lab_id, student_id) in LAB_STATE:
            LAB_STATE[state_key(lab_id, student_id)]["last_seen"] = time.time()
    return {"status": "ok", "lab_id": lab_id, "student": student_id}


@app.get("/internal/terminal-auth")
@app.get("/internal/terminal-auth/{terminal_port}")
def terminal_auth(
    request: Request,
    terminal_port: Optional[int] = None,
    user: dict = Depends(get_current_user),
):
    if terminal_port is None:
        original_uri = request.headers.get("x-original-uri", "")
        match = re.match(r"^/terminal/([0-9]+)/", original_uri)
        if not match:
            raise HTTPException(status_code=400, detail="Missing terminal endpoint")
        terminal_port = int(match.group(1))

    terminal_owner = None
    for student in get_student_users().values():
        for scenario in list_scenarios():
            expected = endpoint_ports(scenario, student["student_id"], student)["terminal"]
            if expected == terminal_port:
                terminal_owner = student
                break
        if terminal_owner:
            break

    if not terminal_owner:
        raise HTTPException(status_code=404, detail="Unknown terminal endpoint")

    allowed = user["role"] == "admin" or user_student_id(user) == terminal_owner["student_id"]
    if not allowed:
        raise HTTPException(status_code=403, detail="Terminal is not assigned to this user")

    credential = f"{terminal_owner['student_id']}:{terminal_owner['password']}"
    encoded = base64.b64encode(credential.encode("utf-8")).decode("ascii")
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.headers["X-Terminal-Authorization"] = f"Basic {encoded}"
    return response


@app.get("/instructor", response_class=HTMLResponse)
def instructor_view(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Instructor access required")

    rows = []
    for scenario in list_scenarios():
        for student in get_student_users().values():
            rows.append(
                {
                    "lab_id": scenario["id"],
                    "title": scenario["title"],
                    "student": student["student_id"],
                    "status": get_lab_status(scenario["id"], student["student_id"]),
                }
            )

    return templates.TemplateResponse(
        "instructor.html",
        {
            "request": request,
            "user": user,
            "rows": rows,
            "events": read_recent_events(),
            "csrf_token": generate_token(user),
        },
    )


@app.post("/logout")
def logout():
    return PlainTextResponse(
        "Logged out. Close this tab or sign in again with another user.",
        status_code=status.HTTP_401_UNAUTHORIZED,
        headers={"WWW-Authenticate": 'Basic realm="Thesis Lab Portal"'},
    )


def lab_lifecycle_manager():
    while True:
        try:
            current_time = time.time()
            with LAB_STATE_LOCK:
                tracked_items = list(LAB_STATE.items())

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
                destroy_timeout = lifecycle.get("auto_destroy_after_minutes")
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
                        "auto_destroy",
                        lab_id,
                        student_id,
                        "scheduler",
                        "success" if success else "error",
                        detail=stderr if stderr else None,
                    )
                    if success:
                        with LAB_STATE_LOCK:
                            LAB_STATE.pop(key, None)
        except Exception as exc:
            record_event("scheduler", "system", "system", "scheduler", "error", detail=str(exc))

        time.sleep(settings.SCHEDULER_INTERVAL_SECONDS)


if settings.ENABLE_SCHEDULER:
    threading.Thread(target=lab_lifecycle_manager, daemon=True).start()
