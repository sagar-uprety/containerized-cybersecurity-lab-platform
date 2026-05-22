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
    [ Students & Instructors ]                 |
               |                               |
               | (HTTP / HTTPS)                |
               v                               |
+=================================================================+
|                      x02: Control Plane VM                      |
|                                                                 |
|   +----------------+      +----------------+ +----------------+ |
|   |  Nginx Proxy   |--/-->| FastAPI Portal | | MkDocs Guides  | |
|   +----------------+  \-->|   (Port 8000)  | |  (Static HTML) | |
|           |               +----------------+ +----------------+ |
|           |                       |                             |
+===========|=======================|=============================+
            |                       |
            | (WebSockets for       | (SSH / strict labctl commands)
            |  browser terminal)    |
            v                       v
+===========|=======================|=============================+
|           |          x01: Lab Worker VM   |                     |
|           |                               v                     |
|   +----------------+      +---------------------------------+   |
|   |  Workstation   |      | Private Lab Network (Per User)  |   |
|   |   Container    |------|                                 |   |
|   | (ttyd / tools) |      |  [ Vulnerable Redis Container ] |   |
|   +----------------+      |  [ Demo App Container         ] |   |
|                           +---------------------------------+   |
|                                                                 |
|            [ Podman Container Engine ] <--- Executed by Wrapper |
+=================================================================+
```

## Core Components

### 1. Infrastructure-as-Code (Ansible)
Located in the `infra/` directory, Ansible playbooks are responsible for configuring the two virtual machines identically and securely. 
- It installs **Podman** on the Lab Worker (`x01`).
- It installs **Nginx**, **FastAPI**, and **MkDocs** on the Control Plane (`x02`).
- It secures the communication channel by configuring the `labadmin` user with restricted SSH keys that forcefully trigger the security wrapper.

### 2. Control Plane (x02)
The control node orchestrates the student experience. It serves the user interfaces but runs **zero** vulnerable workloads itself.
- **FastAPI Portal**: A lightweight, server-rendered portal where students can Start, Stop, Reset, End, and Check their assigned labs. It enforces admission control (`max_concurrent_students`) to prevent server overload.
- **MkDocs Guides**: The canonical source for learning. Static Markdown pages provide the structured workflow (Orient, Discover, Impact, Remediate, Verify).
- **Nginx Reverse Proxy**: Routes `/portal` to FastAPI, `/docs` to MkDocs, and `/terminal` directly to the specific student's workstation container on the lab worker via WebSockets.

### 3. Lab Worker (x01)
The execution node hosts the actual vulnerable workloads inside highly isolated containers.
- **Podman**: The daemonless container engine used to spin up private networks, isolated volumes, and container instances for every student.
- **Restricted SSH Wrapper**: The security boundary between the Control Plane and the Lab Worker. The Portal SSHes into the worker using a strictly validated wrapper script (`labctl-ssh-wrapper`) that only permits exact lifecycle commands (`start`, `stop`, `reset`, `check`, `status`, `destroy`). It prevents raw shell execution.
- **Workstation Container**: A safe jump-box equipped with tools (`nmap`, `redis-cli`, `curl`, etc.) and a browser-based terminal (`ttyd`). Students connect here to interact with the vulnerable services. It also exposes a dedicated port for raw SSH fallback access.

### 4. Lifecycle Controller (`labctl`)
A Python CLI installed on the Lab Worker. It validates `scenario.yaml`, renders Podman Compose-like templates into exact container commands, runs python `check.py` scripts inside ephemeral containers safely (attached directly to the private `labnet` so vulnerable services aren't exposed), and guarantees clean teardowns.

### 5. Configuration-as-Code Labs
Labs are defined in the `labs/` directory. Each lab consists of:
- `scenario.yaml`: The metadata contract (ports, limits, docs links).
- `podman.yml.tpl`: A template defining the containers and private networks.
- `checks/check.py`: A script classifying the environment as `vulnerable`, `fixed`, or `broken`.
- `files/` & `seed/`: Configuration files, Dockerfiles, and dummy data.

## Lifecycle Flow

1. **Start**: Portal calls `labctl start <lab> <student>`. `labctl` parses `scenario.yaml`, creates a private `labnet`, and spins up the Workstation and Vulnerable Services.
2. **Access**: The student accesses the terminal via the Portal's split-pane view (proxied to the Workstation container on x01).
3. **Check**: Portal calls `labctl check`. `labctl` runs `check.py` over the private network. The JSON result is returned to the Portal.
4. **Reset**: `labctl reset` tears down the containers and volumes, then rebuilds them from the base templates, reliably restoring the vulnerable baseline.
