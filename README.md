# Thesis Lab Platform

This repository contains the implementation artifacts for a VM-hosted, container-first cybersecurity lab platform for the thesis project.


## Current Build Focus

management plane so the same platform path works for future labs without
Redis-specific shortcuts:

1. Ansible prepares `x01` as the Podman lab worker.
2. `labctl start redis-exposed student01` starts the lab.
3. `student01` opens the browser terminal on port `19001`.
4. SSH fallback maps to workstation port `22001`.
5. The demo app maps to port `18001`.
6. The student discovers and fixes unauthenticated Redis.
7. The checker distinguishes `vulnerable`, `fixed`, and `broken`.
8. Reset and End Lab restore or remove generated state from code.
9. FastAPI, Nginx, and systemd are managed through Ansible roles and handlers.
10. Playwright verifies the portal UI locally and the live terminal/WebSocket

## Repository Areas

| Path | Purpose |
|---|---|
| `infra/` | Ansible inventory, playbooks, roles, smoke tests, and teardown. |
| `labs/` | Versioned lab scenarios, Podman runtime templates, lab files, seed data, checks, and guides. |
| `controller/` | `labctl`, SSH wrapper, and the FastAPI portal/controller. |
| `docs/` | Static documentation, MkDocs content, and implementation notes. |
| `tests/` | Playwright E2E tests for portal and browser terminal behavior. |

## Local Development Assumptions

- The repository may be edited locally before live VM access exists.
- End-to-end verification needs access to the target VMs and Podman runtime.
- Live portal verification uses `PORTAL_BASE_URL`, `PORTAL_USER`,
  `PORTAL_PASSWORD`, and `PORTAL_EXPECT_LIVE=true` with `npm run test:portal`.
- Generated runtime state, rendered runtime manifests, check results, logs, caches, credentials, and private keys must not be committed.

## Build Order


3. Continue the Redis scenario contract and browser terminal path.
4. Build the checker, lifecycle tooling, end-to-end Redis POC, and then the management plane.
