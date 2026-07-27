# Creating and Shipping a New Security Lab

This guide is for an instructor creating a lab for the first time without an automation
assistant or prior knowledge of this repository. It explains what the platform
supports, how to turn a teaching idea into a complete lab package, how to use
the runnable `sample-lab`, how to validate every artifact, and how you run
Ansible and `labctl` yourself to deploy and verify the result.

The shortest safe workflow is:

1. Confirm the idea fits the platform boundary.
2. Clone the runnable sample with `tools/create_lab.py`.
3. Replace sample service behavior, topology, checks, and documentation.
4. Run all local validation.
5. Deploy images/source to x01 and docs/metadata to x02 yourself (you are the operator).
6. Complete a fresh student-path test from vulnerable baseline through fix and reset.

Do not begin by inventing a directory layout. Every real lab follows the same
package contract; only scenario-specific implementation files differ.

## Platform Fit: What This System Supports

The platform is deliberately universal within one defined scope: isolated,
configuration-driven Linux service-security labs that can run safely in
unprivileged Podman containers and can be classified through deterministic
checks.

It is not a general-purpose cyber range for every possible security exercise.
That boundary is a safety and reproducibility feature, not missing polish.

### Coverage of the Scenario Selection Report

The research selection report identifies 19 scenario ideas. Seventeen can be
represented by the existing scenario contract, sometimes with the documented
safe redesign. Two cannot be represented authentically on this platform.

| Rank / scenario          | Supported pattern                                         | Important constraint                                                        |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1 NoSQL exposure         | Workstation + database + optional dependent app           | Keep database port private; seed dummy data                                 |
| 1 Weak SSH config        | Workstation + SSH service                                 | Use planted dummy accounts/keys and bounded brute-force evidence            |
| 3 Firewall bypass        | Multi-network workstation/firewall/server topology        | Narrow `NET_ADMIN`; never privileged or host network                        |
| 4 LDAP anonymous bind    | Workstation + LDAP service                                | Dummy directory entries; private LDAP port                                  |
| 5 Database permissions   | Workstation + SQL service                                 | Synthetic schema; checker covers auth and least privilege                   |
| 6 Unpatched service      | Workstation + pinned legacy service                       | Build must work on `ppc64le`; prefer safe compensating control              |
| 7 PROXY protocol bypass  | Client/workstation + proxy + backend, often multi-network | Bound requests; validate trust boundary and backend continuity              |
| 8 Banner exposure        | Workstation + target service                              | Behavior check should distinguish useful service from excess metadata       |
| 9 TLS/vhost isolation    | Workstation + one or more TLS services                    | Version test material; avoid external certificates or domains               |
| 10 Logging failure       | Workstation + service/logging target                      | Service logs/rsyslog are possible; kernel `auditd` is not                   |
| 11 FTP anonymous access  | Workstation + FTP service                                 | Keep traffic inside private network; passive ports need careful config      |
| 12 SMB exposure          | Workstation + file service                                | Use dummy files and separate legitimate-access guardrail                    |
| 14 SNMP exposure         | Workstation + SNMP service                                | Dummy community strings and data only                                       |
| 16 Network segmentation  | Several uniquely named services across several networks   | Workstation joins first network; route through declared middleboxes         |
| 17 DNS misconfiguration  | Workstation + DNS service                                 | Internal UDP traffic works; do not create Internet reflector access         |
| 18 SMTP open relay       | Workstation + mail service                                | Isolated network only; never deliver real mail externally                   |
| 19 Container security    | Safely redesigned capability/non-root lesson              | No privileged mode, `ALL` capabilities, host mounts, or escape demo         |
| 13 NTP amplification     | Not supported as designed                                 | Required `monlist` behavior no longer exists on target platform             |
| 15 Full system hardening | Not supported as designed                                 | Host kernel, SELinux, `auditd`, systemd, and global sysctls are unavailable |

The full evidence, rankings, and scenario details live in
`resources/scenario-selection-report.md`.

### Reusable Capabilities Already Implemented

| Need                                  | Scenario mechanism                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| One or many service containers        | `services`, `build.images`, and `containers`                                         |
| One or many private networks          | Optional top-level `networks` plus container network membership                      |
| Router/firewall/proxy across networks | Attach one container to multiple networks; add narrow capability if required         |
| Per-student isolation                 | labctl prefixes containers, networks, and volumes with lab and student IDs           |
| Persistent editable configuration     | Named volume mounted into service and workstation                                    |
| Remote service administration         | Service-local SSH account with injected lab password and narrow sudo helper          |
| Deterministic seed data               | Versioned seed/config files and idempotent setup hook                                |
| Optional safe web endpoint            | `access.app_port_base` and `$platform.app_port` mapping                              |
| Browser terminal and SSH fallback     | Auto-generated workstation container                                                 |
| Custom student tools                  | Build a lab-specific workstation image and reference it under `services.workstation` |
| CPU and memory limits                 | Required `resources` entry for every service and workstation                         |
| Health and continuity                 | Container health checks plus checker guardrails                                      |
| Arbitrary service checks              | Shell command executed in workstation or declared service container                  |
| Reset                                 | Destroy/recreate containers and named volumes from versioned source                  |
| Student/instructor/answer docs        | Four co-located lab docs plus three MkDocs include pages                             |

### Current Runtime Contract Limits

These are implementation facts instructors must design around:

| Limit                                         | Authoring consequence                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| One auto-generated workstation                | Do not declare workstation under `containers`; add other clients as normal uniquely named services     |
| Workstation joins first custom network        | Put student-facing/external network first; route to later networks through declared services           |
| One optional portal application URL           | Multiple/protocol-specific target ports stay private and are tested from workstation                   |
| Portal application URL is HTTP                | TLS, DNS, FTP, SMTP, SMB, LDAP, and similar protocols are exercised from workstation clients           |
| One service key creates one runtime name      | Give repeated instances distinct service keys even when image is shared                                |
| Checker runs `sh -c` in an existing container | Put required checker clients/scripts in workstation or service image; no ephemeral checker image       |
| Two declared criterion states                 | Declare only vulnerable/fixed; partial/unknown/error are synthesized                                   |
| Simple output/exit matching                   | Complex logic belongs inside bounded shell or a versioned checker helper that emits a short token      |
| One active lab per student                    | Do not design simultaneous labs for one student; coordinate any port-range change across all scenarios |
| No draft flag                                 | An undeployed branch is the draft boundary; any deployed valid scenario enters instructor catalog      |

These limits still cover all 17 container-safe candidates in the selection
report. Changing them is platform architecture work, not a lab-local workaround.

## Scenario Pattern Cookbook

This section maps every implementable scenario family from
`resources/scenario-selection-report.md` to the concrete `scenario.yaml`
fields, topology, checker shapes, and caveats you need. Use it as a lookup
when you cannot reuse the sample directly.

The selection report contains 19 ranked scenarios. Two (NTP amplification Rank
13, System Hardening Rank 15) cannot be represented on this platform. The other
17 are supported by the existing contract; the table below is the
configuration recipe for each one.

| Family                               | Containers                                                                      | Networks                                                   | Build                                                                                                                                                           | Checker shape                                                                                                                                                                                              | Caveats                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 NoSQL exposure (Redis/MongoDB)** | workstation + db-service (+ optional demo-app dependent on db)                  | single default                                             | Dockerfile installs redis-server/mongod, copies `config.vulnerable` with `bind 0.0.0.0` + no auth                                                               | objective: anonymous `redis-cli PING` returns `PONG` / `mongo --eval 'show dbs'` succeeds; objective: bind restricted; guardrail: demo-app health; guardrail: authenticated client still works             | Keep db port private. If a dependent app is pedagogically important, add it; otherwise omit it. See `labs/redis-exposed/`.                                                  |
| **1 SSH weak config**                | workstation + ssh-host                                                          | single default                                             | Dockerfile installs openssh-server, fail2ban; `config.vulnerable` enables `PasswordAuthentication yes`; setup hook plants weak user passwords + authorized_keys | objective: `sshpass -p weak ssh lab-user@ssh-host` succeeds; objective: `permitrootlogin no`; objective: weak accounts locked; guardrail: key auth still works; guardrail: fail2ban bans injected attempts | Add `NET_RAW` + `AUDIT_WRITE` to workstation caps. Canonical implementation: `labs/ssh-weak-config/`.                                                                       |
| **3 Firewall source-port bypass**    | workstation + firewall-host (attaches to 2 nets) + internal-server              | `external`, `internal`                                     | Two Dockerfiles: firewall (iptables rules file), server (nginx)                                                                                                 | objective: `curl --local-port 80` to internal reaches server (vulnerable) vs blocked (fixed); objective: FORWARD policy DROP + conntrack state rule present; guardrails: forwarding path healthy           | Add `NET_ADMIN` on firewall, `NET_RAW` + `NET_BIND_SERVICE` on workstation so student can bind source port 80. Canonical: `labs/firewall-source-port-bypass/`.              |
| **4 LDAP anonymous bind**            | workstation + ldap-host                                                         | single default                                             | Dockerfile installs slapd, certs, dummy LDIF; `config.vulnerable` enables anonymous read                                                                        | objective: `ldapsearch -x` without bind creds returns entries; objective: plaintext bind rejected (TLS required); guardrail: authenticated bind over STARTTLS still returns entries                        | Generate self-signed certs in setup hook, not real CA. Canonical: `labs/ldap-anonymous-bind/`.                                                                              |
| **5 MySQL/MariaDB weak permissions** | workstation + mysql-host                                                        | single default                                             | Dockerfile installs mariadb-server; `config.vulnerable` binds 0.0.0.0, weak root pw, anonymous user, broad grants                                               | objective: anonymous `mysql -h` read succeeds; objective: bind restricted to localhost; objective: anonymous users removed; guardrail: authenticated least-priv user can still query                       | Keep 3306 private; check from workstation.                                                                                                                                  |
| **6 Unpatched Apache CVE**           | workstation + apache-host                                                       | single default                                             | Dockerfile pins vulnerable Apache 2.4.49 from source + sha256; `config.vulnerable` enables mod_cgi + alias                                                      | objective: `curl --path-as-is /cgi-bin/.%2e/etc/passwd` returns 403/404 not 200 + passwd; objective: mod_cgi disabled + alias removed; guardrail: home HTTP 200                                            | Pin source, verify checksum, ensure ppc64le-compatible. Canonical: `labs/unpatched-apache-cve/`.                                                                            |
| **7 PROXY protocol bypass**          | workstation + proxy-host (2 nets) + backend                                     | `external`, `internal`                                     | Dockerfile installs HAProxy/nginx with PROXY protocol enabled                                                                                                   | objective: crafted PROXY header reaches restricted backend; objective: trusted upstreams only; guardrail: legitimate client path healthy                                                                   | Multi-net. Like firewall lab but trust-boundary focused.                                                                                                                    |
| **8 Banner exposure**                | workstation + service-host                                                      | single default                                             | Dockerfile installs a chatty service (ssh/postfix/nginx) with `server_tokens on` / verbose version                                                              | objective: banner reveals exact version; objective: server_tokens off / banner scrubbed; guardrail: service still responds                                                                                 | Simplest lab; good first scenario beyond sample.                                                                                                                            |
| **9 TLS/vhost isolation**            | workstation + web-host                                                          | single default (or 2 nets if separating clients)           | Dockerfile installs Apache/nginx with TLS + 2 vhosts sharing STEK                                                                                               | objective: session ticket from vhost A resumes against vhost B; objective: tickets isolated or disabled; guardrail: same-vhost resumption still works                                                      | Advanced. Generate self-signed certs in setup. Document TLS 1.2 vs 1.3 ticket behavior.                                                                                     |
| **10 Logging failure**               | workstation + service-host                                                      | single default                                             | Dockerfile installs target service (e.g. SSH/Apache) with rsyslog running but minimal config                                                                    | objective: failed login not in `auth.log`; objective: failed login captured; guardrail: service still works; guardrail: log rotation configured                                                            | `auditd` kernel-level rules NOT available in unprivileged containers. Use rsyslog + service-specific logs only.                                                             |
| **11 FTP anonymous access**          | workstation + ftp-host                                                          | single default                                             | Dockerfile installs vsftpd; `config.vulnerable` enables `anonymous_enable=YES` + write                                                                          | objective: anonymous login reads dummy files; objective: anonymous disabled; guardrail: authenticated user still works                                                                                     | FTP passive-mode port range inside container needs `pasv_min_port`/`pasv_max_port` set; do not rely on NAT.                                                                 |
| **12 SMB open share**                | workstation + smb-host                                                          | single default                                             | Dockerfile installs samba; `config.vulnerable` enables `guest ok = yes`, `map to guest = Bad User`, open `valid users`                                          | objective: `smbclient -N //smb-host/backup` lists files; objective: guest disabled + valid_users restricted; guardrail: authenticated Samba user still reads share                                         | Canonical: `labs/smb-open-share/`.                                                                                                                                          |
| **14 SNMP community strings**        | workstation + snmp-host                                                         | single default (or UDP-published if you want remote tools) | Dockerfile installs snmpd; `config.vulnerable` sets `rocommunity public` + broad view                                                                           | objective: `snmpwalk -c public` returns OIDs; objective: community restricted + view limited; guardrail: authorized community still walks                                                                  | Use `protocol: udp` in the `ports` block if you want SNMP published to the workstation; otherwise test from workstation over the internal net (no host publication needed). |
| **16 Network segmentation**          | workstation + router/firewall (3 nets) + server-a + server-b                    | `external`, `dmz`, `internal`                              | Router Dockerfile (iptables/forwarding), two server Dockerfiles                                                                                                 | objective: workstation reaches `internal` directly (flat network); objective: FORWARD DROP + only DMZ reachable; guardrails: each segment's legitimate path still works                                    | Largest topology (5 containers, 3 nets). Workstation joins `external` only.                                                                                                 |
| **17 DNS misconfiguration**          | workstation + dns-host (+ optional controlled authoritative for poisoning demo) | single default                                             | Dockerfile installs BIND/Unbound; `config.vulnerable` enables `allow-recursion any` + `dnssec-validation no`                                                    | objective: `dig ANY` returns large response from any source; objective: recursion restricted + DNSSEC on; guardrail: trusted-client recursion still works                                                  | For amplification demo, keep DNS UDP and isolated. Use `protocol: udp` on the published port only if needed.                                                                |
| **18 SMTP open relay**               | workstation + mail-host                                                         | single default                                             | Dockerfile installs Postfix; `config.vulnerable` sets `mynetworks = 0.0.0.0/0` + `permit_mynetworks` before reject                                              | objective: `swaks --from spoofed@external.com` queues; objective: relay rejected from non-mynetworks; guardrails: reject_unauth_destination still present + SMTP banner responsive                         | No real email leaves the isolated network. Canonical: `labs/smtp-open-relay/`.                                                                                              |
| **19 Container security (redesign)** | workstation + target-service                                                    | single default                                             | Dockerfile intentionally over-grants `cap_add: [SYS_ADMIN]`, runs as `root`, writable volume                                                                    | objective: `capsh --print` inside container shows SYS_ADMIN / `cat /proc/1/status                                                                                                                          | grep Cap`(set); objective: target redeployed with`cap_drop: [ALL]`+`cap_add: [AUDIT_WRITE]`+ non-root`user`; guardrail: service still serves                                | **Cannot** use `--privileged` or `--cap-add=ALL` (platform hard-rejects). Use `SYS_ADMIN` as the vulnerable over-grant. Cannot demonstrate real escape to host — that is by design. Lesson is least-privilege, not exploit mechanics. |

### How to use this cookbook

1. Find your scenario family row.
2. Use the topology, network count, and checker pattern as your starting
   `scenario.yaml` skeleton.
3. Replace dockerfile packages, configuration file directives, and seed data
   with your target service's real values (researched from official docs).
4. Add guardrails for any service continuity the scenario requires.
5. If your scenario needs a capability the table notes as a caveat (e.g.
   `NET_ADMIN` on a firewall container), justify it in your
   `intentional-risk-allowlist.yaml` and the container's `security.cap_add`.

The cookbook is exhaustive for the threshold model used by this platform: an
unprivileged Podman lab on RHEL 9.6 `ppc64le` that has deterministic
config-driven `vulnerable`/`fixed` checks. Scenarios outside that model
(kernels, bare metal, Windows, escape-to-host) cannot be supported without

### Hard Boundaries

Reject or redesign a lab if it requires any of these:

-   `--privileged`, host networking, `--cap-add=ALL`, host devices, or a Docker/Podman socket
-   Changes to x01/x02 host kernel, SELinux, systemd, host firewall, or host audit subsystem
-   Real malware, real credentials, real personal data, or uncontrolled Internet abuse
-   Windows/Active Directory, public-cloud accounts, proprietary appliances, physical/ICS hardware, or BMC/IPMI
-   Open-ended forensics, social engineering, policy-only assessment, or a task with no deterministic technical outcome
-   A vulnerability that cannot be safely represented on RHEL 9.6 `ppc64le`

Stop and request architecture review rather than weakening isolation to make an
changes require explicit approval.

Reject or redesign a lab if it requires any of these:

-   `--privileged`, host networking, `--cap-add=ALL`, host devices, or a Docker/Podman socket
-   Changes to x01/x02 host kernel, SELinux, systemd, host firewall, or host audit subsystem
-   Real malware, real credentials, real personal data, or uncontrolled Internet abuse
-   Windows/Active Directory, public-cloud accounts, proprietary appliances, physical/ICS hardware, or BMC/IPMI
-   Open-ended forensics, social engineering, policy-only assessment, or a task with no deterministic technical outcome
-   A vulnerability that cannot be safely represented on RHEL 9.6 `ppc64le`

Stop and request architecture review rather than weakening isolation to make an
changes require explicit approval.

## Roles and Permission Boundary

You are both the **instructor** (lab author) and the **operator** (deploy/run).

The two-VM platform splits that work across hosts, but one person performs
both roles. Students never see the operator side: they use only portal
lifecycle actions and their own workstation terminal.

| Capacity            | What you do                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Author              | Select concept, write `scenario.yaml`/Dockerfile/docs, run local validation                    |
| Operator            | Deploy to x01/x02 via Ansible, debug x01 with `labctl`, tear down with `teardown-platform.yml` |
| Instructor (portal) | Assign deployed labs to groups, approve students, view results/analytics                       |
| Student             | Portal-driven start/stop/reset/check/end only — never `labctl`, Ansible, or Podman             |

When this guide shows `ansible-playbook` or `labctl` commands, **you run them**
from your workstation over the UCC VPN to the x01/x02 hosts. No CI pipeline,
GitHub Action, or workflow dispatch is required — everything is operator-run.

## Sources of Truth

Use these in this order:

2. `labs/templates-contract/scenario.schema.json` defines accepted machine fields.
3. `labs/sample-lab/` is the runnable, commented authoring reference.
4. `labs/templates-contract/STUDENT_GUIDE_TEMPLATE.md` defines student-guide sections.
5. `labs/templates-contract/INSTRUCTOR_GUIDE_TEMPLATE.md` defines instructor-guide sections.
6. Existing real labs show scenario-specific variations, not new contracts.

Do not copy Redis-specific names or behavior into unrelated labs. Redis is one
real implementation; `sample-lab` is the neutral authoring starting point.

## Before Writing Files

Write a one-page design worksheet first. If any row is unclear, the scenario is
not ready to implement.

| Decision             | Required answer                                                      |
| -------------------- | -------------------------------------------------------------------- |
| Security concept     | One precise misconfiguration students must reason about              |
| Target misconception | Incorrect belief the lab should correct                              |
| Vulnerable behavior  | Observable action proving initial state is unsafe                    |
| Fixed behavior       | Observable action proving required control is effective              |
| Legitimate behavior  | What must still work after remediation                               |
| Persistence          | Which file/data must survive reload or Stop/Start                    |
| Reset source         | Which versioned artifact recreates vulnerable baseline               |
| Student path         | Shared-volume edit, nested SSH administration, or both               |
| Containers           | Workstation plus each target/dependent/middlebox service             |
| Networks             | Which containers may communicate and why                             |
| Seed data            | Clearly synthetic data sufficient to prove impact                    |
| Objective checks     | One criterion per assessed security outcome                          |
| Guardrail checks     | Service health and required legitimate behavior                      |
| Official references  | Current vendor/protocol docs for discovery and remediation           |
| Platform fit         | `ppc64le`, Podman, package/image availability, no forbidden boundary |

Research official documentation before implementation. Verify current
configuration syntax, reload behavior, package availability, and recommended
hardening. Do not trust old blog posts for security-sensitive directives.

## Quick Start: Clone the Runnable Sample

Run from repository root. Use a lowercase hyphenated ID no longer than 64
characters.

```bash
python3 tools/create_lab.py ftp-anonymous-access \
  --title "Unexpected Access to a File Transfer Service" \
  --difficulty beginner
```

Allowed difficulty values are `beginner`, `intermediate`, and `advanced`.

The command:

-   refuses invalid IDs and existing paths
-   copies runnable files from `labs/sample-lab/` and omits its sample-only `AUTHORING.md`
-   replaces `sample-lab` in scenario, image, allowlist, docs, and author notes
-   updates title and difficulty
-   creates student, solution, and instructor MkDocs include pages
-   leaves a schema-valid runnable clone of the sample behavior

Generated structure:

```text
labs/ftp-anonymous-access/
|-- scenario.yaml
|-- Dockerfile
|-- config.vulnerable
|-- seed.txt
|-- setup-sample.sh
|-- reload-sample-service.sh
|-- sample-service.py
|-- intentional-risk-allowlist.yaml
`-- docs/
    |-- SITREP.txt
    |-- student-guide.md
    |-- instructor-guide.md
    `-- solution-notes.md

docs/labs/
|-- ftp-anonymous-access.md
|-- ftp-anonymous-access-solution.md
`-- ftp-anonymous-access-instructor.md
```

The clone is not finished. It is a known-good baseline that should remain
runnable while sample behavior is replaced. Delete or rename sample files only
after removing all matching references from Dockerfile and `scenario.yaml`.

## Learn the Sample Before Replacing It

`sample-lab` is a real catalog scenario, not inert pseudocode. It demonstrates:

-   one target service and the auto-generated workstation
-   one explicit private network
-   a commented optional safe application-endpoint pattern
-   a vulnerable baseline config copied into a named volume
-   synthetic seed data initialized once
-   a shared student-editable config volume
-   a service-local admin account using the student's lab password
-   a single narrow sudo reload helper
-   behavior and persistence objectives
-   authorized-use and health guardrails
-   complete student, instructor, SITREP, and solution boundaries

Read `labs/sample-lab/docs/AUTHORING.md` side-by-side with every sample file.
Run the sample once after deployment before using it as a template. Seeing its
vulnerable, fixed, broken, and reset behavior makes later checker design easier.

## Choose a Topology Pattern

### Pattern A: Standalone Service

Use for SSH, LDAP, FTP, SMB, SNMP, SMTP, DNS, banner, and many database labs.

```text
workstation --> target service
```

Usually needed:

-   one custom target image
-   one private network (implicit default is enough)
-   optional shared configuration volume
-   target port exposed only inside the student network
-   no `app_port_base`

### Pattern B: Service With Dependent Application

Use only when continuity of an actual dependent service is pedagogically
important, such as an application using a database/cache.

```text
workstation --> target service <-- dependent app
workstation --------------------> dependent app
```

Add guardrails proving the dependent app remains healthy after hardening. Do
not invent a demo app for every lab; unnecessary services increase build time,
failure modes, and student cognitive load.

### Pattern C: Proxy, Firewall, or Segmentation

```text
workstation -- external net --> middlebox -- internal net --> target
```

Declare networks explicitly. List the workstation-facing network first because
labctl attaches the workstation to the first declared network. Attach the
middlebox to both networks. Add only the capability required by the lesson,
commonly `NET_ADMIN` for an in-container firewall.

For more complex segmentation, add uniquely named service keys for each client,
server, and middlebox. Even if two containers use the same image, each instance
must have a distinct service key because runtime container names derive from
that key.

### Pattern D: Custom Workstation

The shared workstation image already includes common Linux security clients.
If a future lab needs another client, extend `thesis-labs/workstation-base` in a
lab-specific Dockerfile, add that image under `build.images`, and set
`services.workstation.image` to it. Do not modify the global workstation image
for a tool needed by only one lab.

## Author `scenario.yaml`

`scenario.yaml` is the API between instructor-authored scenario code and four
platform consumers: labctl, Ansible image deployment, portal rendering, and
checker evidence. It must contain machine-consumed values only.

### Identity, Story, and Documentation

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

### Access Ports

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

### Lifecycle

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

### Build Images

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

### Services and Resources

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

### Workstation

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

### Networks

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

### Containers

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

The authoritative implementation comments are at
`platform-images/lab-service-base/entrypoint.sh`.

Available `$platform` values include lab/student IDs, runtime project, injected
student password, ttyd credential, bind IP, computed SSH/browser/app ports,
platform name, and deployed lab source root. Use tokens only in string values.

## Build the Target Image

Start vulnerable service images with:

```dockerfile
FROM thesis-labs/lab-service-base:1.0
```

Then:

1. Install only required packages.
2. Remove package-manager caches.
3. Create a service-admin user only if student remote administration needs it.
4. Grant one narrow sudo helper rather than unrestricted sudo.
5. Copy baseline config, seed, setup hook, and service scripts from the lab root.
6. Document only internal ports with `EXPOSE`.
7. Keep secrets synthetic and clearly marked.

The deployment host is RHEL 9.6 `ppc64le`. Verify package repositories, base
image manifests, downloaded binaries, and source builds support that
architecture. Do not assume an `amd64`-only release archive will work.

When teaching an exact vulnerable version, pin and verify it. If source is
downloaded during build, use an authoritative URL and checksum. Current
production advice in docs must still recommend a supported release, not merely
the historical first patched version.

## Create Baseline, Seed, and Setup Artifacts

### Vulnerable Configuration

`config.vulnerable` must contain the complete state Reset restores. Comments may
identify intentional teaching risk for authors, but student-facing files must
not hand out the remediation.

### Seed Data

Seed only enough fake data to prove impact. Use obviously synthetic names,
domains, tokens, hashes, addresses, and records. Add deterministic setup so
repeated starts do not duplicate or corrupt state.

### Setup Hook

Use an idempotent POSIX shell hook when generic entrypoint variables are not
enough. Typical work:

-   initialize data on first boot
-   generate lab-local keys/certificates
-   create target users/groups
-   expose a student-readable credential/path file
-   prepare logs and permissions

Do not put required manual VM commands in the guide. Convert them to image,
setup, scenario, Ansible, or documentation source.

### Student Discoverability

Every credential and path used by `solution-notes.md` must be available to a
student through one of these:

-   portal Workstation Access page
-   `SITREP.txt`
-   a student-readable file inside the lab
-   a value discoverable from target configuration or service behavior

Operator-only knowledge is not a valid solution dependency.

## Design the Checker

The checker is assessment and operational evidence, not proof of conceptual
mastery. It should observe technical outcomes accurately and explain failures.

### State Model

Authors declare conditions only for `vulnerable` and `fixed` per criterion.
labctl synthesizes:

| Observed state | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| `vulnerable`   | Criterion matched vulnerable condition                         |
| `fixed`        | Criterion matched fixed condition                              |
| `unknown`      | Command exited zero but matched neither, or a guardrail failed |
| `error`        | Command exited nonzero or checker execution failed             |
| `partial`      | Overall objectives contain a mix of vulnerable and fixed       |

Overall fixed requires all objectives fixed and all guardrails passing.

### Objective Versus Guardrail

Use `objective` for a state students must change. Use `guardrail` for behavior
that must remain healthy before and after the fix.

Good objective examples:

-   unauthenticated access blocked
-   weak account locked
-   overbroad network trust removed
-   persistent config uses secure directive
-   restricted principal cannot perform forbidden write

Good guardrail examples:

-   authorized read still works
-   key-based SSH still works
-   dependent app remains healthy
-   target service remains reachable
-   forwarding path remains valid

### Condition Operators

Each command emits deterministic output and each state uses one implemented
condition:

| Operator                | Match                                 |
| ----------------------- | ------------------------------------- |
| `output_contains: text` | Text occurs in combined stdout/stderr |
| `output_eq: text`       | Trimmed stdout equals text            |
| `output_ne: text`       | Trimmed stdout differs from text      |
| `exit_code: n`          | Process exit equals integer           |
| `exit_code_ne: n`       | Process exit differs from integer     |

Prefer `output_eq` with short tokens. A shell expression returning status alone
can use exit-code conditions, but output tokens produce clearer evidence.

### Checker Command Rules

-   Run from `workstation` when testing student/attacker-visible behavior.
-   Run inside target only for configuration/runtime facts unavailable externally.
-   Bound every network or potentially blocking command.
-   Use `2>&1` deliberately when parsing client errors.
-   Emit a third unmatched token for ambiguous service responses.
-   Avoid changing state; if a write proves permissions, remove test data afterward.
-   Do not classify service-down behavior as successful hardening.
-   Increment checker version when criterion meaning or implementation changes.

### Bidirectional Coverage Matrix

Build this before writing the student guide:

| Criterion | Kind                | Student remediation goal | Instructor assessment | Solution outcome   | Regression test  |
| --------- | ------------------- | ------------------------ | --------------------- | ------------------ | ---------------- |
| `<name>`  | objective/guardrail | `<documented outcome>`   | `<evidence>`          | `<command result>` | `<one mutation>` |

Two checks are mandatory:

1. Every checker criterion maps to a documented goal, assessment, and solution outcome.
2. Every assessed security/continuity outcome maps back to a checker criterion.

Missing either direction is a blocking design bug.

## Write Documentation in Safe Order

Write documentation in this order so the student guide can be checked against a
complete answer key:

1. `docs/solution-notes.md`
2. `docs/instructor-guide.md`
3. `docs/SITREP.txt`
4. `docs/student-guide.md`

### Solution Notes

This is the sole answer key. Every ordinary `bash` block must run through the
student CLI path from its stated context. Include:

-   root cause
-   exact impact demonstration
-   exact persistent remediation
-   every workstation-to-service SSH transition
-   hidden password prompts using the portal-provided lab password
-   service validation/reload behavior
-   expected failures/disconnects and postconditions
-   exact verification matching checker outcomes
-   design rationale

Never include operator `labctl`, Podman, Ansible, x01 filesystem, or hidden
solver shortcuts.

### Instructor Guide

Use only template-defined level-2 sections. Include measurable objectives,
phase evidence, progressive reveal policy, common mistakes with interventions,
all checker states, feedback interpretation, and teaching notes. Link to
solution notes rather than copying commands.

### SITREP

Keep it brief: situation, numbered mission, useful student paths, browser guide
URL, credential source when needed, and SSH fallback. Do not include exact fix,
directive, secret, or command sequence.

### Student Guide

Write last. It is guided discovery, not a walkthrough. It may contain exactly
one standard command: `cat ~/SITREP.txt`. Otherwise it should provide:

-   natural scenario narrative
-   measurable outcomes
-   concrete prerequisites and official references
-   guiding investigation questions
-   tool families, not exact commands/flags
-   impact students must prove
-   remediation goal and constraints, not config lines
-   three progressive hints without exact values
-   verification outcomes and portal Run Check
-   feedback/reflection reminder

Compare it directly with solution notes. Remove copied commands, exact
credentials, exact config values, and restart sequences.

### MkDocs Include Pages

The generator creates three one-line files. They must contain only their exact
snippet include. MkDocs 1.6 discovers student pages automatically; solution and
instructor pages build but are excluded from navigation and protected by Nginx.
No manual navigation edit is needed.

## Document Intentional Risk

Every real lab needs `intentional-risk-allowlist.yaml`. Each finding includes:

-   stable slug ID
-   scanner/tool name
-   exact files
-   exact rule or literal pattern
-   at least 20 characters explaining why risk is required for teaching

The allowlist documents a narrow, deliberate finding. It is not a broad scanner
exclusion. Dummy credentials must visibly look fake/demo/example/lab-only.

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

When rolling out platform-level labctl/runtime changes such as the read-only
source-mount enforcement introduced with this authoring kit, include `labctl`:

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
source changes. A normal new lab does not require a frontend build.

When rolling out platform-level schema or instructor-document protection changes
such as this authoring kit itself, deploy all affected backend/docs/proxy tags:

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

## Live End-to-End Verification

Static validation proves structure, not behavior. A lab is not done until tested
on x01 through the same path a student uses.

### Pass A: Vulnerable to Fixed

1. Start a fresh instance from the portal.
2. Run checker immediately; all objectives should show vulnerable and all
   guardrails should pass.
3. Execute every solution-notes Bash block exactly from the student workstation.
4. Confirm documented outputs and credentials/paths are discoverable.
5. Run checker; every objective and guardrail should pass, overall `fixed`.

### Pass B: Broken-Service Guardrail

1. From a fixed instance, stop/break only target service through a student-
   reachable lab action.
2. Run checker.
3. Confirm outcome is `unknown` or `error`, never `fixed`.
4. Restore service and confirm fixed state returns.

### Mutation Coverage

For every objective, make one small regression from fixed state. Confirm the
matching criterion fails while unrelated criteria retain honest results. This
catches checkers that only recognize one exact canonical solution or miss a
documented requirement.

### Reset

1. Use portal Reset.
2. Confirm volumes and generated state return to complete vulnerable baseline.
3. Run checker and confirm initial vulnerable state plus healthy guardrails.
4. End the test lab and confirm resources are removed.

### Concurrent Isolation When Capacity Allows

Use two test students when evaluating scale. Confirm unique names, ports,
volumes, and networks; no cross-student connectivity; and independent checker
results. Current deployment admission limits may permit only one concurrent lab,
so coordinate this test only when concurrent capacity is configured.

## Troubleshooting

| Symptom                                             | Likely cause                                                | Fix                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `additional properties are not allowed`             | Field not in schema or wrong nesting                        | Compare exact sample/schema location; do not invent API fields                   |
| Scenario ID mismatch                                | Directory, `id`, docs URLs, or allowlist differ             | Use generator and one lowercase slug everywhere                                  |
| Missing resource error                              | Service has no matching resource entry                      | Add CPU/memory for every service including workstation                           |
| Unknown network/hostname                            | Typo in network, `depends_on`, or `exec_in`                 | Use declared network names and container hostnames exactly                       |
| Missing Dockerfile                                  | Build context plus Dockerfile path resolves incorrectly     | Keep both paths relative and inside lab directory                                |
| Image missing on x01                                | Source deployed without image rebuild or build failed       | Run `lab-source,lab-images`; inspect ppc64le/package failure                     |
| Service never healthy                               | Start command, config, permissions, or health command wrong | Test image logs; use native bounded health probe                                 |
| Shared config is read-only                          | UID/GID or setup permissions differ between containers      | Follow sample UID 1000/shared-volume pattern or use nested SSH                   |
| Nested SSH fails                                    | Admin user/password/helper missing or PTY capability issue  | Check `LAB_ADMIN_USER`, injected password, sudoers helper, `AUDIT_WRITE`         |
| Checker reports `unknown`                           | Output matched neither declared condition                   | Run exact command in `exec_in`, inspect token and client errors                  |
| Checker reports `error`                             | Command exited nonzero                                      | Handle expected failures explicitly; preserve nonzero for real diagnostic errors |
| Checker hangs                                       | Client command has no timeout                               | Add `timeout` or service-specific connect/read timeout                           |
| Fixed achieved by stopping service                  | Missing health/continuity guardrail                         | Add service-health and legitimate-use guardrails                                 |
| Stop/Start loses fix                                | Edited unmounted file or process-only state                 | Move config/data to named volume and test persistence                            |
| Reset remains fixed                                 | Baseline image/config or setup idempotency wrong            | Ensure Reset destroys volume and baseline source is vulnerable                   |
| Student guide validation fails                      | Missing/extra H2, official references, or hint ladder       | Match templates exactly and keep hints inside Remediate                          |
| Student guide leaks answer                          | Exact solution block/value copied                           | Rewrite as outcome, question, tool family, or progressive hint                   |
| MkDocs include missing                              | Generator not used or stub edited                           | Recreate exact one-line files under `docs/labs/`                                 |
| Student docs visible but instructor docs return 401 | Expected protection for student identity                    | Authenticate as instructor; do not weaken Nginx                                  |
| New lab absent from portal                          | x02 scenario source/cache not refreshed                     | Deploy `management.yml --tags docs` and verify scenario validates                |

## Final Release Checklist

### Concept and Safety

-   Scenario is research-grounded or clearly labeled enrichment.
-   Misconfiguration, impact, remediation, and legitimate behavior are precise.
-   No forbidden host/kernel/runtime-socket/privileged requirement exists.
-   All data, accounts, domains, keys, and credentials are synthetic.
-   Target package/image works on RHEL 9.6 `ppc64le`.

### Package

-   `labs/<lab-id>/scenario.yaml` exists and ID matches directory.
-   Sample service names/text/files have been replaced or deliberately retained.
-   Dockerfile extends shared service base where appropriate.
-   Baseline config and setup recreate vulnerable state deterministically.
-   Intentional-risk allowlist covers deliberate scanner findings only.
-   Every service and workstation has explicit limits.
-   Vulnerable ports remain private unless safe publication is justified.

### Checker

-   At least one objective exists.
-   Every command is bounded and emits deterministic tokens.
-   Behavior, persistent state, legitimate use, and health are covered as needed.
-   Bidirectional docs/checker coverage matrix has no gaps.
-   Vulnerable, fixed, partial/regression, broken, and reset behavior is tested.

### Documentation

-   Solution notes are complete and student-CLI executable.
-   Instructor guide contains assessment/reveal/feedback guidance, not copied solution.
-   SITREP contains mission, paths, guide, and credential source without fix hints.
-   Student guide was written last and passes anti-spoiler review.
-   Three MkDocs include files contain only exact snippet directives.
-   Student page is public; solution/instructor pages require instructor auth.

### Verification and Deployment

-   Scaffold contract passes.
-   Scenario, checker-shell, and intentional-risk validators pass.
-   Python syntax passes for every lab Python file.
-   Full pre-commit passes without bypass.
-   All three Ansible syntax checks pass.
-   x01 lab source/images and x02 docs/metadata are deployed through Ansible.
-   `verify-platform.yml` passes.
-   Fresh live student-path pass, mutation/guardrail checks, and Reset pass.

Only then update the record task from `review` to `done` and assign the lab to
real teaching groups.
