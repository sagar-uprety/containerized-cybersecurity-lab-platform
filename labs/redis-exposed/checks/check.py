#!/usr/bin/env python3
import argparse
import json
import socket
import urllib.error
import urllib.request


def read_resp_line(sock):
    data = b""
    while not data.endswith(b"\r\n"):
        chunk = sock.recv(1)
        if not chunk:
            break
        data += chunk
    return data.decode("utf-8", errors="replace").strip()


def encode_command(*parts):
    payload = f"*{len(parts)}\r\n"
    for part in parts:
        value = str(part)
        payload += f"${len(value.encode('utf-8'))}\r\n{value}\r\n"
    return payload.encode("utf-8")


def check_redis_unauth(host, port):
    # Returns (ping_blocked, read_blocked, error)
    # error is True if connection fails completely
    try:
        with socket.create_connection((host, int(port)), timeout=3) as sock:
            sock.settimeout(3.0)
            sock.sendall(encode_command("PING"))
            ping_resp = read_resp_line(sock)
            ping_blocked = ping_resp.startswith("-NOAUTH") or ping_resp.startswith("-WRONGPASS")

            sock.sendall(encode_command("GET", "session:alice"))
            read_resp = read_resp_line(sock)
            read_blocked = read_resp.startswith("-NOAUTH") or read_resp.startswith("-WRONGPASS")

            if not ping_resp and not read_resp:
                return False, False, True

            return ping_blocked, read_blocked, False
    except TimeoutError:
        return False, False, True
    except Exception:
        return False, False, True


def check_demo_app(url):
    # Returns (healthy, error)
    try:
        req = urllib.request.Request(f"{url}/health")
        with urllib.request.urlopen(req, timeout=3) as response:
            if response.status == 200:
                return True, False
            return False, False
    except Exception:
        return False, True


def main():
    parser = argparse.ArgumentParser(description="Redis exposed lab checker")
    parser.add_argument("--lab", required=True, help="Lab ID")
    parser.add_argument("--student", required=True, help="Student ID")
    parser.add_argument("--redis-host", default="redis-host", help="Redis host")
    parser.add_argument("--redis-port", default="6379", type=int, help="Redis port")
    parser.add_argument("--app-url", default="http://demo-app:8080", help="Demo app URL")

    args = parser.parse_args()

    ping_blocked, read_blocked, redis_err = check_redis_unauth(args.redis_host, args.redis_port)
    app_healthy, app_err = check_demo_app(args.app_url)

    checks = [
        {"name": "unauthenticated_ping_blocked", "passed": ping_blocked},
        {"name": "unauthenticated_read_blocked", "passed": read_blocked},
        {"name": "demo_app_healthy", "passed": app_healthy},
    ]

    # Classification logic
    # vulnerable: Redis accepts unauthenticated access and demo app is healthy
    # fixed: Redis rejects unauthenticated access and demo app is healthy
    # broken: Redis or demo app unavailable, miswired, or partial

    if redis_err or app_err or not app_healthy:
        status = "broken"
    elif ping_blocked and read_blocked:
        status = "fixed"
    elif not ping_blocked and not read_blocked:
        status = "vulnerable"
    else:
        status = "broken"

    result = {"lab": args.lab, "student": args.student, "status": status, "checks": checks}

    print(json.dumps(result, indent=2))

    # If we want a return code based on anything? Let's just return 0, the JSON is the result.


if __name__ == "__main__":
    main()
