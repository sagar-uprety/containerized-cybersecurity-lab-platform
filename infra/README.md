# Infrastructure

directory so `ansible.cfg` can resolve the inventory and role path.

The active host baseline is RHEL 9.6 for both x01 and x02.

### Nodes

-   `x02lp1.ucc.cit.tum.de` (Control Plane): runs the FastAPI portal, Nginx reverse proxy, and MkDocs.
-   `x01lp1.ucc.cit.tum.de` (Lab Worker): runs Podman and executes student workloads.

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

-   `inventory.ini`: x01/x02 inventory groups and connection defaults.
-   `group_vars/` and `host_vars/`: shared platform variables and local host overrides.
-   `playbooks/`: provisioning, verification, and teardown playbooks.
-   `roles/common/`: RHEL baseline packages, directories, time sync, and log rotation.
-   `roles/podman/`: active Podman/Buildah/Skopeo runtime setup.
-   `roles/docker/`: inactive; reserved for a future dedicated Docker worker.
-   `roles/lab-runtime/`: lab source, image build/cache, `labctl`, registries, and worker services.
-   `roles/management-services/`: FastAPI portal, MkDocs, Nginx, and controller SSH key setup.

All VM setup must be represented here or in generated artifacts controlled by these playbooks. Manual host fixes should be converted into Ansible tasks before a task is marked done.

Portal and reverse proxy changes belong in the `management-services` role.
Template or code changes should notify handlers for `thesis-portal` or `nginx`;
do not verify fixes by manually running `systemctl restart` on x02.

The active runtime role is Podman for both current VMs. Docker is intentionally
not part of the active x01/x02 provisioning path because the available RHEL 9.6
`ppc64le` worker does not provide the planned Docker CE package path.
