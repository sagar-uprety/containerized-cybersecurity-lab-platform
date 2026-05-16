# Infrastructure

directory so `ansible.cfg` can resolve the inventory and role path.

The active host baseline is RHEL 9.6 for both x01 and x02.

Main commands:

```bash
python3 -m venv ../.venv
../.venv/bin/python -m pip install -r requirements.txt
ANSIBLE_HOME=/private/tmp/thesis-ansible-home ../.venv/bin/ansible-playbook --syntax-check playbooks/site.yml
ansible-playbook playbooks/site.yml --check --diff
ansible-playbook playbooks/lab-worker.yml --check --diff
ansible-playbook playbooks/management.yml --check --diff
ansible-playbook playbooks/verify-platform.yml
```

The common role does not change root login or password-authentication policy by
default. Set `thesis_manage_ssh_hardening: true` only after a non-root admin
path has been verified, then choose the exact values through
`thesis_ssh_password_authentication` and `thesis_ssh_permit_root_login`.

Current contents:

- `inventory.ini`
- `group_vars/`
- `playbooks/`
- `roles/common/`
- `roles/docker/`
- `roles/lab-runtime/`
- `roles/management-services/`

All VM setup must be represented here or in generated artifacts controlled by these playbooks. Manual host fixes should be converted into Ansible tasks before a task is marked done.

The local development environment used to create this skeleton did not have
`ansible-playbook` installed, so live Ansible parsing and VM execution still
