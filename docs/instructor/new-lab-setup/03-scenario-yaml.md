# Author `scenario.yaml`

_[← Choose a Topology Pattern](02-topology-patterns.md) · [Guide overview](index.md)_

`scenario.yaml` is the API between instructor-authored scenario code and four
platform consumers: labctl, Ansible image deployment, portal rendering, and
checker evidence. It must contain machine-consumed values only.

## Identity, Story, and Documentation

`id` must match the directory exactly. Changing an ID later changes resource
names, portal assignment keys, evidence keys, and documentation URLs; choose it
carefully before deployment.

`story.role` and `story.situation` are short portal preview text. They establish
context without naming the exact vulnerable directive or solution.

Documentation URLs always follow this convention:

```yaml
documentation:
    student_guide_url: /docs/labs/<lab-id>/
    solution_notes_url: /docs/labs/<lab-id>-solution/
    instructor_guide_url: /docs/labs/<lab-id>-instructor/
```

Validation rejects drift from these paths.

## Access Ports

Use the sample values for an ordinary new lab unless you have already
allocated and reviewed another range across all active scenarios:

```yaml
access:
    ssh_port_base: 22000
    browser_terminal_port_base: 19000
```

Add this only for a safe browser-visible endpoint:

```yaml
app_port_base: 18000
```

labctl adds the student's numeric ID. Current bands assume low-numbered student
IDs; IDs at or above 1000 can overlap the app, terminal, and SSH bands. The
repository currently allows four-digit IDs, so high-scale port allocation is an
explicit platform limitation requiring architecture review. Do not invent a new
range inside one lab without checking every active scenario and student range.

Most vulnerable service ports should stay private. Students reach them from
their workstation over the per-student network. Publishing a database, LDAP,
SMB, SMTP, DNS, or SSH target directly on x01 expands risk without educational
benefit.

## Lifecycle

Start with the sample values unless pedagogy requires a different maximum:

```yaml
lifecycle:
    idle_timeout_minutes: 30
    max_runtime_minutes: 120
    evaluation_idle_timeout_minutes: null
    retention_after_stop_minutes: 180
```

`null` evaluation idle timeout prevents evaluation sessions from stopping only
because a student closed the portal tab. Maximum runtime remains a hard bound.

## Build Images

List each custom image once:

```yaml
build:
    images:
        - service: target-service
          name: thesis-labs/<lab-id>-target:latest
          context: .
          dockerfile: Dockerfile
```

The `service` must exist under `services`, and image names must match exactly.
Paths must remain inside the lab directory. Shared platform images are not
listed because Ansible builds them separately.

## Services and Resources

`services` is a logical image registry. `containers` creates instances from it.
Always declare `workstation` and give every service a matching resource entry.

```yaml
services:
    workstation:
        image: thesis-labs/workstation-base:latest
    target-service:
        image: thesis-labs/<lab-id>-target:latest

resources:
    workstation:
        cpus: '0.50'
        memory: '256m'
    target-service:
        cpus: '0.50'
        memory: '256m'
```

Increase limits only after measuring need. Multi-service labs must account for
all containers honestly.

## Workstation

labctl generates workstation ports, credentials, standard volumes, health
checks, command logging, and SITREP mount. Add only scenario-specific values:

```yaml
workstation:
    environment:
        TARGET_HOST: target-service
    shared_volumes:
        - name: target_config
          target: /lab/target
    depends_on:
        - target-service
```

`depends_on` values are service hostnames, not image names. Add workstation
capabilities only when student tools require them. `NET_RAW` supports some raw
network scans; do not add it by habit.

## Networks

Omit `networks` for a simple single-network lab. labctl creates a default bridge.

For explicit topology:

```yaml
networks:
    - name: external
    - name: internal
```

Then attach each service under its container definition. Never use host network.
Do not mark the workstation's network internal when browser-terminal or SSH host
ports must remain reachable.

## Containers

Every service container needs a unique service key and hostname. Common fields:

| Field         | Purpose                                                            |
| ------------- | ------------------------------------------------------------------ |
| `service`     | Resolves image/resources and forms runtime name                    |
| `hostname`    | DNS name inside lab and checker `exec_in` target                   |
| `networks`    | Optional explicit network membership                               |
| `environment` | Generic entrypoint and service-specific settings                   |
| `volumes`     | Named persistent volumes or read-only lab-source bind mounts       |
| `expose`      | Documents internal ports                                           |
| `ports`       | Publishes only a required safe endpoint                            |
| `depends_on`  | Start dependency by hostname                                       |
| `healthcheck` | Bounded readiness/liveness command inside target                   |
| `security`    | Visible capabilities and forbidden flags                           |
| `user`        | Optional non-root process user                                     |
| `read_only`   | Optional read-only root filesystem when writable paths use volumes |
| `sysctls`     | Namespaced in-container sysctls only                               |

The shared service base understands:

| Environment variable     | Meaning                                 |
| ------------------------ | --------------------------------------- |
| `LAB_CONFIG_SRC`         | Baseline config path inside image       |
| `LAB_CONFIG_DST`         | Runtime config path on a named volume   |
| `LAB_SERVICE_CMD`        | Service start command                   |
| `LAB_DATA_DIR`           | Runtime data directory                  |
| `LAB_DATA_USER`          | Owner for data/config directories       |
| `LAB_SEED_FILE`          | Optional seed source inside image       |
| `LAB_SEED_CMD`           | Optional service-specific seed command  |
| `LAB_LOG_FILE`           | Foreground log tail target              |
| `LAB_ADMIN_USER`         | Account receiving injected lab password |
| `LAB_SETUP_SCRIPT`       | Optional idempotent pre-start hook      |
| `SERVICE_ADMIN_PASSWORD` | `$platform.student_password` at runtime |

**`LAB_CONFIG_DST` and `LAB_DATA_DIR` are not student-visible by themselves.**
They are paths inside the target container's own filesystem. A path only
becomes reachable from the workstation (for shared-volume editing, per the
"Shared Student Editing" pattern) when the _same_ named volume is also listed
under that container's `volumes` **and** under `workstation.shared_volumes`
with a `workstation`-side `target`. Compare `labs/sample-lab/scenario.yaml`'s
`sample_config` volume (declared in both places, so `/etc/sample-service` on
the target is reachable as `/lab/sample` on the workstation) against its
`sample_data` volume (declared only under the target container's `volumes`,
so it is never student-visible). If your checker or solution notes need a
student to read or edit a `LAB_DATA_DIR` file directly, put that data in a
volume that is also shared to the workstation, not only in `LAB_DATA_DIR`.

The authoritative implementation comments are at
`platform-images/lab-service-base/entrypoint.sh`.

Available `$platform` values include lab/student IDs, runtime project, injected
student password, ttyd credential, bind IP, computed SSH/browser/app ports,
platform name, and deployed lab source root. Use tokens only in string values.

---

_[← Choose a Topology Pattern](02-topology-patterns.md) · [Guide overview](index.md) · [Next: Build the Image and Design the Checker →](04-build-and-checker.md)_
