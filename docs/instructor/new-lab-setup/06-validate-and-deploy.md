# Validate, Deploy, and Publish

_[← Write Documentation and Declare Risk](05-documentation.md) · [Guide overview](index.md)_

## Local Validation

Run from repository root. Prepare the local environment once if `.venv` does
not exist:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r config/requirements-dev.txt
.venv/bin/pre-commit install
```

Do not bypass hooks.

### Scaffold Contract

```bash
PYTHONPATH=. .venv/bin/python tests/test_create_lab.py
```

### Scenario, Checker, and Risk Contracts

```bash
PYTHONPATH=controller .venv/bin/python tools/pre_commit/validate_scenarios.py
.venv/bin/python tools/pre_commit/check_scenario_checker_shell.py
.venv/bin/python tools/pre_commit/validate_intentional_risks.py
```

### Python Syntax

Run for every Python file added to the lab:

```bash
python3 -m py_compile labs/<lab-id>/<script>.py
```

### Ansible Syntax

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/site.yml --syntax-check
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/management.yml --syntax-check
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/lab-worker.yml --syntax-check
```

### Full Repository Gate

```bash
.venv/bin/pre-commit run --all-files
```

### Strict MkDocs Build

```bash
.venv/bin/python -m mkdocs build --strict \
  --config-file config/mkdocs.yml
```

Do not bypass a failed hook. Fix root cause. The gate checks YAML/JSON syntax,
schema, docs sections/includes, anti-spoiler rules, checker shell folding,
intentional risks, Python style/security, shell scripts, Dockerfiles, Markdown,
Ansible syntax/lint, secrets, and repository hygiene.

## Deployment (You Run This)

New or changed lab source under `labs/` affects both VMs:

-   x01 needs scenario source and target images.
-   x02 needs scenario metadata and MkDocs source.

### Deploy x01 Lab Source and Images

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/lab-worker.yml --tags lab-source,lab-images
```

Use `--tags lab-source` only when Dockerfiles, image scripts, packages, and
image-copied configuration did not change. When uncertain, use both tags.

**An ordinary new lab needs only the command above.** Add `labctl` to the tag
list only if you also changed `controller/labctl_core/` itself (the Python
package that implements `labctl start/stop/reset/check`) — for example, a
platform-level runtime behavior change, not a scenario-level one:

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/lab-worker.yml --tags labctl,lab-source,lab-images
```

### Deploy x02 Metadata and Documentation

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/management.yml --tags docs
```

The docs tag discovers direct `labs/*/scenario.yaml` packages, copies scenario
source used by the portal, rebuilds MkDocs, and restarts the portal when scenario
source changes. **An ordinary new lab needs only the command above** — no
frontend build, no extra tags.

Only add `portal-api` and `nginx` if you also changed backend code outside
`labs/` — the schema at `labs/templates-contract/scenario.schema.json`, the
portal's Python routes, or the Nginx instructor-doc auth gate itself:

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/management.yml --tags portal-api,docs,nginx
```

### Verify Platform

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/verify-platform.yml
```

Never repair a VM manually. Convert every required change into Dockerfile,
setup file, scenario, Ansible, or documentation source and redeploy.

### No CI Pipeline Required

There is no GitHub Actions workflow, CI/CD pipeline, or workflow-dispatch step
in this repository. Every deploy and verification command in this guide is run
by you, from your workstation, over the UCC VPN. The Ansible playbooks and
`labctl` are the entire deployment surface; pre-commit is the local-only gate.

### Full Teardown

When you need a clean platform reset (end of semester, decommission, full
rebuild after a major platform change), run the teardown playbook:

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/teardown-platform.yml
```

This removes platform services, generated lab state, and host-level
configuration that Ansible provisioned. It does not touch the host OS itself.

There is no separate "monitoring" teardown because no monitoring stack exists
in the current prototype — Prometheus/Grafana/full agent monitoring were
stack is added later, its teardown tasks belong in the same playbook.

After teardown, reprovision both VMs from a clean snapshot, then re-run
`site.yml` to restore a working platform state.

## Publish Through the Instructor Portal

Once deployed, the lab appears in the instructor lab-assignment catalog because
the portal discovers `labs/*/scenario.yaml`. Students do not see it until an
instructor assigns it to an approved group.

There is no draft/enabled flag in `scenario.yaml`. Keep unfinished work on a
development branch and do not deploy it to the teaching environment. Before
release:

1. Create or choose a test group.
2. Assign the new lab without a production deadline.
3. Approve a test student membership.
4. Verify the test student sees only assigned labs.
5. Complete live verification below.
6. Remove test assignment or set intended teaching assignment/deadline.

---

_[← Write Documentation and Declare Risk](05-documentation.md) · [Guide overview](index.md) · [Next: Live Verification and Release Checklist →](07-verify-and-ship.md)_
