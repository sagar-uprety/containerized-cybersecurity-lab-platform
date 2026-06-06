"""Run syntax checks for repository Ansible playbooks."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    inventory = repo_root / "infra" / "inventory.ini"
    playbooks = sorted((repo_root / "infra" / "playbooks").glob("*.yml"))

    if not inventory.exists():
        print(f"missing inventory: {inventory.relative_to(repo_root)}", file=sys.stderr)
        return 1

    ansible_cfg = repo_root / "config" / "ansible.cfg"
    ansible_env = dict(os.environ)
    if ansible_cfg.exists():
        ansible_env["ANSIBLE_CONFIG"] = str(ansible_cfg)

    failures = 0
    for playbook in playbooks:
        display_name = playbook.relative_to(repo_root)
        print(f"syntax-check {display_name}")
        result = subprocess.run(
            [
                "ansible-playbook",
                "-i",
                str(inventory),
                str(playbook),
                "--syntax-check",
            ],
            cwd=repo_root,
            env=ansible_env,
            check=False,
        )
        if result.returncode != 0:
            failures += 1

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
