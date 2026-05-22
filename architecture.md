# High-Level Architecture

The thesis cybersecurity lab platform is designed to be a reproducible, container-first environment. It uses Infrastructure-as-Code (Ansible) for provisioning and Configuration-as-Code (`scenario.yaml`) for lab definitions.

## System Overview

```mermaid
flowchart LR
    Student((Student))
    Instructor((Instructor))

    subgraph "x02: Management Plane"
        Portal[FastAPI Portal]
        Docs[MkDocs Guides]
        NginxProxy[Nginx Reverse Proxy]
    end

    subgraph "x01: Lab Worker Node"
        Podman[(Podman Runtime)]
        Wrapper[Restricted SSH Wrapper]
        
        subgraph "Private Lab Network (Per Student)"
            Workstation[Workstation Container]
            VulnService[Vulnerable Service\n(e.g., Redis)]
            DemoApp[Demo App]
        end
    end

    Student -->|HTTP 80| NginxProxy
    Instructor -->|HTTP 80| NginxProxy
    
    NginxProxy -->|/portal| Portal
    NginxProxy -->|/docs| Docs
    NginxProxy -->|/terminal| Workstation

    Portal -->|labctl start/stop/check| Wrapper
    Wrapper -->|Executes labctl| Podman
```

## Core Components

### 1. Management Plane (x02)
The management node orchestrates the student experience. It exposes the user interfaces but runs no vulnerable workloads itself.
- **FastAPI Portal**: A lightweight, server-rendered portal where students can Start, Stop, Reset, End, and Check their assigned labs. It tracks basic state and lifecycle events.
- **MkDocs Guides**: The canonical source for learning. Static Markdown pages provide the structured workflow (Orient, Discover, Impact, Remediate, Verify) alongside instructor notes and solution guides.
- **Nginx Reverse Proxy**: Routes `/portal` to FastAPI, `/docs` to MkDocs, and `/terminal` to the specific student's workstation container on the lab worker via WebSockets.

### 2. Lab Worker Node (x01)
The worker node hosts the actual vulnerable workloads inside isolated containers.
- **Podman**: The daemonless container engine used to spin up private networks, isolated volumes, and container instances for every student.
- **Restricted SSH Wrapper**: The security boundary between the Management Plane and the Lab Worker. The Portal SSHes into the worker using a strictly validated wrapper script (`labctl-ssh-wrapper`) that only permits exact lifecycle commands (`start`, `stop`, `reset`, `check`, `status`, `destroy`) and prevents raw shell execution.
- **Workstation Container**: A safe jump-box equipped with tools (`nmap`, `redis-cli`, `curl`, etc.) and a browser-based terminal (`ttyd`). Students connect here to interact with the vulnerable services.

### 3. Lifecycle Controller (`labctl`)
A Python CLI installed on the Lab Worker. It validates `scenario.yaml`, renders Podman Compose-like templates into exact container commands, runs python `check.py` scripts inside ephemeral containers, and guarantees clean teardowns.

### 4. Configuration-as-Code Labs
Labs are defined in the `labs/` directory. Each lab consists of:
- `scenario.yaml`: The metadata contract (ports, limits, metadata, docs links).
- `podman.yml.tpl`: A template defining the containers and private networks.
- `checks/check.py`: A script classifying the environment as `vulnerable`, `fixed`, or `broken`.
- `files/` & `seed/`: Configuration files, Dockerfiles, and dummy data.

## Lifecycle Flow

1. **Start**: Portal calls `labctl start <lab> <student>`. `labctl` parses `scenario.yaml`, creates a private `labnet`, and spins up the Workstation and Vulnerable Services.
2. **Access**: The student accesses the terminal via the Portal's split-pane view (proxied to the Workstation container on x01).
3. **Check**: Portal calls `labctl check`. `labctl` runs `check.py` over the private network. The JSON result is returned to the Portal.
4. **Reset**: `labctl reset` tears down the containers and volumes, then rebuilds them from the base templates, reliably restoring the vulnerable baseline.
