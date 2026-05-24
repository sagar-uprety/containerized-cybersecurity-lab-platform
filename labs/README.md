# Labs

Versioned lab scenarios live here.

The first scenario is `redis-exposed`, a browser-terminal-first Redis misconfiguration lab. Each scenario should include:

- `scenario.yaml`
- `podman.yml.tpl`
- `README.md`
- seed data
- checks
- optional app source directories such as `demo-app/`
- `files/` for mounted/student-facing lab files and image support files
- `student-guide.md` as a pointer to the canonical MkDocs page, plus `instructor-guide.md` and `solution-notes.md`

Every `scenario.yaml` must satisfy the shared scenario schema before `labctl` renders templates or starts a lab.
Each scenario owns its image build metadata under `build.images` and its checker runtime under `checker.image_service`; the reusable platform core should not need new Redis-style hardcoding for each lab.

Use `TEMPLATE.md` as the package layout contract for every new lab.
