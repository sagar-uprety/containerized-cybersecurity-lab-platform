# Controller

Lifecycle and portal/controller code lives here.

Current contents:

- `labctl`
- `labctl-ssh-wrapper`
- FastAPI portal/controller application
- portal templates
- Playwright tests under the repository `tests/` directory

Students must not run `labctl`, Podman, Docker, Compose, or Ansible directly. Portal actions on `x02` call restricted lifecycle commands on `x01` through the locked-down `labadmin` SSH path.

The FastAPI portal reads scenario metadata from `LABS_DIR` and users from
`PORTAL_USERS_FILE`. It should not hardcode Redis, `student01`, VM IPs, or
terminal credentials. Nginx terminal proxying is managed by the Ansible
`management-services` role and authorizes terminal requests through the portal
before forwarding to `ttyd`.

## `labctl` Language Decision

`labctl` will be implemented in Python.

Reasoning:

- It must validate `scenario.yaml` against `labs/scenario.schema.json`.
- It must render Podman runtime templates from structured student/scenario data.
- It must emit and store JSON status/check output.
- It must validate lab IDs, student IDs, project names, ports, and runtime paths.
- It must invoke Podman with explicit argv lists, not shell command strings.

The implementation should keep dependencies minimal and pinned. Any subprocess execution must use argument lists and must not use `shell=True`.

## Portal Verification

Local non-live checks:

```bash
npm run test:portal
```

Live x02/x01 checks:

```bash
PORTAL_BASE_URL=http://<x02-ip> \
PORTAL_USER=student01 \
PORTAL_PASSWORD=<student-password> \
PORTAL_EXPECT_LIVE=true \
npm run test:portal
```
