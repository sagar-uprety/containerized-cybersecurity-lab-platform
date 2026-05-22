# Documentation Maintainer Notes

MkDocs is the canonical static teaching and reference layer. It publishes the stable student guides, instructor guides, solution notes, reflection prompts, and scenario background. The FastAPI portal is the live control layer for Start, Stop, Reset, End, Check, status, heartbeat, terminal access, and links into MkDocs.

For the first Redis lab, the learning content has these jobs:

- `SITREP.txt` and `REFLECTION.md` are copied into the workstation so the lab is usable even if the docs site is unavailable.
- `hints/*.txt` are short progressive hints shown in the portal and available in the lab package.
- `docs/labs/redis-exposed.md` is the canonical MkDocs student guide.
- `student-guide.md`, `instructor-guide.md`, and `solution-notes.md` remain in the lab package for portable source artifacts and instructor review.
