import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DB_HOST = os.environ.get("DB_HOST", "db-app")
DB_PORT = os.environ.get("DB_PORT", "3306")


def _read_config():
    config = {}
    config_path = Path("/lab/demo-app/app-config.env")
    try:
        with config_path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    config[key.strip()] = value.strip()
    except FileNotFoundError:
        pass
    return config


def run_query(database, sql, timeout=3):
    """Run one SQL statement as the application account. Returns
    (stdout, returncode); never raises on a MySQL-side access error -
    that is a normal, expected outcome this app has to observe."""
    config = _read_config()
    user = config.get("DB_USER", "app_user")
    password = config.get("DB_PASSWORD", "")
    cmd = [
        "mariadb",
        "-N",
        "-B",
        # The demo app's own base image (python:3.12-slim) tracks a newer
        # Debian release than db-host's (debian:bookworm-slim), so its
        # mariadb-client build defaults to requiring TLS. db-host never
        # configures a TLS listener - that's not part of this lab's scope -
        # so the client side of that mismatch has to be told to skip it.
        "--skip-ssl",
        "-h",
        DB_HOST,
        "-P",
        DB_PORT,
        "-u",
        user,
        f"-p{password}",
        "--connect-timeout=3",
        database,
        "-e",
        sql,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return proc.stdout.strip(), proc.stderr, proc.returncode


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _fmt, *_args):
        return

    def send_text(self, status, body):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            try:
                out, _err, rc = run_query("app_db", "SELECT 1")
                if rc == 0 and out == "1":
                    self.send_text(200, "ok\n")
                else:
                    self.send_text(503, "db error\n")
            except Exception as exc:
                self.send_text(503, f"db error: {exc}\n")
            return

        if self.path == "/":
            try:
                out, _err, rc = run_query("app_db", "SELECT COUNT(*) FROM orders")
                if rc == 0 and out.isdigit():
                    self.send_text(200, "Order service reachable. orders_visible=true\n")
                else:
                    self.send_text(503, "Order service unavailable: orders_visible=false\n")
            except Exception as exc:
                self.send_text(503, f"Order service unavailable: {exc}\n")
            return

        if self.path == "/security-check":
            try:
                app_out, _app_err, app_rc = run_query("app_db", "SELECT COUNT(*) FROM orders")
                app_ok = "ok" if app_rc == 0 and app_out.isdigit() else "broken"

                hr_out, hr_err, hr_rc = run_query("hr_db", "SELECT COUNT(*) FROM employees")
                if hr_rc == 0 and hr_out.isdigit():
                    cross_db = "allowed"
                elif "access denied" in hr_err.lower():
                    cross_db = "denied"
                else:
                    cross_db = "unexpected"

                self.send_text(200, f"app_db={app_ok} cross_db={cross_db}\n")
            except Exception as exc:
                self.send_text(503, f"security check failed: {exc}\n")
            return

        self.send_text(404, "not found\n")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()
