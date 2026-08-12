#!/usr/bin/env python3
"""Dependent application for the Pattern B authoring reference.

This tiny app depends on the records-backend service: it fetches records from
the backend and serves a short summary. It exists to demonstrate the
*continuity* concern of Pattern B - when a student hardens the shared backend,
this dependent app must keep working. The app reads its backend URL and the
credential it presents to the backend from a student-editable config file, so
the remediation includes reconfiguring this app, not only the backend.
"""

from __future__ import annotations

import os
import signal
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG_PATH = Path("/etc/records-app/config.env")
LOG_PATH = Path("/var/log/records-app.log")
PID_PATH = Path("/run/records-app.pid")
SETTINGS: dict[str, str] = {}


def load_settings() -> None:
    values: dict[str, str] = {}
    for raw_line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    SETTINGS.clear()
    SETTINGS.update(values)


def write_log(message: str) -> None:
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(f"{message}\n")


def reload_settings(_signum: int, _frame: object) -> None:
    load_settings()
    write_log("configuration reloaded")


def fetch_backend() -> tuple[int, str]:
    base = SETTINGS.get("BACKEND_URL", "").rstrip("/")
    token = SETTINGS.get("BACKEND_TOKEN", "")
    request = urllib.request.Request(f"{base}/records")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except OSError as exc:
        return 0, str(exc)


class AppHandler(BaseHTTPRequestHandler):
    def send_text(self, status: int, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_text(200, "ok")
            return
        if self.path != "/summary":
            self.send_text(404, "not found")
            return

        status, body = fetch_backend()
        if status == 200:
            count = sum(1 for line in body.splitlines() if line.startswith("sample-record-"))
            self.send_text(200, f"records available: {count}")
            return
        # The backend refused (typically 401 once access control is enabled but
        # this app has not been given a valid credential). Surface it plainly so
        # the continuity guardrail can detect a broken dependent app.
        self.send_text(502, f"backend unavailable: status={status}")

    def log_message(self, message_format: str, *args: object) -> None:
        write_log(f"{self.client_address[0]} {message_format % args}")


def main() -> None:
    load_settings()
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")
    signal.signal(signal.SIGHUP, reload_settings)
    write_log("records app started")
    ThreadingHTTPServer(("0.0.0.0", 8080), AppHandler).serve_forever()


if __name__ == "__main__":
    main()
