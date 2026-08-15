"""Reject em dashes (U+2014) in tracked text files.

from generated prose more than once, so this is enforced rather than swept
by hand each time.
"""

from __future__ import annotations

import sys
from pathlib import Path

EM_DASH = "—"


def main(argv: list[str]) -> int:
    failures: list[str] = []
    for name in argv:
        path = Path(name)
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if EM_DASH in line:
                failures.append(f"{name}:{lineno}: em dash (U+2014) - use a hyphen instead")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        print(f"\n{len(failures)} em dash occurrence(s) found. Replace with '-'.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
