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
  - host_path: $platform.lab_source_root/$platform.lab_id/config/seed.txt
    target: /opt/lab/seed.txt
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

    # Use the default network when none are declared.
    scenario_networks = scenario.get("networks", [])
    if scenario_networks:
        networks = []
        for net_def in scenario_networks:
            net_name = net_def["name"]
            net_entry = {
                "name": f"{runtime_project}_{net_name}",
                "internal": net_def.get("internal", False),
                "labels": labels,
            }
            if net_def.get("driver"):
                net_entry["driver"] = net_def["driver"]
            networks.append(net_entry)
    else:
        networks = [
            {
                "name": f"{runtime_project}_labnet",
                "internal": False,
                "labels": labels,
            }
        ]

    manifest: dict = {
        "runtime": {
            "engine": "podman",
            "instance": runtime_project,
            "labels": labels,
        },
        "network": networks[0] if len(networks) == 1 else None,
        "networks": networks,
        "volumes": [],
        "containers": [],
    }

    # Derive named volumes from container declarations.
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

    for cdef in container_defs:
        service_name: str = cdef["service"]
        hostname: str = cdef["hostname"]

        service_cfg = services.get(service_name, {})
        image: str = service_cfg.get("image", "")

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

        if cdef.get("sysctls"):
            entry["sysctls"] = _resolve_obj(cdef["sysctls"], ctx)

        if cdef.get("environment"):
            entry["environment"] = _resolve_obj(cdef["environment"], ctx)

        resolved_ports = [
            {
                "host_ip": _resolve(port.get("host_ip", ctx.get("host_bind_ip", "0.0.0.0")), ctx),
                "host_port": _resolve(str(port["host_port"]), ctx),
                "container_port": port["container_port"],
                "protocol": port.get("protocol", "tcp"),
            }
            for port in cdef.get("ports", [])
        ]
        if resolved_ports:
            entry["ports"] = resolved_ports

        if cdef.get("expose"):
            entry["expose"] = cdef["expose"]

        resolved_volumes = []
        for vol in cdef.get("volumes", []):
            if "name" in vol:
                volume_entry = {
                    "source": f"{runtime_project}_{vol['name']}",
                    "target": vol["target"],
                }
                if vol.get("read_only"):
                    volume_entry["read_only"] = True
                resolved_volumes.append(volume_entry)
            elif "host_path" in vol:
                resolved_volumes.append(
                    {
                        "source": _resolve(vol["host_path"], ctx),
                        "target": vol["target"],
                        "read_only": True,
                    }
                )
        if resolved_volumes:
            entry["volumes"] = resolved_volumes

        container_networks = cdef.get("networks", [])
        if container_networks and scenario_networks:
            primary = container_networks[0]
            entry["network"] = {
                "name": f"{runtime_project}_{primary}",
                "aliases": cdef.get("network_aliases", [hostname]),
            }
            if len(container_networks) > 1:
                entry["additional_networks"] = [
                    {"name": f"{runtime_project}_{net}", "aliases": [hostname]}
                    for net in container_networks[1:]
                ]
        else:
            entry["network"] = {
                "name": f"{runtime_project}_labnet",
                "aliases": cdef.get("network_aliases", [hostname]),
            }

        if cdef.get("depends_on"):
            entry["depends_on"] = cdef["depends_on"]

        if cdef.get("healthcheck"):
            hc = cdef["healthcheck"]
            entry["healthcheck"] = {
                "command": hc["command"],
                "interval": hc.get("interval", "10s"),
                "timeout": hc.get("timeout", "5s"),
                "retries": hc.get("retries", 6),
                "start_period": hc.get("start_period", "10s"),
            }

        if cdef.get("security"):
            entry["security"] = cdef["security"]

        if cdef.get("user"):
            entry["user"] = cdef["user"]

        if cdef.get("read_only"):
            entry["read_only"] = cdef["read_only"]

        if res:
            entry["resources"] = res

        entry["labels"] = labels

        manifest["containers"].append(entry)

    # Generate the standard workstation from lab-specific overrides.
    ws_cfg = scenario.get("workstation", {})
    ws_shared_vols = ws_cfg.get("shared_volumes", [])

    ws_standard_vols = [
        ("workstation_home", "/home/student"),
        ("command_logs", "/var/log/thesis-labs/commands"),
    ]

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

    # Workstation goes on the first (external) network if scenario defines custom
    # networks, otherwise the default labnet.
    ws_primary_network = (
        f"{runtime_project}_{scenario_networks[0]['name']}"
        if scenario_networks
        else f"{runtime_project}_labnet"
    )

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
            "name": ws_primary_network,
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
