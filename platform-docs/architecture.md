# High-Level Architecture

The thesis cybersecurity lab platform is a reproducible, container-first environment for deploying, resetting, monitoring, and verifying vulnerable-by-design Linux service misconfiguration labs. It uses Infrastructure-as-Code (Ansible) for VM provisioning and Configuration-as-Code (`scenario.yaml`) for lab definitions.

## System Overview

```text
             [ Platform Admins ]
                  |
                  | (Ansible Playbooks via SSH)
                  v
+=================================================================+
|            Infrastructure-as-Code (infra/ directory)            |
| Provisions RHEL 9.6 baseline, installs packages, sets up SSH   |
| keys, configures Nginx, FastAPI, Podman, and copies lab code.   |
+=================================================================+
            |                                  |
            | (Configures x02)                 | (Configures x01)
            v                                  v
+=================================+ +=================================+
|      x02: Control Plane VM      | |       x01: Lab Worker VM        |
|                                 | |                                 |
| +-----------+      +----------+ | | +-----------------------------+ |
| | Nginx     |--/-->| FastAPI  |-+-+>| Restricted SSH Wrapper      | |
| | Proxy     |  \-->| Portal   | | | |           |                 | |
| +-----------+      +----------+ | | |           v                 | |
|      |               |          | | |  labctl (Lifecycle CLI)     | |
|      |             +----------+ | | +-----------------------------+ |
|      \------------>| MkDocs   | | |             |                   |
|                    +----------+ | |             v                   |
+======|==========================+ | [ Podman Container Engine ]     |
       |                            |             |                   |
       |                            |             v                   |
       | (WebSockets for Terminal)  | +-----------------------------+ |
       \----------------------------+>| Workstation Container       | |
                                    | | (ttyd daemon)               | |
                                    | +-----------------------------+ |
                                    | | Private Labnet (Per User)   | |
                                    | |                             | |
                                    | | [ Vulnerable Service(s) ]   | |
                                    | |                             | |
                                    | | [ Demo App Container ]      | |
                                    | +-----------------------------+ |
                                    +===================|======|======+
                                                        |      |
[ Students & Instructors ]                              |      |
       |            |                                   |      |
       |            \-----------------------------------/      |
       |               (Direct SSH Fallback: Port 220XX)       |
       |                                                       |
       \-------------------------------------------------------/
                       (Direct Demo App: Port 180XX)
```

## Core Components

### 1. Infrastructure-as-Code (Ansible)

Located in `infra/`. Ansible playbooks configure both VMs identically and securely.

- Installs **Podman/Buildah** on the Lab Worker (`x01`). Docker CE is unavailable on RHEL 9.6 ppc64le; Docker is deferred to a future dedicated worker VM.
- Installs **Nginx**, **FastAPI**, and **MkDocs** on the Control Plane (`x02`).
- Secures the x02→x01 channel by configuring `labadmin` with restricted SSH keys and a forced-command wrapper.
- **Caches images:** builds and caches lab container images locally during provisioning from each scenario's `build.images` metadata — no runtime builds, no external registry.

### 2. Control Plane (x02)

Orchestrates the student experience. Serves UIs but runs **zero** vulnerable workloads.

- **FastAPI portal:** server-rendered portal for Start, Stop, Reset, End, and Check lifecycle actions. Enforces admission control (`max_concurrent_students`), CSRF protection, and HTTP Basic Auth.
- **MkDocs guides:** canonical student learning path. Static Markdown pages provide the structured workflow: Orient, Discover, Demonstrate Impact, Remediate, Verify, Reflect.
- **Nginx reverse proxy:** routes `/portal` to FastAPI, `/docs` to MkDocs, and `/terminal` to the authenticated student's workstation terminal via WebSocket. Terminal proxying uses portal-authorized per-student credential injection, not static credentials.

### 3. Lab Worker (x01)

Hosts vulnerable workloads inside isolated containers.

- **Podman:** daemonless container engine creating private networks, isolated volumes, and container instances per student/lab.
- **Restricted SSH wrapper (`labctl-ssh-wrapper`):** security boundary between x02 and x01. Only permits validated lifecycle commands (`start`, `stop`, `reset`, `check`, `status`, `destroy`). Rejects raw shell, extra arguments, shell metacharacters, unknown verbs, unknown labs, and unknown students.
- **Workstation container:** student jump box with tools (`nmap`, `redis-cli`, `curl`, etc.) and browser terminal (`ttyd`). Students connect here to interact with vulnerable services. Dedicated SSH fallback port also exposed.

### 4. Lifecycle Controller (`labctl`)

Python CLI installed on x01 under `controller/labctl_core/`. Validates `scenario.yaml` against a JSON schema, derives ports/images/checker runtime from scenario metadata, renders Podman templates, runs checker scripts inside ephemeral containers attached to the student's private `labnet`, and guarantees clean teardowns.

### 5. Configuration-as-Code Labs

Labs live in `labs/<lab-id>/`. Each lab consists of:

- `scenario.yaml`: metadata contract for ports, limits, docs links, image builds, checker runtime, and resource limits.
- `podman.yml.tpl`: Jinja2 template defining containers, networks, volumes, and ports.
- `checks/check.py`: checker script classifying the environment as `vulnerable`, `fixed`, or `broken`.
- `files/` and `seed/`: configuration files, Dockerfiles, entrypoint scripts, and dummy seed data.

## Scenario Shortlist

The platform's lab scenarios are selected from the research-grounded scenario selection report (`resources/scenario-selection-report.md`), which scores 19 candidates across 11 weighted criteria using 21 academic papers and 4 industry reports.

| Priority | Lab                  | Score  | Status   |
| -------- | -------------------- | ------ | -------- |
| 1        | Redis Exposed Cache  | 123.0  | POC done |
| 2        | SSH Weak Config      | 123.0  | Planned  |
| 3        | Firewall Bypass      | 114.5  | Planned  |
| 4        | LDAP Anonymous Bind  | 114.0  | Planned  |
| 5        | Unpatched Service    | 110.5  | Planned  |

## Security, Privacy, and Networking Models

1. **UCC VPN Boundary:** Both VMs sit behind the university's UCC VPN. The platform does not automate host firewalls or its own VPN.
2. **Deterministic Routing:** Student traffic uses mathematically derived host ports (Terminal = `19000 + N`, SSH = `22000 + N`, App = `18000 + N`).
3. **Strict Privacy Model:** No screenshots, terminal recordings, keystroke capture, or app-activity monitoring. Typed terminal commands are logged as explicit command logs for instructor troubleshooting and thesis verification. Idle detection uses privacy-preserving signals (HTTP heartbeats, TCP connection checks).
4. **Lightweight Auth:** HTTP Basic Auth tied to a YAML-based student registry. No external SSO/OIDC dependency.
5. **Container Isolation:** No host runtime socket mounts, no privileged containers, no host networking. Vulnerable services stay private inside the student's `labnet`. Resource limits declared per scenario.

## Lifecycle Flow

1. **Start:** Portal calls `labctl start <lab> <student>`. `labctl` validates `scenario.yaml`, creates a private `labnet`, and spins up workstation + vulnerable services.
2. **Access:** Student uses the portal's split-pane terminal (proxied via Nginx/WebSocket to `ttyd` on x01). SSH fallback available.
3. **Check:** Portal calls `labctl check`. Checker runs inside an ephemeral container on the private `labnet`. JSON result returned to portal.
4. **Reset:** `labctl reset` tears down containers and volumes, then rebuilds from base templates — reliably restoring the vulnerable baseline.
5. **Stop:** `labctl stop` stops containers but keeps volumes for a short retention window.
6. **End/Destroy:** `labctl destroy` removes all generated resources (containers, networks, volumes, rendered manifests, check results).

## Lab Design Patterns (Lessons Learned)

These patterns emerged during platform testing and apply to all future scenarios:

- **Checker isolation:** Host-executed checkers cannot reach private-network services. Checkers must run as ephemeral containers attached to the student's `labnet`.
- **Entrypoint argument handling:** Custom `entrypoint.sh` scripts must include `if [ "$#" -gt 0 ]; then exec "$@"; else ... fi` so `labctl check` can reuse the image to execute check scripts safely.
- **Healthcheck dependencies:** Do not bloat images with `curl` just for healthchecks. Use native runtime tools (e.g., `python3 -c "import urllib..."` for Python-based images).
- **Internal lab sudo:** If a lab teaches service administration through constrained in-container sudo, that container cannot use `no_new_privileges=true`. Keep the exception narrow, documented in the runtime template, and never combine it with privileged mode, host networking, or host runtime socket mounts.
- **CAP_AUDIT_WRITE:** Containers running `sshd` with PTY allocation need `CAP_AUDIT_WRITE` or sessions will fail with `linux_audit_write_entry failed: Operation not permitted`.
- **Podman internal networks:** Do not mark a Podman network as `--internal` when containers publish required student access ports — host-published ports must remain reachable.

## VM Path Convention

| Path                   | Purpose                                                        | Managed By              |
| ---------------------- | -------------------------------------------------------------- | ----------------------- |
| `/opt/thesis-labs`     | Deployed versioned code, templates, controller, static docs.   | Ansible                 |
| `/var/lib/thesis-labs` | Generated lab state, rendered manifests, check results.        | `labctl` and controller |
| `/var/log/thesis-labs` | Platform logs, lifecycle events, command logs.                 | Ansible, controller     |
| `/etc/thesis-labs`     | Host-level configuration (non-secret platform settings).       | Ansible                 |
