"""
Build a labctl runtime manifest dict from a scenario.yaml containers: block.

Design
------
scenario.yaml is pure, schema-validated YAML - no template syntax.
Lab authors express student-specific values using ``$platform.<var>`` tokens
in string fields.  This module resolves those tokens at start time using the
same context dict that lifecycle.py already builds, then assembles the
manifest structure that podman.py expects.

Supported $platform tokens
--------------------------
$platform.lab_id                  - e.g. "redis-exposed"
$platform.student_id              - e.g. "student01"
$platform.runtime_project         - e.g. "redis-exposed_student01"
$platform.student_password        - plaintext password for the student
$platform.ttyd_credential         - "<student_id>:<password>"
$platform.host_bind_ip            - host IP to bind published ports on
$platform.ssh_port                - computed SSH host port
$platform.browser_terminal_port   - computed browser-terminal host port
$platform.app_port                - computed app host port (optional)
$platform.thesis_platform_name    - "thesis-labs"
$platform.lab_source_root         - /opt/thesis-labs/labs  (or test override)

Volume resolution
-----------------
Volumes in containers[].volumes come in two forms:

  # Named volume - labctl manages creation/destruction
  - name: workstation_home          # logical name; "redis-exposed_student01_" prepended at runtime
    target: /home/student

  # Bind-mount from the lab source tree
  - host_path: $platform.lab_source_root/$platform.lab_id/docs/SITREP.txt
    target: /opt/lab/student/SITREP.txt
"""

from __future__ import annotations

_PLATFORM_PREFIX = "$platform."

_STANDARD_LABELS = ("thesis.platform", "thesis.lab", "thesis.student")


def _resolve(value: str, ctx: dict) -> str:
    """Replace every ``$platform.<key>`` token in *value* with ctx[key].

    Raises KeyError if the token is not present in ctx.
    """
    if _PLATFORM_PREFIX not in value:
        return value
    result = value
    for token, replacement in _token_map(ctx).items():
        result = result.replace(token, str(replacement))
    return result


def _token_map(ctx: dict) -> dict:
    return {f"{_PLATFORM_PREFIX}{k}": v for k, v in ctx.items()}


def _resolve_obj(obj, ctx: dict):
    """Recursively resolve $platform tokens in dicts, lists, and strings."""
    if isinstance(obj, str):
        return _resolve(obj, ctx)
    if isinstance(obj, dict):
        return {k: _resolve_obj(v, ctx) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_obj(item, ctx) for item in obj]
    return obj


def _platform_labels(ctx: dict) -> dict:
    return {
        "thesis.platform": ctx["thesis_platform_name"],
        "thesis.lab": ctx["lab_id"],
        "thesis.student": ctx["student_id"],
    }


def build_manifest(scenario: dict, ctx: dict) -> dict:
    """Return the runtime manifest dict from *scenario* and platform *ctx*.

    The returned dict has the structure that ``podman.py`` (ensure_network,
    ensure_volumes, start_containers) consumes.

    Parameters
    ----------
    scenario:
        Parsed scenario.yaml dict (already validated against the schema).
    ctx:
        Platform context dict as built by ``lifecycle._load_context()``.
        Required keys: lab_id, student_id, runtime_project,
        thesis_platform_name, student_password, ttyd_credential,
        host_bind_ip, ssh_port, browser_terminal_port, lab_source_root,
        resources, images.  ``app_port`` is optional.
    """
    runtime_project: str = ctx["runtime_project"]
    labels = _platform_labels(ctx)

    # ------------------------------------------------------------------ #
    # runtime / network                                                    #
    # ------------------------------------------------------------------ #
    manifest: dict = {
        "runtime": {
            "engine": "podman",
            "instance": runtime_project,
            "labels": labels,
        },
        "network": {
            "name": f"{runtime_project}_labnet",
            "internal": False,
            "labels": labels,
        },
        "volumes": [],
        "containers": [],
    }

    # ------------------------------------------------------------------ #
    # Collect all named volumes declared across all containers            #
    # ------------------------------------------------------------------ #
    # We build the volumes list by scanning containers so there is a      #
    # single source of truth — no separate top-level volumes: block in    #
    # scenario.yaml required.                                             #
    seen_volume_names: set[str] = set()

    container_defs = scenario.get("containers", [])
    services = scenario.get("services", {})
    resources_cfg = scenario.get("resources", {})

    for cdef in container_defs:
        for vol in cdef.get("volumes", []):
            logical_name = vol.get("name")
            if logical_name and logical_name not in seen_volume_names:
                seen_volume_names.add(logical_name)
                manifest["volumes"].append(
                    {
                        "name": f"{runtime_project}_{logical_name}",
                        "labels": labels,
                    }
                )

    # ------------------------------------------------------------------ #
    # Build each container entry                                          #
    # ------------------------------------------------------------------ #
    for cdef in container_defs:
        service_name: str = cdef["service"]
        hostname: str = cdef["hostname"]

        # image from services:
        service_cfg = services.get(service_name, {})
        image: str = service_cfg.get("image", "")

        # resource limits from resources: (keyed by service name)
        res = resources_cfg.get(service_name, {})

        container_name = f"{runtime_project}_{service_name.replace('-', '_')}"

        entry: dict = {
            "name": container_name,
            "image": image,
            "hostname": hostname,
        }

        if cdef.get("init", False):
            entry["init"] = True
        if cdef.get("restart"):
            entry["restart"] = cdef["restart"]

        # sysctls
        if cdef.get("sysctls"):
            entry["sysctls"] = _resolve_obj(cdef["sysctls"], ctx)

        # environment
        if cdef.get("environment"):
            entry["environment"] = _resolve_obj(cdef["environment"], ctx)

        # ports
        resolved_ports = [
            {
                "host_ip": _resolve(port.get("host_ip", ctx.get("host_bind_ip", "0.0.0.0")), ctx),
                "host_port": _resolve(str(port["host_port"]), ctx),
                "container_port": port["container_port"],
            }
            for port in cdef.get("ports", [])
        ]
        if resolved_ports:
            entry["ports"] = resolved_ports

        # expose
        if cdef.get("expose"):
            entry["expose"] = cdef["expose"]

        # volumes
        resolved_volumes = []
        for vol in cdef.get("volumes", []):
            if "name" in vol:
                # named (managed) volume
                resolved_volumes.append(
                    {
                        "source": f"{runtime_project}_{vol['name']}",
                        "target": vol["target"],
                    }
                )
            elif "host_path" in vol:
                # bind-mount from lab source tree
                resolved_volumes.append(
                    {
                        "source": _resolve(vol["host_path"], ctx),
                        "target": vol["target"],
                    }
                )
        if resolved_volumes:
            entry["volumes"] = resolved_volumes

        # network
        entry["network"] = {
            "name": f"{runtime_project}_labnet",
            "aliases": cdef.get("network_aliases", [hostname]),
        }

        # depends_on
        if cdef.get("depends_on"):
            entry["depends_on"] = cdef["depends_on"]

        # healthcheck
        if cdef.get("healthcheck"):
            hc = cdef["healthcheck"]
            entry["healthcheck"] = {
                "command": hc["command"],
                "interval": hc.get("interval", "10s"),
                "timeout": hc.get("timeout", "5s"),
                "retries": hc.get("retries", 6),
                "start_period": hc.get("start_period", "10s"),
            }

        # security
        if cdef.get("security"):
            entry["security"] = cdef["security"]

        # user — run as a specific user/uid inside the container
        if cdef.get("user"):
            entry["user"] = cdef["user"]

        # read_only — mount root filesystem read-only
        if cdef.get("read_only"):
            entry["read_only"] = cdef["read_only"]

        # resources from scenario resources: block
        if res:
            entry["resources"] = res

        # standard labels on every container
        entry["labels"] = labels

        manifest["containers"].append(entry)

    # ------------------------------------------------------------------ #
    # Auto-generate the workstation container from the workstation: block #
    # ------------------------------------------------------------------ #
    # The workstation is a shared platform container present in every lab.
    # Lab authors declare only the lab-specific pieces (env, shared_volumes,
    # depends_on, cap_add). Everything else is platform boilerplate.
    ws_cfg = scenario.get("workstation", {})
    ws_shared_vols = ws_cfg.get("shared_volumes", [])

    # standard platform volumes for the workstation
    ws_standard_vols = [
        ("workstation_home", "/home/student"),
        ("command_logs", "/var/log/thesis-labs/commands"),
    ]

    # register all workstation volumes (standard + shared)
    for vol_name, _target in ws_standard_vols:
        if vol_name not in seen_volume_names:
            seen_volume_names.add(vol_name)
            manifest["volumes"].append({"name": f"{runtime_project}_{vol_name}", "labels": labels})
    for svol in ws_shared_vols:
        logical_name = svol.get("name", "")
        if logical_name and logical_name not in seen_volume_names:
            seen_volume_names.add(logical_name)
            manifest["volumes"].append(
                {"name": f"{runtime_project}_{logical_name}", "labels": labels}
            )

    # standard platform env vars (always present)
    ws_environment = {
        "LAB_ID": ctx["lab_id"],
        "STUDENT_ID": ctx["student_id"],
        "STUDENT_PASSWORD": ctx["student_password"],
        "TTYD_CREDENTIAL": ctx["ttyd_credential"],
        "BROWSER_TERMINAL_PORT": str(ctx["browser_terminal_port"]),
    }
    # merge lab-specific env vars on top
    ws_environment.update(_resolve_obj(ws_cfg.get("environment", {}), ctx))

    ws_volumes = [
        {"source": f"{runtime_project}_{vol_name}", "target": target}
        for vol_name, target in ws_standard_vols
    ] + [
        {"source": f"{runtime_project}_{svol['name']}", "target": svol["target"]}
        for svol in ws_shared_vols
    ]
    ws_volumes.append(
        {
            "source": _resolve(f"{ctx['lab_source_root']}/{ctx['lab_id']}/docs/SITREP.txt", ctx),
            "target": "/opt/lab/student/SITREP.txt",
        }
    )

    ws_security = {
        "privileged": False,
        "host_network": False,
    }
    ws_cap_add = list(ws_cfg.get("cap_add", ["NET_RAW"]))
    if "AUDIT_WRITE" not in ws_cap_add:
        ws_cap_add.append("AUDIT_WRITE")
    if ws_cap_add:
        ws_security["cap_add"] = ws_cap_add

    ws_resources = resources_cfg.get("workstation", {})

    workstation_entry = {
        "name": f"{runtime_project}_workstation",
        "image": services.get("workstation", {}).get("image", ""),
        "hostname": "workstation",
        "init": True,
        "restart": "unless-stopped",
        "sysctls": {"net.ipv4.ping_group_range": "0 2147483647"},
        "environment": ws_environment,
        "ports": [
            {
                "host_ip": ctx.get("host_bind_ip", "0.0.0.0"),
                "host_port": str(ctx["browser_terminal_port"]),
                "container_port": 19000,
            },
            {
                "host_ip": ctx.get("host_bind_ip", "0.0.0.0"),
                "host_port": str(ctx["ssh_port"]),
                "container_port": 22,
            },
        ],
        "volumes": ws_volumes,
        "network": {
            "name": f"{runtime_project}_labnet",
            "aliases": ["workstation"],
        },
        "depends_on": ws_cfg.get("depends_on", []),
        "healthcheck": {
            "command": [
                "CMD-SHELL",
                "pgrep -x sshd >/dev/null && curl -sS -o /dev/null"
                " -w \"%{http_code}\" http://127.0.0.1:19000/ | grep -q '401'",
            ],
            "interval": "10s",
            "timeout": "5s",
            "retries": 6,
            "start_period": "10s",
        },
        "security": ws_security,
        "resources": ws_resources,
        "labels": labels,
    }
    manifest["containers"].append(workstation_entry)

    return manifest
