# Thesis Lab Platform

This repository contains the implementation artifacts for a VM-hosted, container-first cybersecurity lab platform for the thesis project.

## Architecture

Please see [**`architecture.md`**](architecture.md) for a high-level overview of the components, network flow, and the platform lifecycle. 


## Repository Areas

| Path | Purpose |
|---|---|
| `infra/` | Ansible inventory, playbooks, roles, and teardown logic for provisioning the Management and Worker VMs. |
| `labs/` | Versioned lab scenarios (`scenario.yaml`), Podman runtime templates, lab files, checks (`check.py`), and demo applications. |
| `controller/` | The internal `labctl` Python CLI, SSH security wrapper, and the FastAPI student/instructor portal. |
| `docs/` | Static MkDocs content containing the canonical student guides, instructor notes, and platform documentation. |
| `tests/` | Playwright E2E tests, including the Universal Lab Verifier. |

## Quick Start (Testing)

The platform includes a universal end-to-end verifier that reads MkDocs guides and automatically completes labs in the browser using Playwright.

```bash
# Run portal UI tests
npm run test:portal

# Run the full universal lab solver
npm run test:labs
```

To run against a live environment, export the required credentials (e.g., `PORTAL_BASE_URL`, `PORTAL_USER`, `PORTAL_PASSWORD`) beforehand.
