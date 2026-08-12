#!/usr/bin/env python3
"""Internal backend for the Pattern C authoring reference.

This service lives ONLY on the internal network. The workstation cannot reach it
directly - only through the proxy. It serves a public path and an internal-only
path, so the lesson is that the internal path must not be reachable from outside
even though the proxy sits in front of both.
"""

from __future__ import annotations

import signal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DATA_PATH = Path("/var/lib/internal-backend/records.txt")
LOG_PATH = Path("/var/log/internal-backend.log")

# Synthetic internal-only status a proxy misconfiguration would expose. No real
# data - this stands in for an internal admin/status endpoint.
INTERNAL_STATUS = (
    "internal-status: node=backend-01 role=primary secret_marker=sample-demo-internal-marker"
)


def write_log(message: str) -> None:
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(f"{message}\n")


class BackendHandler(BaseHTTPRequestHandler):
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
        elif self.path == "/public/records":
            self.send_text(200, DATA_PATH.read_text(encoding="utf-8"))
        elif self.path == "/internal/status":
            self.send_text(200, INTERNAL_STATUS)
        else:
            self.send_text(404, "not found")

    def log_message(self, message_format: str, *args: object) -> None:
        write_log(f"{self.client_address[0]} {message_format % args}")


def main() -> None:
    signal.signal(signal.SIGHUP, lambda *_: write_log("backend reload signal"))
    write_log("internal backend started")
    ThreadingHTTPServer(("0.0.0.0", 8080), BackendHandler).serve_forever()


if __name__ == "__main__":
    main()
