import secrets
from pathlib import Path

import yaml
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import settings

security = HTTPBasic()


def _load_user_entries():
    try:
        with Path(settings.PORTAL_USERS_FILE).open(encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
    except FileNotFoundError:
        data = {"users": []}

    entries = {}
    for entry in data.get("users", []):
        username = str(entry.get("username", "")).strip()
        password = str(entry.get("password", ""))
        role = str(entry.get("role", "student")).strip()
        if not username or not password or role not in {"student", "admin", "instructor"}:
            continue

        student_id = str(entry.get("student_id") or username).strip()
        number = entry.get("number")
        if number is None and student_id.startswith("student"):
            try:
                number = int(student_id.replace("student", "", 1))
            except ValueError:
                number = None

        entries[username] = {
            "username": username,
            "password": password,
            "role": "admin" if role == "instructor" else role,
            "student_id": student_id,
            "number": number,
        }
    return entries


def get_user_registry():
    return _load_user_entries()


def get_student_users():
    return {
        username: user
        for username, user in get_user_registry().items()
        if user["role"] == "student"
    }


def get_current_user(credentials: HTTPBasicCredentials = Depends(security)):
    user_dict = get_user_registry().get(credentials.username)
    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )

    is_correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"), user_dict["password"].encode("utf8")
    )

    if not is_correct_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )

    return {
        "username": credentials.username,
        "password": user_dict["password"],
        "role": user_dict["role"],
        "student_id": user_dict["student_id"],
        "number": user_dict.get("number"),
    }
