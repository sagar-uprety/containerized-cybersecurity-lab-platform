# Creating and Shipping a New Security Lab

This guide is for an instructor creating a lab for the first time without an automation
assistant or prior knowledge of this repository. It explains what the platform
supports, how to turn a teaching idea into a complete lab package, how to use
the runnable `sample-a-standalone`, how to validate every artifact, and how you run
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

## Guide Contents

This guide is split into pages you can read in order or jump into directly:

1. This page - platform fit, hard boundaries, roles, sources of truth
2. [Before You Start](01-before-you-start.md) - design worksheet, cloning the sample, learning it
3. [Choose a Topology Pattern](02-topology-patterns.md)
4. [Author `scenario.yaml`](03-scenario-yaml.md)
5. [Build the Image and Design the Checker](04-build-and-checker.md)
6. [Write Documentation and Declare Risk](05-documentation.md)
7. [Validate, Deploy, and Publish](06-validate-and-deploy.md)
8. [Live Verification and Release Checklist](07-verify-and-ship.md)

## Platform Fit: What This System Supports

The platform is deliberately universal within one defined scope: isolated,
configuration-driven Linux service-security labs that can run safely in
unprivileged Podman containers and can be classified through deterministic
checks.

It is not a general-purpose cyber range for every possible security exercise.
That boundary is a safety and reproducibility feature, not missing polish.

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

Changing any of these is platform architecture work, not a lab-local
workaround.

## Hard Boundaries

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
| Student             | Portal-driven start/stop/reset/check/end only - never `labctl`, Ansible, or Podman             |

When this guide shows `ansible-playbook` or `labctl` commands, **you run them**
from your workstation over the UCC VPN to the x01/x02 hosts. No CI pipeline,
GitHub Action, or workflow dispatch is required - everything is operator-run.

## Sources of Truth

Use these in this order:

2. `labs/templates-contract/scenario.schema.json` defines accepted machine fields.
3. `labs/sample-a-standalone/` is the runnable, commented authoring reference.
4. `platform-images/lab-service-base/entrypoint.sh` defines exactly what the
   shared service base does with every `LAB_*` environment variable before,
   during, and after your service starts - read it, don't infer its behavior
   from the sample alone.
5. `labs/templates-contract/STUDENT_GUIDE_TEMPLATE.md` defines student-guide sections.
6. `labs/templates-contract/INSTRUCTOR_GUIDE_TEMPLATE.md` defines instructor-guide sections.
7. Existing real labs show scenario-specific variations, not new contracts.

Do not copy Redis-specific names or behavior into unrelated labs. Redis is one
real implementation; `sample-a-standalone` is the neutral authoring starting point.
