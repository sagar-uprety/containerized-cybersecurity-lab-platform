"""Host-level system status for the admin usage dashboard (`labctl system-status`).

Read-only: no lab/student identifiers, no destructive capability. Uses /proc
(stdlib only, no psutil) and the running-container list from podman.py, filtered
by the standard thesis.* container labels every lab container carries.
"""

import os
import shutil
import time
from pathlib import Path

from labctl_core.podman import running_containers


def _read_proc_stat_totals() -> tuple[int, int]:
    with Path("/proc/stat").open(encoding="utf-8") as handle:
        line = handle.readline()
    values = [int(v) for v in line.split()[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0)  # idle + iowait
    return idle, sum(values)


def cpu_percent(sample_seconds: float = 0.2) -> float:
    idle1, total1 = _read_proc_stat_totals()
    time.sleep(sample_seconds)
    idle2, total2 = _read_proc_stat_totals()
    total_delta = total2 - total1
    if total_delta <= 0:
        return 0.0
    return round((1 - (idle2 - idle1) / total_delta) * 100, 1)


def memory_status() -> dict:
    values = {}
    with Path("/proc/meminfo").open(encoding="utf-8") as handle:
        for line in handle:
            key, _, rest = line.partition(":")
            fields = rest.strip().split()
            if fields:
                values[key] = int(fields[0])  # kB
    total_kb = values.get("MemTotal", 0)
    available_kb = values.get("MemAvailable", values.get("MemFree", 0))
    used_kb = max(total_kb - available_kb, 0)
    return {
        "memory_total_mb": round(total_kb / 1024),
        "memory_used_mb": round(used_kb / 1024),
        "memory_percent": round((used_kb / total_kb) * 100, 1) if total_kb else 0.0,
    }


def running_lab_instances() -> int:
    """Count distinct (lab, student) running instances via thesis.lab/thesis.student labels."""
    instances = set()
    for container in running_containers():
        labels = container.get("Labels") or {}
        lab = labels.get("thesis.lab")
        student = labels.get("thesis.student")
        if lab and student:
            instances.add((lab, student))
    return len(instances)


#: Paths worth reporting separately, when they exist on this host. Lab images
#: and container layers dominate growth on the worker; the portal's SQLite,
#: backups and evidence exports dominate on the management host.
_DISK_PATHS = (
    ("root", "/"),
    ("containers", "/var/lib/containers"),
    ("state", "/var/lib/thesis-labs"),
)


def disk_status() -> list[dict]:
    """Disk usage per interesting path, one entry per distinct filesystem.

    Several of the paths usually live on the same filesystem, which would
    otherwise be reported as separate capacity that does not exist. Entries are
    keyed by device id so a shared filesystem is listed once, carrying every
    label that resolved to it.
    """
    by_device: dict[int, dict] = {}
    for label, path in _DISK_PATHS:
        try:
            device = Path(path).stat().st_dev
            usage = shutil.disk_usage(path)
        except OSError:
            # Path absent on this host, or not readable. Skip rather than
            # inventing a zero row that would read as a full disk.
            continue
        existing = by_device.get(device)
        if existing is not None:
            existing["labels"].append(label)
            continue
        by_device[device] = {
            "labels": [label],
            "path": path,
            "total_gb": round(usage.total / 1024**3, 1),
            "used_gb": round((usage.total - usage.free) / 1024**3, 1),
            "free_gb": round(usage.free / 1024**3, 1),
            "percent": round(((usage.total - usage.free) / usage.total) * 100, 1)
            if usage.total
            else 0.0,
        }
    return list(by_device.values())


def system_status() -> dict:
    return {
        "running_labs": running_lab_instances(),
        "cpu_percent": cpu_percent(),
        # cpu_percent is averaged across every core, so on a large host a
        # single busy lab barely registers. Report the core count so the
        # dashboard can say what the percentage is a percentage of.
        "cores": os.cpu_count(),
        **memory_status(),
        "disks": disk_status(),
    }
