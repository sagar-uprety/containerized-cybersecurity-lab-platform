# Lab Package Layout

Each lab should use the same top-level shape so `labctl`, documentation, and
agents can work consistently.

```text
<lab-id>/
  scenario.yaml
  podman.yml.tpl
  README.md
  student-guide.md          # pointer to the canonical MkDocs page
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
    *.Dockerfile
    *.sh
    service config examples
  seed/
    seed data and generated config templates
```

Use `files/` for lab files that are mounted into containers, copied into
images, or exposed to the student as scenario artifacts. Use dedicated
top-level directories such as `demo-app/` and `checks/` for executable
components with their own source code or tests.

## Student Guide Contract

MkDocs is the canonical student workflow. Every lab should publish one MkDocs
page that walks students through orient, discover, demonstrate impact,
remediate, verify, and reflect. The portal links to that page instead of
duplicating the workflow beside the terminal. The lab package's
`student-guide.md` should be a short pointer to the MkDocs page, not a second
copy of the same walkthrough.

Required scenario documentation shape:

```yaml
documentation:
  student_guide_url: /docs/labs/<lab-id>/
```

Use `labs/STUDENT_GUIDE_TEMPLATE.md` as the student-guide skeleton for new MkDocs lab
pages.

Hints remain progressive help, not the primary instructions.

## Runtime Build Contract

Every lab must declare its image build inputs in `scenario.yaml`. The Ansible
lab-runtime role reads this metadata and builds the images before students start
labs, so future scenarios do not require editing Redis-specific Ansible
variables.

```yaml
build:
  images:
    - service: workstation
      name: thesis-labs/<lab-id>-workstation:latest
      context: .
      dockerfile: files/workstation.Dockerfile
```

The checker must declare the script to run and the service image that provides
the checker runtime dependencies:

```yaml
checker:
  command: checks/check.py
  image_service: demo-app
```
