# Controller

Lifecycle and portal/controller code will live here.

Planned contents:

- `labctl`
- `labctl-ssh-wrapper`
- FastAPI portal/controller application
- controller tests
- shared templates or rendering helpers

Students must not run `labctl`, Docker, Compose, or Ansible directly. Portal actions on `x02` call restricted lifecycle commands on `x01` through the locked-down `labadmin` SSH path.

## `labctl` Language Decision

`labctl` will be implemented in Python.

Reasoning:

- It must validate `scenario.yaml` against `labs/scenario.schema.json`.
- It must render Compose templates from structured student/scenario data.
- It must emit and store JSON status/check output.
- It must validate lab IDs, student IDs, project names, ports, and runtime paths.
- It must invoke Docker Compose with explicit argv lists, not shell command strings.

The implementation should keep dependencies minimal and pinned. Any subprocess execution must use argument lists and must not use `shell=True`.
