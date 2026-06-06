"""Run ansible-lint with ANSIBLE_CONFIG pointing to config/ansible.cfg."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    ansible_cfg = repo_root / "config" / "ansible.cfg"
    env = dict(os.environ)
    if ansible_cfg.exists():
        env["ANSIBLE_CONFIG"] = str(ansible_cfg)
    result = subprocess.run(
        [
            "ansible-lint",
            "--offline",
            "--profile=basic",
            "-c",
            "config/.ansible-lint",
            "--exclude",
            "config",
        ],
        cwd=repo_root,
        env=env,
        check=False,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
