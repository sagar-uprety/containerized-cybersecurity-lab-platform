#!/usr/bin/env python3
"""Records backend for the Pattern B authoring reference (shared service).

Identical in spirit to the sample-lab service: a config-driven HTTP records
store whose access control can be toggled. In Pattern B it is the SHARED
service that a dependent app relies on, so hardening it must not break that app."""

from __future__ import annotations

import os
import signal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG_PATH = Path("/etc/records-backend/config.env")
DATA_PATH = Path("/var/lib/records-backend/records.txt")
LOG_PATH = Path("/var/log/records-backend.log")
PID_PATH = Path("/run/records-backend.pid")
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


class SampleHandler(BaseHTTPRequestHandler):
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
        if self.path != "/records":
            self.send_text(404, "not found")
            return

        expected = f"Bearer {SETTINGS.get('AUTHORIZED_TOKEN', '')}"
        access_control = SETTINGS.get("ACCESS_CONTROL") == "enabled"
        if access_control and self.headers.get("Authorization") != expected:
            self.send_text(401, "authorization required")
            return
        self.send_text(200, DATA_PATH.read_text(encoding="utf-8"))

    def log_message(self, message_format: str, *args: object) -> None:
        write_log(f"{self.client_address[0]} {message_format % args}")


def main() -> None:
    load_settings()
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")
    signal.signal(signal.SIGHUP, reload_settings)
    write_log("records backend started")
    ThreadingHTTPServer(("0.0.0.0", 8080), SampleHandler).serve_forever()


if __name__ == "__main__":
    main()
