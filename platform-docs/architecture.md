# High-Level Architecture

The thesis cybersecurity lab platform is designed to be a reproducible, container-first environment. It uses Infrastructure-as-Code (Ansible) for provisioning and Configuration-as-Code (`scenario.yaml`) for lab definitions.

## System Overview

Here is a readable ASCII diagram of how traffic and commands flow through the platform:

```text
             [ Platform Admins ]
                  |
                  | (Ansible Playbooks via SSH)
                  v
+=================================================================+
|            Infrastructure-as-Code (infra/ directory)            |
| Provisions RHEL baseline, installs packages, sets up SSH keys,  |
|      configures Nginx, FastAPI, Podman, and copies code.        |
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
                                    | | [ Vuln Redis Container ]    | |
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

Located in the `infra/` directory, Ansible playbooks are responsible for configuring the two virtual machines identically and securely.

-   Installs **Podman** on the Lab Worker (`x01`).
-   Installs **Nginx**, **FastAPI**, and **MkDocs** on the Control Plane (`x02`).
-   Secures the communication channel by configuring the `labadmin` user with restricted SSH keys that force the security wrapper.
-   **Caches images:** builds and caches lab container images locally during provisioning, so student lab starts do not rely on runtime builds or external registries.

### 2. Control Plane (x02)

The control node orchestrates the student experience. It serves the user interfaces but runs **zero** vulnerable workloads itself.

-   **FastAPI portal:** lightweight, server-rendered portal where students can Start, Stop, Reset, End, and Check their assigned labs. It enforces admission control (`max_concurrent_students`) to prevent server overload.
-   **MkDocs guides:** canonical source for learning. Static Markdown pages provide the structured workflow: Orient, Discover, Demonstrate Impact, Remediate, Verify, and Reflect.
-   **Nginx reverse proxy:** routes `/portal` to FastAPI, `/docs` to MkDocs, and `/terminal` to the authenticated student's workstation terminal on the lab worker via WebSockets.

### 3. Lab Worker (x01)

The execution node hosts the actual vulnerable workloads inside highly isolated containers.

-   **Podman:** daemonless container engine used to create private networks, isolated volumes, and container instances for every student.
-   **Restricted SSH wrapper:** security boundary between the Control Plane and the Lab Worker. The portal SSHes into the worker using a strictly validated wrapper script (`labctl-ssh-wrapper`) that only permits exact lifecycle commands (`start`, `stop`, `reset`, `check`, `status`, `destroy`). It prevents raw shell execution.
-   **Workstation container:** safe jump box equipped with tools (`nmap`, `redis-cli`, `curl`, etc.) and a browser-based terminal (`ttyd`). Students connect here to interact with the vulnerable services. It also exposes a dedicated port for SSH fallback access.

### 4. Lifecycle Controller (`labctl`)

A Python CLI installed on the Lab Worker. The small executable delegates to reusable modules under `labctl_core/`. It validates `scenario.yaml`, derives ports/images/checker runtime from scenario metadata, renders Podman templates into exact container commands, runs checker scripts inside ephemeral containers safely attached directly to the private `labnet`, and guarantees clean teardowns.

### 5. Configuration-as-Code Labs

Labs are defined in the `labs/` directory. Each lab consists of:

-   `scenario.yaml`: metadata contract for ports, limits, docs links, image builds, and checker runtime.
-   `podman.yml.tpl`: template defining the containers and private networks.
-   `checks/check.py`: checker script classifying the environment as `vulnerable`, `fixed`, or `broken`.
-   `files/` and `seed/`: configuration files, Dockerfiles, scripts, and dummy data.

## Security, Privacy, & Networking Models

To meet the strict requirements of the thesis evaluation, the architecture enforces several constraints:

1. **UCC VPN Boundary:** The platform assumes both VMs (`x01`, `x02`) sit behind the university's existing UCC VPN. Because the VPN provides the perimeter boundary, the platform does not automate complex host firewalls or its own VPN services.
2. **Deterministic Routing:** Rather than relying on dynamic DNS or complex ingress controllers, student traffic is routed using strictly isolated, mathematically derived host ports (e.g., Terminal = `19000 + student_number`, SSH = `22000 + student_number`).
3. **Strict Privacy Model:** The platform strictly prohibits screenshots, terminal session recordings, raw keystroke capture, and application-activity monitoring. It may retain typed terminal commands as explicit command logs for instructor troubleshooting and thesis verification. Idle detection and evaluation metrics rely on privacy-preserving operational signals such as HTTP heartbeats, TCP connection checks, lifecycle JSON events, and command-log metadata.
4. **Lightweight Auth:** The portal utilizes HTTP Basic Auth tied to a YAML-based student registry to keep the prototype lightweight and avoid dependencies on external SSO/OIDC providers.

## Lifecycle Flow

1. **Start**: Portal calls `labctl start <lab> <student>`. `labctl` parses `scenario.yaml`, creates a private `labnet`, and spins up the Workstation and Vulnerable Services.
2. **Access**: The student accesses the terminal via the Portal's split-pane view (proxied to the Workstation container on x01).
3. **Check**: Portal calls `labctl check`. `labctl` runs `check.py` over the private network. The JSON result is returned to the Portal.
4. **Reset**: `labctl reset` tears down the containers and volumes, then rebuilds them from the base templates, reliably restoring the vulnerable baseline.
