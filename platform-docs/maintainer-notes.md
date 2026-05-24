# Documentation Maintainer Notes

MkDocs is the canonical static student guide layer. It publishes only stable
student-facing guides. The FastAPI portal is the live control layer for Start,
Stop, Reset, End, Check, status, heartbeat, terminal access, and links into
MkDocs.

For the first Redis lab, the learning content has these jobs:

- `SITREP.txt` is copied into the workstation so the lab is usable even if the docs site is unavailable.
- `docs/labs/redis-exposed.md` is the canonical MkDocs student guide.
- `labs/redis-exposed/student-guide.md` is only a pointer artifact, not a duplicate walkthrough.
- `instructor-guide.md` and `solution-notes.md` remain in the lab package for instructor review and should not be published in the student MkDocs site.
