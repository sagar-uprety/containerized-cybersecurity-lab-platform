"""Local checksum-based build gate for Ansible `delegate_to: localhost` steps.

Mirrors the checksum-gate pattern already used by
infra/roles/lab-runtime/templates/thesis-build-lab-images.py.j2 for remote
image builds, but runs locally for expensive local build steps (the portal
SPA build, the demo-dataset generator) whose inputs live in this repo
checkout rather than on the target VM.

Usage:
    python3 tools/build_gate.py check  --stamp <file> <path> [<path> ...]
    python3 tools/build_gate.py update --stamp <file> <path> [<path> ...]

`check` exits 0 if the combined checksum of every file under the given
paths differs from what's recorded in the stamp file (i.e. a rebuild is
needed), or 1 if unchanged. `update` records the current checksum; call it
only after the guarded step succeeds.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


def iter_files(path: Path):
    if path.is_file():
        yield path
    elif path.is_dir():
        for child in sorted(path.rglob("*")):
            if child.is_file():
                yield child


def compute_checksum(paths: list[Path]) -> str:
    hasher = hashlib.sha256()
    for path in paths:
        for file_path in iter_files(path):
            hasher.update(str(file_path).encode())
            hasher.update(file_path.read_bytes())
    return hasher.hexdigest()


def cmd_check(args: argparse.Namespace) -> None:
    stamp = Path(args.stamp)
    paths = [Path(p) for p in args.paths]
    current = compute_checksum(paths)
    stored = stamp.read_text().strip() if stamp.exists() else None
    if current != stored:
        print("changed")
        sys.exit(0)
    print("unchanged")
    sys.exit(1)


def cmd_update(args: argparse.Namespace) -> None:
    stamp = Path(args.stamp)
    paths = [Path(p) for p in args.paths]
    stamp.parent.mkdir(parents=True, exist_ok=True)
    stamp.write_text(compute_checksum(paths))


def main() -> None:
    parser = argparse.ArgumentParser(description="Local checksum-based build gate")
    parser.add_argument("--stamp", required=True, help="path to the stamp file")
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser(
        "check", help="exit 0 if inputs changed since last update, 1 if unchanged"
    )
    check.add_argument("paths", nargs="+")
    check.set_defaults(func=cmd_check)

    update = sub.add_parser("update", help="record current checksum of the given inputs")
    update.add_argument("paths", nargs="+")
    update.set_defaults(func=cmd_update)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
