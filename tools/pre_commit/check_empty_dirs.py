"""Reject empty directories across the repository."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    errors: list[str] = []

    for path in sorted(repo_root.rglob("*")):
        if path.is_dir() and not any(path.iterdir()):
            relative = path.relative_to(repo_root)
            if any(
                part.startswith(".")
                or part in ("node_modules", "site", "test-results", "__pycache__", ".venv")
                for part in relative.parts
            ) or relative.parts[:1] == ("state",):
                continue
            errors.append(str(relative))

    if errors:
        print("empty directories detected:", file=sys.stderr)
        for e in errors:
            print(f"  {e}/", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
