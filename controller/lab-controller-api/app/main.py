import base64
import json
import re
import threading
import time
from pathlib import Path
from typing import Optional

import markdown
from fastapi import Depends, FastAPI, Form, HTTPException, Request, Response, status
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.auth import get_current_user, get_student_users
from app.config import settings
from app.events import read_recent_events, record_event
from app.feedback import (
    any_pending_feedback,
    build_evidence_export,
    feedback_exists,
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
    list_scenarios,
    load_scenario_metadata,
    student_guide_url,
    terminal_owner_for_port,
    user_student_id,
    validate_lab_id,
)
from app.ssh_client import run_labctl

app = FastAPI(title="Thesis Lab Portal")
app.mount(
    "/static",
    StaticFiles(directory=str(Path(__file__).resolve().parent / "static")),
    name="static",
)
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent / "templates"))


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


@app.get("/", response_class=HTMLResponse)
def index():
    return RedirectResponse(url="/portal")


@app.get("/portal", response_class=HTMLResponse)
def portal_overview(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] == "instructor":
        return RedirectResponse(url="/instructor", status_code=303)

    labs = list_scenarios()
    student_id = user_student_id(user) if user["role"] == "student" else None
    states = {}
    for lab in labs:
        states[lab["id"]] = get_lab_status(lab["id"], student_id)

    feedback_pending = user["role"] == "student" and any_pending_feedback(student_id)

    return templates.TemplateResponse(
        "overview.html",
        {
            "request": request,
            "user": user,
            "labs": labs,
            "states": states,
            "feedback_pending": feedback_pending,
            "csrf_token": generate_token(user),
        },
    )


@app.get("/labs/{lab_id}", response_class=HTMLResponse)
def lab_detail(request: Request, lab_id: str, user: dict = Depends(get_current_user)):
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")

    if user["role"] != "student":
        return RedirectResponse(url="/instructor", status_code=303)

    student_id = user_student_id(user)

    status_text = get_lab_status(lab_id, student_id)
    if status_text == "running":
        update_runtime_state(lab_id, student_id, "running", last_seen=time.time())

    ports = endpoint_ports(scenario, student_id)

    runtime_state = runtime_state_for(lab_id, student_id)
    check_result = runtime_state.get("last_check") or load_check_result(lab_id, student_id)

    feedback_submitted = feedback_exists(lab_id, student_id)
    show_feedback_banner = (
        runtime_state.get("status") in ("ended", "stopped") and not feedback_submitted
    )

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
            "app_port": ports.get("app"),
            "host": settings.WORKER_HOST,
            "student_guide_url": student_guide_url(scenario),
            "feedback_submitted": feedback_submitted,
            "show_feedback_banner": show_feedback_banner,
            "csrf_token": generate_token(user),
        },
    )


@app.get("/labs/{lab_id}/status")
def lab_status(lab_id: str, user: dict = Depends(get_current_user)):
    require_student(user)
    scenario = load_scenario_metadata(lab_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Lab not found")
    student_id = user_student_id(user)
    ports = endpoint_ports(scenario, student_id, user)
    endpoints = {
        "browser_terminal": f"/terminal/{ports['terminal']}/",
        "ssh": f"ssh {student_id}@{settings.WORKER_HOST} -p {ports['ssh']}",
    }
    if "app" in ports:
        endpoints["app"] = f"http://{settings.WORKER_HOST}:{ports['app']}/"

    return {
        "lab": lab_id,
        "student": student_id,
        "state": get_lab_status(lab_id, student_id),
        "endpoints": endpoints,
    }


@app.post("/labs/{lab_id}/start")
def start_lab(
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    require_student(user)
    validate_token(csrf_token, user)
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

    if any_pending_feedback(student_id):
        raise HTTPException(
            status_code=403,
            detail=(
                "Feedback pending. Submit feedback for your previous lab before starting a new one."
            ),
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
    require_student(user)
    validate_token(csrf_token, user)
    success, _stdout, stderr, _duration = run_action("stop", lab_id, user)
    student_id = user_student_id(user)
    update_runtime_state(
        lab_id,
        student_id,
        "stopped" if success else "error",
        last_seen=time.time(),
    )
    if not success:
        raise HTTPException(status_code=502, detail=stderr or "Failed to stop lab")
    return RedirectResponse(url=f"/labs/{lab_id}", status_code=303)


@app.post("/labs/{lab_id}/reset")
def reset_lab(
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    require_student(user)
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
    require_student(user)
    validate_token(csrf_token, user)
    success, _stdout, stderr, _duration = run_action("destroy", lab_id, user)
    student_id = user_student_id(user)
    update_runtime_state(lab_id, student_id, "ended")
    if not success:
        raise HTTPException(status_code=502, detail=stderr or "Failed to end lab")
    return RedirectResponse(url=f"/labs/{lab_id}/feedback", status_code=303)


@app.post("/labs/{lab_id}/check")
def check_lab(
    request: Request,
    lab_id: str,
    csrf_token: str = Form(...),
    user: dict = Depends(get_current_user),
):
    require_student(user)
    validate_token(csrf_token, user)
    success, stdout, stderr, duration = run_action("check", lab_id, user)
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
        raise HTTPException(status_code=502, detail="Checker did not return valid JSON") from exc

    save_check_result(lab_id, student_id, check_result, duration_seconds=duration)
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
    require_student(user)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    touch_runtime_state(lab_id, student_id)
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


@app.get("/instructor", response_class=HTMLResponse)
def instructor_view(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")

    rows = []
    command_logs = []
    for scenario in list_scenarios():
        for student in get_student_users().values():
            status_text, recent_commands = get_lab_status_details(
                scenario["id"], student["student_id"]
            )
            rows.append(
                {
                    "lab_id": scenario["id"],
                    "title": scenario["title"],
                    "student": student["student_id"],
                    "status": status_text,
                    "feedback_submitted": feedback_exists(scenario["id"], student["student_id"]),
                }
            )
            command_logs.extend(recent_commands)

    command_logs = sorted(command_logs, key=lambda entry: entry.get("timestamp", ""), reverse=True)[
        :50
    ]

    return templates.TemplateResponse(
        "instructor.html",
        {
            "request": request,
            "user": user,
            "rows": rows,
            "events": read_recent_events(),
            "command_logs": command_logs,
            "csrf_token": generate_token(user),
        },
    )


@app.get("/instructor/solution-notes/{lab_id}", response_class=HTMLResponse)
def instructor_solution_notes(
    request: Request, lab_id: str, user: dict = Depends(get_current_user)
):
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")
    validate_lab_id(lab_id)

    solution_path = Path(settings.LABS_DIR) / lab_id / "docs" / "solution-notes.md"
    if not solution_path.is_file():
        raise HTTPException(status_code=404, detail="Solution notes not found for this lab")

    raw_md = solution_path.read_text(encoding="utf-8")
    html_content = markdown.markdown(raw_md, extensions=["fenced_code", "tables"])
    return templates.TemplateResponse(
        "solution_notes.html",
        {
            "request": request,
            "user": user,
            "lab_id": lab_id,
            "content": html_content,
        },
    )


@app.get("/labs/{lab_id}/feedback", response_class=HTMLResponse)
def feedback_form(request: Request, lab_id: str, user: dict = Depends(get_current_user)):
    require_student(user)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    already_submitted = feedback_exists(lab_id, student_id)
    return templates.TemplateResponse(
        "feedback.html",
        {
            "request": request,
            "user": user,
            "lab_id": lab_id,
            "already_submitted": already_submitted,
            "csrf_token": generate_token(user),
        },
    )


@app.post("/labs/{lab_id}/feedback")
def submit_feedback(
    lab_id: str,
    csrf_token: str = Form(...),
    section_a: str = Form(""),
    section_b_rating: int = Form(3),
    section_b: str = Form(""),
    user: dict = Depends(get_current_user),
):
    require_student(user)
    validate_token(csrf_token, user)
    validate_lab_id(lab_id)
    student_id = user_student_id(user)
    save_feedback(lab_id, student_id, section_a, section_b_rating, section_b)
    return RedirectResponse(url="/portal", status_code=303)


@app.get("/instructor/feedback/{lab_id}", response_class=HTMLResponse)
def instructor_feedback(
    request: Request,
    lab_id: str,
    user: dict = Depends(get_current_user),
):
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")
    validate_lab_id(lab_id)
    feedback_items = list_feedback(lab_id)
    return templates.TemplateResponse(
        "instructor_feedback.html",
        {
            "request": request,
            "user": user,
            "lab_id": lab_id,
            "feedback_items": feedback_items,
            "csrf_token": generate_token(user),
        },
    )


@app.post("/instructor/evidence/export")
def export_evidence(
    csrf_token: str = Form(...),
    evaluation_id: str = Form(...),
    anonymize: bool = Form(False),
    user: dict = Depends(get_current_user),
):
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")
    validate_token(csrf_token, user)
    build_evidence_export(evaluation_id, anonymize=anonymize)
    return RedirectResponse(
        url=f"/instructor/evidence/export/{evaluation_id}",
        status_code=303,
    )


@app.get("/instructor/evidence/export/{export_id}")
def download_export(export_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "instructor":
        raise HTTPException(status_code=403, detail="Instructor access required")

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
