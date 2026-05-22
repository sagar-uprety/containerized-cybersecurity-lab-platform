# Infrastructure

directory so `ansible.cfg` can resolve the inventory and role path.

The active host baseline is RHEL 9.6 for both x01 and x02.

### Nodes
* **`x02` (Control Plane)**: The node that runs the FastAPI portal and MkDocs.
* **`x01` (Lab Worker)**: The node that runs Podman and executes the student workloads.

Main commands:

```bash
python3 -m venv ../.venv
../.venv/bin/python -m pip install -r requirements.txt
../.venv/bin/ansible-playbook --syntax-check playbooks/site.yml
ansible-playbook playbooks/site.yml --check --diff
ansible-playbook playbooks/lab-worker.yml --check --diff
ansible-playbook playbooks/management.yml --check --diff
ansible-playbook playbooks/verify-platform.yml
```

The common role does not change root login or password-authentication policy.
Provisioning keeps the current SSH path intact; any future SSH policy change
must be added explicitly and only after a user-confirmed access model exists.

Current contents:

- `inventory.ini`
- `group_vars/`
- `playbooks/`
- `roles/common/`
- `roles/podman/`
- `roles/docker/` (inactive; reserved for a future dedicated Docker worker)
- `roles/lab-runtime/`
- `roles/management-services/`

All VM setup must be represented here or in generated artifacts controlled by these playbooks. Manual host fixes should be converted into Ansible tasks before a task is marked done.

Portal and reverse proxy changes belong in the `management-services` role.
Template or code changes should notify handlers for `thesis-portal` or `nginx`;
do not verify fixes by manually running `systemctl restart` on x02.

The active runtime role is Podman for both current VMs. Docker is intentionally
not part of the active x01/x02 provisioning path because the available RHEL 9.6
`ppc64le` worker does not provide the planned Docker CE package path.
