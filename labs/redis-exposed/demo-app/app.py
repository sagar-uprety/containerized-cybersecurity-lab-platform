import os
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REDIS_HOST = os.environ.get("REDIS_HOST", "redis-host")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", "")


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
    with socket.create_connection((REDIS_HOST, REDIS_PORT), timeout=2) as sock:
        if REDIS_PASSWORD:
            sock.sendall(encode_command("AUTH", REDIS_PASSWORD))
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
