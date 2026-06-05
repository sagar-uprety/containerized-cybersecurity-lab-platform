# Controller

Lifecycle and portal/controller code lives here.

Current contents:

-   `labctl`: small executable wrapper for local lifecycle commands on the Lab Worker.
-   `labctl_core/`: reusable lifecycle, scenario, Podman, and validation modules.
-   `lab-controller-api/`: FastAPI portal/controller application with Jinja2 templates and static assets.
-   Playwright tests live under the repository `tests/` directory.

Students must not run `labctl`, Podman, Docker, Compose, or Ansible directly. Portal actions on the Control Plane (`x02`) call restricted lifecycle commands on the Lab Worker (`x01`) through the locked-down `labadmin` SSH path.

The FastAPI portal reads scenario metadata from `LABS_DIR` and users from
`PORTAL_USERS_FILE`. It should not hardcode Redis, `student01`, VM IPs, or
terminal credentials. Nginx terminal proxying is managed by the Ansible
`management-services` role and authorizes terminal requests through the portal
before forwarding to `ttyd`.

## `labctl` Language Decision

`labctl` is implemented in Python.

Reasoning:

-   It validates `scenario.yaml` against `labs/scenario.schema.json`.
-   It renders Podman runtime templates from structured student/scenario data.
-   It emits and stores JSON status/check output.
-   It validates lab IDs, student IDs, project names, ports, and runtime paths.
-   It invokes Podman with explicit argv lists, not shell command strings.

The implementation should keep dependencies minimal and pinned. Any subprocess execution must use argument lists and must not use `shell=True`.

## `labctl` Layout

`controller/labctl` is intentionally a small executable wrapper. Reusable
lifecycle code lives in `controller/labctl_core/`:

| Module         | Purpose                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `cli.py`       | Argument validation and verb dispatch.                                                           |
| `config.py`    | Runtime path discovery for installed and local development runs.                                 |
| `scenario.py`  | Scenario schema loading, student registry lookup, port derivation, images, and checker metadata. |
| `podman.py`    | Safe argv-based Podman operations.                                                               |
| `lifecycle.py` | Start, stop, reset, destroy, status, and check behavior.                                         |

New labs should extend `scenario.yaml` and `podman.yml.tpl`, not `labctl`.

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
