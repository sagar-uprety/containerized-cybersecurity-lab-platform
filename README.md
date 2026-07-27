# Thesis Lab Platform

VM-hosted, container-first cybersecurity lab platform. Two RHEL 9.6 VMs: x02
(management plane) and x01 (lab worker).


## Nodes

| VM  | Hostname                | Role                                                              |
| --- | ----------------------- | ----------------------------------------------------------------- |
| x01 | `x01lp1.ucc.cit.tum.de` | Podman runtime, student lab containers, per-student networks      |
| x02 | `x02lp1.ucc.cit.tum.de` | FastAPI portal, Nginx reverse proxy, MkDocs, Ansible control node |

## Repository Areas

| Path               | Purpose                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `infra/`           | Ansible inventory, playbooks, roles for provisioning both VMs                                                         |
| `labs/`            | Lab scenarios: `scenario.yaml`, Dockerfiles, optional lab-specific files at the lab root, MkDocs guides under `docs/` |
| `platform-images/` | Shared images: `workstation-base` (student attack box), `lab-service-base` (generic env-driven service entrypoint)    |
| `controller/`      | `labctl` CLI, `labctl_core` lifecycle package, SSH wrapper, FastAPI portal                                            |
| `docs/`            | MkDocs student-facing lab guides                                                                                      |
| `tests/`           | Playwright E2E tests (portal UI + universal lab verifier)                                                             |
| `tools/`           | Pre-commit validators                                                                                                 |
| `resources/`       | Research traceability for scenario selection                                                                          |

## Create a Lab

Create a runnable, contract-compliant copy of the generic sample:

```bash
python3 tools/create_lab.py <lab-id> \
  --title "<Human-Readable Lab Title>" \
  --difficulty beginner
```

Start with [`labs/sample-lab/`](labs/sample-lab/) and follow the complete
instructor guide at `docs/instructor/new-lab-setup/` or the deployed protected
URL `/docs/instructor/new-lab-setup/`.

## labctl layout

`controller/labctl` is a thin wrapper. Reusable logic in `labctl_core/`:

| Module         | Purpose                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `cli.py`       | Argument validation and verb dispatch                                           |
| `config.py`    | Runtime path discovery                                                          |
| `scenario.py`  | Scenario loading, injected lab credentials, port derivation, checker conditions |
| `podman.py`    | Safe argv-based Podman operations                                               |
| `lifecycle.py` | Start, stop, reset, destroy, status, check                                      |

Checker logic is declarative in `scenario.yaml`. Students never run `labctl`,
Podman, or Ansible directly — portal actions on x02 call restricted lifecycle
commands on x01 through the `labadmin` SSH wrapper.

## Ansible

Run from repo root so `config/ansible.cfg` resolves inventory and roles:

```bash
ansible-playbook playbooks/site.yml --check --diff
ansible-playbook playbooks/lab-worker.yml --check --diff
ansible-playbook playbooks/management.yml --check --diff
ansible-playbook playbooks/verify-platform.yml
ansible-playbook playbooks/lab-worker.yml --tags lab-source,lab-images
ansible-playbook playbooks/management.yml --tags portal,nginx
```

Roles: `common` (RHEL baseline), `podman` (active runtime), `lab-runtime` (lab
source, image build, `labctl`), `management-services` (portal, MkDocs, Nginx,
controller SSH key). Portal and reverse proxy changes belong in
`management-services` — use handlers, never `systemctl restart`.

## Testing

Playwright E2E tests:

| Suite     | File                          | Purpose                                                                              |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| Portal UI | `tests/portal-ui.e2e.spec.js` | Page rendering, CSRF, lab links, terminal iframe/WebSocket, checker, instructor view |

```bash
npm install
npx playwright install

# Live (requires VPN):
PORTAL_BASE_URL=http://<x02-ip> \
  PORTAL_USER=student01 \
  PORTAL_PASSWORD=<password> \
  npm run test:portal
```

## Local Checks

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r config/requirements-dev.txt
.venv/bin/pre-commit install
.venv/bin/pre-commit run --all-files
```

Hooks are local/offline — they do not contact the thesis VMs.
