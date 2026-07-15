"""Catch YAML block-scalar indentation bugs in scenario.yaml checker scripts.

A `checker.checks[].run` field using a folded (`>`) block scalar silently
keeps literal newlines wherever a continuation line is indented deeper than
the scalar's base content line (YAML's "more-indented lines are not
folded" rule). That can split one shell command across two lines with no
`;`/`&&`/`||` between them, so it silently runs as two commands instead of
one - shellcheck's SC1035/SC2154-style "command not found" symptoms don't
show here because the second fragment is just a nonexistent command name,
which shellcheck itself won't flag from a `-o all` parse the way a human
reading the folded string does. So this hook parses the YAML exactly like
labctl does (`yaml.safe_load`), then re-parses each resulting `run` string
with the shell parser (`bash -n` via a heredoc) is not enough either, since
`bash -n` happily accepts two back-to-back simple commands. Instead this
hook flags any embedded newline in a parsed `run` string that is NOT
immediately preceded by a shell statement terminator (`;`, `&&`, `||`,
`|`, `then`, `else`, `do`, `{`) - the exact signature of a command split
mid-argument-list by an unintended literal newline.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

# A newline is safe if the text immediately before it (ignoring trailing
# whitespace) ends with one of these - all valid statement boundaries in
# POSIX shell. Anything else means the newline landed mid-command.
SAFE_BEFORE_NEWLINE = re.compile(r"(;|&&|\|\||\||\bthen\b|\belse\b|\bdo\b|\{)\s*$")


def find_unsafe_newlines(run: str) -> list[int]:
    """Return 1-based line numbers (within `run`) where a newline splits
    what should be one shell command into two, based on what precedes it."""
    unsafe_lines: list[int] = []
    lines = run.rstrip("\n").split("\n")
    for i in range(len(lines) - 1):
        prefix = lines[i]
        if not SAFE_BEFORE_NEWLINE.search(prefix):
            unsafe_lines.append(i + 1)
    return unsafe_lines


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    labs_dir = repo_root / "labs"
    errors: list[str] = []

    for scenario_path in sorted(labs_dir.glob("*/scenario.yaml")):
        with scenario_path.open(encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
        checks = ((data.get("checker") or {}).get("checks")) or []
        for check in checks:
            run = check.get("run")
            if not isinstance(run, str):
                continue
            unsafe = find_unsafe_newlines(run)
            if unsafe:
                rel = scenario_path.relative_to(repo_root)
                name = check.get("name", "<unnamed check>")
                lines_desc = ", ".join(str(n) for n in unsafe)
                errors.append(
                    f"{rel}: check '{name}' has a mid-command newline "
                    f"(run-string line(s) {lines_desc}) - a YAML '>' folded "
                    "scalar continuation line is probably indented deeper "
                    "than the block's base content, so YAML preserved a "
                    "literal newline where a space was intended. Dedent the "
                    "offending line(s) to the base indentation, or switch to "
                    "a literal '|' scalar if line breaks are genuinely "
                    "wanted."
                )

    if errors:
        print(
            "scenario.yaml checker 'run' scripts with a likely YAML folding bug:\n",
            file=sys.stderr,
        )
        for e in errors:
            print(f"  {e}\n", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
