# Lab Package Layout

Each lab should use the same top-level shape so `labctl`, documentation, and
agents can work consistently.

```text
<lab-id>/
  scenario.yaml
  podman.yml.tpl
  README.md
  student-guide.md
  instructor-guide.md
  solution-notes.md
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

## Student Guide Contract

MkDocs is the canonical student workflow. Every lab should publish a MkDocs page
that walks students through orient, discover, demonstrate impact, remediate,
verify, and reflect. The portal links to that page instead of duplicating the
workflow beside the terminal.

Required scenario documentation shape:

```yaml
documentation:
  student_guide_url: /docs/labs/<lab-id>/
```

Hints remain progressive help, not the primary instructions.
