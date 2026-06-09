import os
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REDIS_HOST = os.environ.get("REDIS_HOST", "redis-host")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))


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


def encode_command(*parts):
    payload = f"*{len(parts)}\r\n"
    for part in parts:
        value = str(part)
        payload += f"${len(value.encode('utf-8'))}\r\n{value}\r\n"
    return payload.encode("utf-8")


def read_resp_line(sock):
    data = b""
    while not data.endswith(b"\r\n"):
        chunk = sock.recv(1)
        if not chunk:
            break
        data += chunk
    return data.decode("utf-8", errors="replace").strip()


def redis_request(*command):
    config = _read_config()
    with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=2) as sock:
        username = config.get("REDIS_USERNAME", "")
        password = config.get("REDIS_PASSWORD", "")
        if username:
            sock.sendall(encode_command("AUTH", username, password))
        elif password:
            sock.sendall(encode_command("AUTH", password))
        if username or password:
            auth_response = read_resp_line(sock)
            if not auth_response.startswith("+OK"):
                raise RuntimeError(f"Redis AUTH failed: {auth_response}")
        sock.sendall(encode_command(*command))
        return read_resp_line(sock)


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
                response = redis_request("PING")
                if response not in ("+PONG",):
                    raise RuntimeError(f"unexpected Redis PING response: {response}")
                self.send_text(200, "ok\n")
            except Exception as exc:
                self.send_text(503, f"redis error: {exc}\n")
            return

        if self.path == "/":
            try:
                flag = redis_request("GET", "feature_flag:admin_mode")
                self.send_text(200, f"Order cache is reachable. admin_mode={flag}\n")
            except Exception as exc:
                self.send_text(503, f"Order cache unavailable: {exc}\n")
            return

        self.send_text(404, "not found\n")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()
