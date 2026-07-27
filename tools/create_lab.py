#!/usr/bin/env python3
"""Create a new runnable lab package by cloning labs/sample-lab."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

LAB_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
SAMPLE_ID = "sample-lab"
SAMPLE_TITLE = "Sample Lab: Access Control Misconfiguration"
TEXT_SUFFIXES = {".json", ".md", ".py", ".sh", ".txt", ".yaml", ".yml"}


def create_lab(repo_root: Path, lab_id: str, title: str, difficulty: str) -> list[Path]:
    if not LAB_ID_RE.fullmatch(lab_id) or lab_id == SAMPLE_ID:
        raise ValueError("lab_id must match ^[a-z0-9][a-z0-9-]{0,63}$ and cannot be sample-lab")
    if not title.strip() or "\n" in title or "\r" in title:
        raise ValueError("title must be one non-empty line")
    if difficulty not in {"beginner", "intermediate", "advanced"}:
        raise ValueError("difficulty must be beginner, intermediate, or advanced")

    source = repo_root / "labs" / SAMPLE_ID
    target = repo_root / "labs" / lab_id
    stub_paths = [
        repo_root / "docs" / "labs" / f"{lab_id}.md",
        repo_root / "docs" / "labs" / f"{lab_id}-solution.md",
        repo_root / "docs" / "labs" / f"{lab_id}-instructor.md",
    ]
    if not (source / "scenario.yaml").is_file():
        raise FileNotFoundError(f"sample lab is missing: {source}")
    conflicts = [path for path in [target, *stub_paths] if path.exists()]
    if conflicts:
        joined = ", ".join(str(path.relative_to(repo_root)) for path in conflicts)
        raise FileExistsError(f"refusing to overwrite existing paths: {joined}")

    created_stubs: list[Path] = []
    try:
        shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        (target / "docs" / "AUTHORING.md").unlink(missing_ok=True)
        for path in target.rglob("*"):
            if not path.is_file() or (
                path.suffix not in TEXT_SUFFIXES and path.name != "Dockerfile"
            ):
                continue
            content = path.read_text(encoding="utf-8")
            content = content.replace(SAMPLE_ID, lab_id).replace(SAMPLE_TITLE, title.strip())
            path.write_text(content, encoding="utf-8")

        scenario_path = target / "scenario.yaml"
        scenario = scenario_path.read_text(encoding="utf-8")
        scenario = re.sub(
            r"^title:.*$",
            f"title: {json.dumps(title.strip(), ensure_ascii=True)}",
            scenario,
            count=1,
            flags=re.MULTILINE,
        )
        scenario = re.sub(
            r"^difficulty:\s*(beginner|intermediate|advanced)\s*$",
            f"difficulty: {difficulty}",
            scenario,
            count=1,
            flags=re.MULTILINE,
        )
        scenario_path.write_text(scenario, encoding="utf-8")

        include_sources = (
            f"labs/{lab_id}/docs/student-guide.md",
            f"labs/{lab_id}/docs/solution-notes.md",
            f"labs/{lab_id}/docs/instructor-guide.md",
        )
        for stub_path, include_source in zip(stub_paths, include_sources):
            stub_path.write_text(f'--8<-- "{include_source}"\n', encoding="utf-8")
            created_stubs.append(stub_path)
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        for stub_path in created_stubs:
            stub_path.unlink(missing_ok=True)
        raise

    return [target, *stub_paths]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Clone the runnable sample lab and create its MkDocs include pages."
    )
    parser.add_argument("lab_id", help="lowercase slug, for example ftp-anonymous-access")
    parser.add_argument("--title", required=True, help="portal and instructor-facing lab title")
    parser.add_argument(
        "--difficulty",
        choices=("beginner", "intermediate", "advanced"),
        default="beginner",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    try:
        paths = create_lab(repo_root, args.lab_id, args.title, args.difficulty)
    except (FileExistsError, FileNotFoundError, ValueError) as exc:
        parser.error(str(exc))

    print("Created lab authoring scaffold:")
    for path in paths:
        print(f"  {path.relative_to(repo_root)}")
    print("Next: replace sample behavior, complete all docs, then run pre-commit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
