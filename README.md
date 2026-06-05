# Thesis Lab Platform

This repository contains the implementation artifacts for a VM-hosted, container-first cybersecurity lab platform for the thesis project.

## Architecture

Please see [**`platform-docs/architecture.md`**](platform-docs/architecture.md) for a high-level overview of the components, network flow, and the platform lifecycle.


Recommended reading path for new maintainers:

1. [`platform-docs/architecture.md`](platform-docs/architecture.md) for the VM split, traffic flow, lifecycle, and security boundaries.
2. [`platform-docs/runtime-paths.md`](platform-docs/runtime-paths.md) for repository versus generated runtime state.
3. [`infra/README.md`](infra/README.md) for provisioning and verification entry points.
4. [`controller/README.md`](controller/README.md) for `labctl`, the portal, and controller verification.
5. [`labs/README.md`](labs/README.md) and [`labs/TEMPLATE.md`](labs/TEMPLATE.md) for scenario authoring conventions.
6. [`tests/README.md`](tests/README.md) for local and live Playwright verification.

## Repository Areas

| Path             | Purpose                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/`         | Ansible inventory, playbooks, roles, and teardown logic for provisioning the Control Plane and Worker VMs.                                   |
| `labs/`          | Versioned lab scenarios (`scenario.yaml`), Podman runtime templates, lab files, checks (`check.py`), and demo applications.                  |
| `controller/`    | The internal `labctl` Python CLI, reusable `labctl_core` lifecycle package, SSH security wrapper, and the FastAPI student/instructor portal. |
| `docs/`          | Student-facing MkDocs content containing the canonical lab guides.                                                                           |
| `platform-docs/` | Internal platform notes such as runtime paths and maintainer guidance.                                                                       |
| `tests/`         | Playwright E2E tests, including the Universal Lab Verifier.                                                                                  |
| `tools/`         | Local validation helpers used by pre-commit hooks.                                                                                           |
| `resources/`     | Research traceability notes that support lab/scenario selection, not runtime platform code.                                                  |

## Quick Start (Testing)

The platform includes a universal end-to-end verifier that reads MkDocs guides and automatically completes labs in the browser using Playwright.

```bash
npm install
npx playwright install

# Run portal UI tests
npm run test:portal

# Run the full universal lab solver
npm run test:labs
```

`npm run test:labs` is a live/destructive verifier. To run against a live environment, export the required credentials first: `PORTAL_BASE_URL`, `PORTAL_USER`, and `PORTAL_PASSWORD`.

## Local Quality Checks

This repository uses `pre-commit` for lightweight local checks before commits. The hooks cover whitespace and merge-conflict checks, JSON/YAML/TOML parsing, private-key detection, Ruff Python lint/format, YAML style, ShellCheck shell-script analysis, scenario metadata validation, Ansible playbook syntax checks, and basic offline `ansible-lint` checks.

```bash
python -m pip install -r requirements-dev.txt
pre-commit install
pre-commit run --all-files
```

The Ansible hooks are local/offline and do not contact the thesis VMs.
