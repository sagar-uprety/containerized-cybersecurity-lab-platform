import threading
import time
import uuid

from fastapi import HTTPException

from app.config import settings

FORM_TOKENS = {}
FORM_TOKEN_LOCK = threading.Lock()


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
