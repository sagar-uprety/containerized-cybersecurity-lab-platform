# Author Notes for `sample-lab`

`labs/sample-lab/` is both a runnable portal lab and the canonical package to
copy when creating a new scenario. It uses a deliberately tiny custom records
service so every platform mechanism is visible without tying the template to
Redis, NGINX, LDAP, Samba, Postfix, or another real product.

For the complete first-time workflow, read the protected MkDocs page at
`/docs/instructor/new-lab-setup/`. That guide explains scenario selection,
supported topology patterns, platform limits, checker design, documentation,
validation, deployment, and live verification.

## Create a Working Copy

From repository root:

```bash
python3 tools/create_lab.py <lab-id> \
  --title "<Human-Readable Lab Title>" \
  --difficulty beginner
```

Example:

```bash
python3 tools/create_lab.py ftp-anonymous-access \
  --title "Unexpected Access to a File Transfer Service" \
  --difficulty beginner
```

The command copies the runnable package, leaves this sample-only author note
behind, replaces `sample-lab` identifiers, updates title and difficulty, and
creates all three `docs/labs/` include pages. It never overwrites an existing
lab or documentation page.

The clone is immediately schema-valid and runnable as another copy of the
sample. Replace sample behavior one layer at a time, running validation after
each layer.

## File Map

| File                              | Why it exists                                                       | Replace for a real lab                                                     |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `scenario.yaml`                   | Portal metadata, topology, images, resources, lifecycle, and checks | Every sample-specific service, check, hostname, role, and story value      |
| `Dockerfile`                      | Builds target service image from shared service base                | Packages, users, helper, copied files, exposed internal ports              |
| `config.vulnerable`               | Versioned reset baseline                                            | Entire target-service configuration                                        |
| `seed.txt`                        | Synthetic impact data                                               | Dummy records appropriate to scenario, or delete when unnecessary          |
| `setup-sample.sh`                 | Idempotent first-boot setup hook                                    | Rename and replace, or delete with matching scenario/Dockerfile references |
| `reload-sample-service.sh`        | Narrow service-admin action                                         | Rename and implement target service's supported validate/reload flow       |
| `sample-service.py`               | Tiny runnable target                                                | Delete after replacing with a real package or application                  |
| `intentional-risk-allowlist.yaml` | Documents deliberate scanner findings                               | Every risk, file, pattern/rule, and teaching justification                 |
| `docs/SITREP.txt`                 | Student mission brief mounted at `~/SITREP.txt`                     | Mission, deliverables, paths, and guide URL; never solution details        |
| `docs/solution-notes.md`          | Sole exact answer key                                               | Every command, transition, expected result, and rationale                  |
| `docs/instructor-guide.md`        | Assessment and intervention guide                                   | Objectives, evidence, hints, mistakes, checker states, teaching notes      |
| `docs/student-guide.md`           | Guided-discovery student path                                       | Write last; no exact investigation/remediation/verification commands       |
| `docs/AUTHORING.md`               | Notes for authors reading this sample                               | Optional in copied labs; remove before release if no longer useful         |

## What the Sample Demonstrates

### Configuration and Reset

`config.vulnerable` is copied by `lab-service-base` into a named volume only
when the runtime file does not exist. Student edits therefore survive a service
reload and a Stop/Start cycle. Portal Reset destroys the volume and restores
the vulnerable file from the image.

Use this pattern for service configuration, database state, keys generated for
the lab, or other state students must be able to break and reset.

### Shared Student Editing

The `sample_config` volume is mounted at both:

-   `/etc/sample-service` in the target container
-   `/lab/sample` in the workstation

Both containers use UID 1000 for the file owner. This allows student editing
without a host bind mount, privileged mode, or container-runtime access.

Use a shared volume when direct config editing from the workstation is the
intended workflow. If the lesson should teach remote administration instead,
omit the workstation shared volume and expose the configuration only through a
student-accessible SSH account in the service container.

### Narrow Administration

`sampleadmin` can run exactly one root helper through sudo. The helper validates
the target config and signals only the target service. It does not grant a root
shell, general package management, Podman, or arbitrary service control.

For a real service, prefer its supported validation and reload commands. Keep
the sudoers rule limited to one versioned helper whenever root is required.

### Synthetic Seed Data

`setup-sample.sh` copies `seed.txt` only when the runtime data file is absent.
This makes start idempotent and reset deterministic. All values are clearly
fake. Never seed real student, employee, production, or credential data.

### Objective and Guardrail Checks

The checker contains four reusable check shapes:

| Sample criterion              | Kind        | General lesson                                 |
| ----------------------------- | ----------- | ---------------------------------------------- |
| Unauthorized request behavior | `objective` | Test vulnerability through observable behavior |
| Persistent config state       | `objective` | Verify fix survives reload/reset boundaries    |
| Authorized request behavior   | `guardrail` | Preserve legitimate use                        |
| Health endpoint               | `guardrail` | Do not award success for breaking service      |

Replace all four sample criteria. A new lab may need more or fewer checks, but
it must have at least one objective. Every assessed security outcome needs a
criterion, and every criterion needs a documented purpose.

Each checker command should:

1. Run inside `workstation` or a declared service hostname.
2. Use bounded commands such as `timeout`, `curl --connect-timeout`, or client
   timeout flags.
3. Emit one short, deterministic token.
4. Exit zero when it produced a trustworthy observation.
5. Emit a third unmatched token for ambiguous/broken behavior when useful.
6. Avoid changing student state unless it cleans up after itself.

### Safe Published Endpoint

The sample keeps its vulnerable target private and shows a commented optional
`$platform.app_port` mapping. Uncomment that pattern only for a safe scenario
application endpoint that has a genuine student-facing purpose. Vulnerable
databases, LDAP, SMB, SSH, SMTP, DNS, and similar target ports normally remain
private on the per-student network and are reached from the workstation.

### Explicit Network

The sample declares one named network to show syntax. A simple lab may omit the
top-level `networks` block and all container `networks` entries; labctl then
creates one default network.

For proxy, firewall, or segmentation labs, declare several networks and attach
each service only where required. The workstation joins the first declared
network. A router/firewall/proxy container can join multiple networks.

## Recommended Edit Order

1. Write learning objective, misconception, vulnerable behavior, fixed
   behavior, and service-continuity requirement in plain language.
2. Replace story, title, and service registry in `scenario.yaml`.
3. Replace Dockerfile and service artifacts until target image builds.
4. Replace topology, networks, volumes, environment, and health checks.
5. Replace checker commands and state conditions.
6. Write exact `solution-notes.md` and execute every block through student CLI.
7. Write `instructor-guide.md` and its checker-coverage matrix.
8. Rewrite `SITREP.txt` without fix hints.
9. Write `student-guide.md` last, using solution notes as the anti-spoiler source.
10. Replace intentional-risk allowlist entries.
11. Delete sample-only files and text that the new service no longer uses.
12. Run all local checks, deploy through Ansible, and complete a fresh live pass.

## Required Validation

From repository root:

```bash
PYTHONPATH=controller .venv/bin/python tools/pre_commit/validate_scenarios.py
.venv/bin/python tools/pre_commit/check_scenario_checker_shell.py
.venv/bin/python tools/pre_commit/validate_intentional_risks.py
.venv/bin/pre-commit run --all-files
.venv/bin/python -m mkdocs build --strict \
  --config-file config/mkdocs.yml
```

Run all Ansible syntax checks before deployment:

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/site.yml --syntax-check
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/management.yml --syntax-check
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/lab-worker.yml --syntax-check
```

## Deployment (You Run This)

You author the lab and then deploy it yourself with Ansible. There is no CI
pipeline or workflow dispatch; everything runs from your workstation over the
UCC VPN to x01/x02.

Deploy commands:

```bash
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/lab-worker.yml --tags lab-source,lab-images
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/management.yml --tags docs
ANSIBLE_CONFIG=config/ansible.cfg .venv/bin/ansible-playbook \
  infra/playbooks/verify-platform.yml
```

After deployment, assign the new lab to a test group in the instructor portal.
Use a test student account to start it, execute every solution-notes Bash block,
observe vulnerable then fixed checker states, test one regression and one
broken-service guardrail, reset to vulnerable, and end the lab.

## Release Checklist

-   No `sample-lab`, `sample-service`, sample record, or sample checker text
    remains unless intentionally retained.
-   Scenario ID, directory, documentation URLs, image tags, and allowlist ID
    agree.
-   Every image builds on RHEL 9.6 `ppc64le`.
-   No privileged mode, host networking, runtime socket, real secret, real data,
    malware, or host-kernel dependency exists.
-   Every container and workstation has CPU and memory limits.
-   Vulnerable service ports remain private unless a safe endpoint is necessary.
-   Reset recreates the complete vulnerable baseline from versioned files.
-   Every solution command is reachable with student-visible credentials/paths.
-   Objective and guardrail checks cover all documented outcomes in both
    directions.
-   Student guide contains no copied solution commands, exact secret, or exact
    remediation line.
-   Student, instructor, solution, and SITREP documents render at expected URLs.
-   Full pre-commit, Ansible syntax, deployment, and live student-path checks
    pass before marking record work done.
