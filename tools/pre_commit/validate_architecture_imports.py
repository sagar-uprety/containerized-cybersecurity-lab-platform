"""Validate cross-directory Python import boundaries.

This catches code that places logic in the wrong layer or wires lab code directly
into platform code.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path
from typing import Optional

Rule = tuple[str, tuple[str, ...], str]

RULES: tuple[Rule, ...] = (
    (
        "labs/",
        ("app", "controller", "labctl_core"),
        "lab scenarios must stay self-contained and not import platform/controller code",
    ),
    (
        "tools/",
        ("app", "controller", "labctl_core", "labs"),
        "repository tooling must not depend on application or lab runtime code",
    ),
    (
        "controller/labctl_core/",
        ("app", "fastapi"),
        "labctl_core must remain CLI/runtime logic and not import the portal web layer",
    ),
    (
        "controller/lab-controller-api/app/",
        ("labs", "labctl_core"),
        "portal code must call the restricted SSH/labadmin path, not local lab/labctl modules",
    ),
)


def _import_roots(path: Path) -> list[tuple[int, str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    roots: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.extend((node.lineno, alias.name.split(".", 1)[0]) for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.append((node.lineno, node.module.split(".", 1)[0]))
    return roots


def _matching_rule(relative_path: str) -> Optional[Rule]:
    for rule in RULES:
        prefix, _, _ = rule
        if relative_path.startswith(prefix):
            return rule
    return None


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    errors: list[str] = []

    for path in sorted(repo_root.glob("**/*.py")):
        relative = path.relative_to(repo_root).as_posix()
        if relative.startswith((".venv/", "node_modules/", "site/")):
            continue

        rule = _matching_rule(relative)
        if not rule:
            continue

        _, forbidden_roots, reason = rule
        try:
            imports = _import_roots(path)
        except SyntaxError as exc:
            errors.append(f"{relative}: failed to parse imports: {exc}")
            continue

        for line_number, root in imports:
            if root in forbidden_roots:
                errors.append(f"{relative}:{line_number}: forbidden import {root!r}: {reason}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
