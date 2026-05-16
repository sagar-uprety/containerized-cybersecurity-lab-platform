# Lab Package Layout

Each lab should use the same top-level shape so `labctl`, documentation, and
agents can work consistently.

```text
<lab-id>/
  scenario.yaml
  compose.yml.tpl
  README.md
  checks/
    check.py
    README.md
  demo-app/
    Dockerfile
    app.py
    entrypoint.sh
  files/
    SITREP.txt
    REFLECTION.md
    *.Dockerfile
    *.sh
    service config examples
  hints/
    hint-1.txt
    hint-2.txt
    hint-3.txt
  seed/
    seed data and generated config templates
```

Use `files/` for lab files that are mounted into containers, copied into
images, or exposed to the student as scenario artifacts. Use dedicated
top-level directories such as `demo-app/` and `checks/` for executable
components with their own source code or tests.
