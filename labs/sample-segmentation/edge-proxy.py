#!/usr/bin/env python3
"""Edge reverse proxy for the Pattern C authoring reference.

The proxy is the only container on BOTH networks, so it is the sole path from the
external workstation to the internal backend. Its config decides which request
paths it will forward. The vulnerable baseline forwards everything, including the
backend's internal-only path; the fix restricts it to public paths. This is an
application-layer segmentation control - no NET_ADMIN capability required. (For
the packet-filter variant of Pattern C, see the firewall lab, which uses
iptables and NET_ADMIN.)
"""

from __future__ import annotations

import os
import signal
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG_PATH = Path("/etc/edge-proxy/config.env")
LOG_PATH = Path("/var/log/edge-proxy.log")
PID_PATH = Path("/run/edge-proxy.pid")
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


class ProxyHandler(BaseHTTPRequestHandler):
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

        # In restricted mode the proxy refuses to forward internal paths. In the
        # vulnerable "open" baseline it forwards everything, exposing the
        # backend's internal-only endpoint to the external network.
        mode = SETTINGS.get("PROXY_MODE", "open")
        if mode == "restricted" and self.path.startswith("/internal"):
            self.send_text(403, "forbidden")
            return

        backend = SETTINGS.get("BACKEND_URL", "").rstrip("/")
        try:
            with urllib.request.urlopen(f"{backend}{self.path}", timeout=4) as response:
                self.send_text(response.status, response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            self.send_text(exc.code, exc.read().decode("utf-8", "replace"))
        except OSError as exc:
            self.send_text(502, f"backend unavailable: {exc}")

    def log_message(self, message_format: str, *args: object) -> None:
        write_log(f"{self.client_address[0]} {message_format % args}")


def main() -> None:
    load_settings()
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")
    signal.signal(signal.SIGHUP, reload_settings)
    write_log("edge proxy started")
    ThreadingHTTPServer(("0.0.0.0", 8080), ProxyHandler).serve_forever()


if __name__ == "__main__":
    main()
