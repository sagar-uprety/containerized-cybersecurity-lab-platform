# Thesis Lab Platform

This repository contains the implementation artifacts for a VM-hosted, container-first cybersecurity lab platform for the thesis project.


## Current Build Focus

The first vertical slice is a browser-terminal-first Redis misconfiguration lab:

1. Ansible prepares `x01` as the Docker lab worker.
2. `labctl start redis-exposed student01` starts the lab.
3. `student01` opens the browser terminal on port `19001`.
4. SSH fallback maps to workstation port `22001`.
5. The demo app maps to port `18001`.
6. The student discovers and fixes unauthenticated Redis.
7. The checker distinguishes `vulnerable`, `fixed`, and `broken`.
8. Reset and destroy restore or remove generated state from code.

## Repository Areas

| Path | Purpose |
|---|---|
| `infra/` | Ansible inventory, playbooks, roles, smoke tests, and teardown. |
| `labs/` | Versioned lab scenarios, Compose templates, lab files, seed data, checks, and guides. |
| `controller/` | `labctl`, SSH wrapper, and the FastAPI portal/controller. |
| `docs/` | Static documentation, MkDocs content, and implementation notes. |

## Local Development Assumptions

- The repository may be edited locally before live VM access exists.
- End-to-end verification needs access to the target VMs and Docker runtime.
- Generated runtime state, rendered Compose files, check results, logs, caches, credentials, and private keys must not be committed.

## Build Order


3. Continue the Redis scenario contract and browser terminal path.
4. Build the checker, lifecycle tooling, end-to-end Redis POC, and then the management plane.
