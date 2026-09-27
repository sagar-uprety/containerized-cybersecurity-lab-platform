# Deploying the Platform

This guide takes a fresh copy of this repository to a running platform: two provisioned
hosts, a working portal, an administrator account, instructors, and students running
labs. All steps run from one machine, the Ansible control machine, usually your laptop.

## 1. What Gets Deployed

The platform uses two hosts, identified by their Ansible inventory group:

| Inventory group | Role                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------- |
| `management`    | Nginx, the React portal, FastAPI, SQLite, MkDocs guides, and the controller SSH key           |
| `lab_workers`   | Podman, Buildah, lab images, `labctl`, and the restricted SSH gateway for lab lifecycle calls |

Host names are free labels. The playbooks locate hosts only by group, so name the
machines whatever you like in the inventory. Only the first host of each group is used.

Nothing runs permanently on the control machine. It builds the React bundle, copies the
code, and drives Ansible over SSH.

## 2. Requirements

### Hosts

-   Two RHEL 9 hosts (tested on RHEL 9.6).
-   Architecture `ppc64le` by default. For other architectures, such as `x86_64`, add the
    architecture to `podman_supported_architectures` in `infra/group_vars/all.yml`. The
    base images (`debian:bookworm-slim`, `python:3.12-slim`) are multi-architecture.
-   Enabled RHEL repositories that provide `podman`, `buildah`, `skopeo`, `nginx`, and the
    Python packages in `thesis_base_packages`.
-   Outbound Internet access during provisioning: `dnf`, `pip` (PyPI), and container
    registries (Docker Hub) for the base images.
-   Root SSH login from the control machine, by key (recommended) or by password.

### Network

| From                    | To              | Ports                                                             |
| ----------------------- | --------------- | ----------------------------------------------------------------- |
| Control machine         | Both hosts      | 22                                                                |
| Users (browser)         | Management host | 80, and 443 once a certificate exists                             |
| Users (SSH fallback)    | Management host | Each lab's `ssh_port_base` plus student number, for example 22001 |
| Management host         | Worker          | 22, and the per-student lab port ranges                           |
| Internet (optional TLS) | Management host | 80, for the Let's Encrypt HTTP-01 challenge                       |

The worker admits new connections to the per-student port ranges only from the
management host (nftables table `thesis_lab_guard`), so students never reach the worker
directly. Open the ports above in any network or cloud firewall in front of the hosts.
SELinux can stay enforcing.

The labs are intentionally vulnerable. Keep both hosts on a private network or behind a
VPN, and do not expose the portal to the public Internet without a further security
review.

### Control machine

-   Python 3.9 or newer
-   Node.js 20 or newer with npm (the playbook builds the React bundle locally)
-   An SSH client
-   `sshpass`, only if you log in to the hosts with a password instead of a key

## 3. Prepare the Control Machine

```bash
git clone <repository-url> platform
cd platform

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r config/requirements-dev.txt

npm ci --prefix controller/lab-portal-ui
```

All commands below run from the repository root.

## 4. Describe Your Hosts

Edit `infra/inventory.ini` and replace the example names and addresses:

```ini
[lab_workers]
lab-worker ansible_host=10.0.0.11

[management]
lab-management ansible_host=10.0.0.12

[platform:children]
lab_workers
management

[platform:vars]
ansible_user=root
ansible_connection=ssh
ansible_python_interpreter=/usr/bin/python3
```

### Credentials

Key-based login is preferred and needs no credential file:

```bash
ssh-copy-id root@10.0.0.11
ssh-copy-id root@10.0.0.12
```

For password login, copy each example file to the host's inventory name and set the
password. The copies are ignored by Git:

```bash
cp infra/host_vars/lab-worker.yml.example infra/host_vars/lab-worker.yml
cp infra/host_vars/lab-management.yml.example infra/host_vars/lab-management.yml
```

If your host names differ from `lab-worker` and `lab-management`, name the copies after
them. To keep the passwords encrypted, use `ansible-vault encrypt` on these files and
add `--ask-vault-pass` to every `ansible-playbook` command.

### Settings

Review these values before the first run:

| File                              | Variable                          | Meaning                                               |
| --------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `infra/group_vars/all.yml`        | `thesis_max_concurrent_students`  | Number of students who can run a lab at the same time |
| `infra/group_vars/all.yml`        | `podman_supported_architectures`  | Host architectures the Podman role accepts            |
| `infra/group_vars/management.yml` | `thesis_portal_public_hostname`   | Public DNS name of the management host (HTTPS only)   |
| `infra/group_vars/management.yml` | `thesis_portal_letsencrypt_email` | Contact address for Let's Encrypt (HTTPS only)        |

Install paths (`/opt/thesis-labs`, `/var/lib/thesis-labs`, `/var/log/thesis-labs`,
`/etc/thesis-labs`) are also set in `infra/group_vars/all.yml`. The defaults work as they
are.

## 5. Check the Connection

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible platform -m ping
```

Both hosts must answer `pong`. Fix SSH access before you continue.

## 6. Provision Both Hosts

```bash
ANSIBLE_CONFIG=config/ansible.cfg \
  .venv/bin/ansible-playbook infra/playbooks/site.yml
```

The playbook runs in this order:

1.  Base packages, directories, and Podman on both hosts.
2.  The management host: portal, React bundle, guides, Nginx, the session-signing secret,
    and the controller SSH key.
3.  The worker: `labctl`, the restricted `labadmin` SSH gateway that trusts only the
    controller key, validation of every lab, the lab images, the cleanup timer, and the
    port guard.

The first run takes a long time because the worker builds every lab image. Later runs
rebuild only images whose sources changed.

Run the read-only checks afterwards:

```bash
ANSIBLE_CONFIG=config/ansible.cfg \
  .venv/bin/ansible-playbook infra/playbooks/verify-platform.yml
```

The portal is now reachable at `http://<management-host>/`.

## 7. Enable HTTPS (Optional)

HTTPS uses a Let's Encrypt certificate and needs a public DNS name that points to the
management host, with port 80 reachable from the Internet.

1.  Set `thesis_portal_public_hostname` and `thesis_portal_letsencrypt_email`.
2.  Request the certificate:

    ```bash
    ANSIBLE_CONFIG=config/ansible.cfg \
      .venv/bin/ansible-playbook infra/playbooks/management.yml \
      -e thesis_portal_tls_request=true
    ```

Nginx then also listens on 443, and a systemd timer renews the certificate. Routine runs
never request a certificate unless the flag is passed.

## 8. Create the First Accounts

### Administrator

On its first start, the portal creates the administrator `admin@thesis.local` with a
random password and writes the password to its log once. Read it on the management host:

```bash
journalctl -u thesis-portal | grep "Bootstrapped initial admin"
```

Sign in at `http://<management-host>/admin/login`. The portal asks for a new password on
first sign-in.

### Instructors

In the administrator area, create one account per instructor. The portal shows each
temporary password once. Instructors sign in at `/instructor/login` and set their own
password on first sign-in.

### Groups and labs

Instructors create a group for their course, choose the semester, and assign labs with
optional deadlines.

### Students

Students register at `/signup`, then request a group at `/enrollment`. The instructor
approves the request, and the group's labs appear on the student's overview. Each
student starts labs from the portal and works in the browser terminal.

## 9. Everyday Administration

### Deploy changes

Pull the new code on the control machine and run the matching playbook. A full
`site.yml` run is always safe; tags make smaller runs faster:

| Change                         | Command                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Portal backend or lab metadata | `ansible-playbook infra/playbooks/management.yml --tags portal-api`            |
| Portal frontend                | `ansible-playbook infra/playbooks/management.yml --tags portal-ui`             |
| Guides                         | `ansible-playbook infra/playbooks/management.yml --tags docs`                  |
| Lab sources and images         | `ansible-playbook infra/playbooks/lab-worker.yml --tags lab-source,lab-images` |

Prefix each command with `ANSIBLE_CONFIG=config/ansible.cfg` and use
`.venv/bin/ansible-playbook`. After adding or changing a lab, run the worker command and
then `management.yml`, so the portal and the guides pick up the lab.

To preview a run on provisioned hosts without changing anything, add `--check --diff`.

### Backups

Every full run and every `portal-api` run copies the portal database to
`/var/lib/thesis-labs/backups/` first and keeps the five newest copies
(`thesis_portal_backup_retain_count`). For an off-host backup, copy
`/var/lib/thesis-labs/portal.db` and `/var/lib/thesis-labs/results/` elsewhere.

### Services and logs

| Host       | Unit                       | Purpose                                           |
| ---------- | -------------------------- | ------------------------------------------------- |
| Management | `thesis-portal`            | FastAPI portal and the idle/runtime lab scheduler |
| Management | `nginx`                    | Web entry point, terminal and SSH forwarding      |
| Management | `certbot-renew.timer`      | Certificate renewal, only when HTTPS is enabled   |
| Worker     | `thesis-lab-cleanup.timer` | Removes old temporary files and unused images     |
| Worker     | `thesis-lab-guard`         | Port guard for the per-student lab ports          |

Use `systemctl status <unit>` and `journalctl -u <unit>`. Portal events are written to
`/var/log/thesis-labs/portal-events.jsonl`. The worker gateway logs every accepted and
refused command to syslog.

### Account recovery

The administrator resets instructor passwords in the administrator area and can disable
or re-enable instructor accounts.

### Rotate the session secret

Rotation signs out every user:

```bash
ANSIBLE_CONFIG=config/ansible.cfg \
  .venv/bin/ansible-playbook infra/playbooks/management.yml \
  -e thesis_portal_rotate_session_secret=true
```

### Remove the platform

```bash
ANSIBLE_CONFIG=config/ansible.cfg \
  .venv/bin/ansible-playbook infra/playbooks/teardown-platform.yml
```

This stops the services and deletes the platform directories on both hosts, including
the portal database, results, and logs. Back up first. Container images stay in Podman
storage.

## 10. Troubleshooting

| Symptom                                                  | Check                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Podman provisioning is not configured for architecture` | Add the host architecture to `podman_supported_architectures`             |
| `npm ci` fails on the control machine                    | Install Node.js 20 or newer and run the command from the repository root  |
| Worker image build fails                                 | The worker needs outbound access to Docker Hub and the Debian mirrors     |
| `Generated controller public key is unavailable`         | Run `site.yml`, not `lab-worker.yml` alone, on a new installation         |
| Portal shows 502                                         | `journalctl -u thesis-portal` on the management host                      |
| Start fails with a capacity message                      | Raise `thesis_max_concurrent_students` and redeploy `management.yml`      |
| Student SSH fallback does not connect                    | Open the per-lab SSH port range on the management host's network firewall |
