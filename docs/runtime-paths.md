# Runtime Path Convention

This project separates versioned repository code from generated platform state.

## Target VM Paths

| Path | Owner | Purpose | Managed By |
|---|---|---|---|
| `/opt/thesis-labs` | root/platform admin | Deployed versioned platform code, lab templates, controller code, and static docs. | Ansible |
| `/var/lib/thesis-labs` | platform service users | Generated lab state, rendered Compose files, check result JSON, per-student metadata, and retained stopped-lab volumes where applicable. | `labctl` and controller |
| `/var/log/thesis-labs` | platform service users | Platform logs, controller logs, lifecycle event logs, and allowed service logs. | Ansible, controller, log rotation |
| `/etc/thesis-labs` | root | Host-level configuration rendered by Ansible, including non-secret platform settings. | Ansible |

## Repository Paths

| Path | Purpose |
|---|---|
| `infra/` | Ansible source code for VM setup and teardown. |
| `labs/` | Versioned scenario source files and templates. |
| `controller/` | Internal lifecycle and portal/controller source code. |
| `docs/` | Static documentation source. |

## Rules

- Do not commit generated runtime state.
- Do not commit rendered Compose files.
- Do not commit credentials, private keys, check result JSON, logs, or caches.
- If a manual VM command becomes required, convert it into Ansible, Compose, `labctl`, docs, or checks.
- `labctl destroy` owns generated per-lab files under `/var/lib/thesis-labs`.
- Ansible teardown playbooks own platform cleanup for host-level services and directories.
