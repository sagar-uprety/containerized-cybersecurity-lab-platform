# Labs

Versioned lab scenarios live here.

The first scenario is `redis-exposed`, a browser-terminal-first Redis misconfiguration lab. Each scenario should include:

- `scenario.yaml`
- `compose.yml.tpl`
- `README.md`
- seed data
- checks
- optional app source directories such as `demo-app/`
- `files/` for mounted/student-facing lab files and image support files
- hints and reflection artifacts
- student guide, instructor guide, and solution notes when the documentation release starts

Every `scenario.yaml` must satisfy the shared scenario schema before `labctl` renders templates or starts a lab.

Use `TEMPLATE.md` as the package layout contract for every new lab.
