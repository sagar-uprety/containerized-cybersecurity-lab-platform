# Sample Segmented Service (Pattern C) - Instructor Guide

<!-- AUTHORING NOTE: this is the Pattern C reference (Proxy / Firewall /
Segmentation) using an application-layer proxy (no NET_ADMIN). The firewall lab
is the packet-filter variant. Keep the H2 order aligned with the template. -->

## Lab Overview

An edge proxy bridges an external and an internal network and, in its baseline,
forwards every path to the internal backend - including an internal-only
endpoint. Students restrict the proxy so the internal path is refused while the
public path keeps working. The internal backend is unreachable directly; the
boundary is enforced by the proxy plus the network topology.

## Learning Objectives

| #   | Objective                                          | Assessment Criteria                                                          |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Identify an over-permissive boundary control       | Student shows an internal-only path reachable through the proxy from outside |
| 2   | Distinguish network reachability from proxy policy | Student shows the backend is not directly reachable, only via the proxy      |
| 3   | Restrict the boundary persistently                 | `PROXY_MODE=restricted` persisted; internal path returns 403                 |
| 4   | Preserve intended (public) traffic                 | Public path still works through the proxy after the change                   |

## Safety and Scope Boundaries

-   **Contained blast radius:** proxy, backend, and workstation run across two per-student isolated Podman networks; the backend is on the internal network only.
-   **Synthetic data only:** public records are fabricated; the internal marker is a clearly-labelled synthetic string. No real data.
-   **Intentional risks:** `PROXY_MODE=open` forwards internal paths (`intentional-risk-allowlist.yaml`). Safe because both networks are lab-only and per-student.
-   **Student boundaries:** students edit proxy config from the workstation and reload via the `proxyadmin` SSH account's narrow helper — not platform operator commands.
-   **Instructor recovery:** portal **Reset** restores `PROXY_MODE=open`. A student who wedges the proxy should End Lab and Start again.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                          |
| ----------- | ---------------------------------------------------------------------------------- |
| Orient      | Student can state that the proxy is the only path across the boundary              |
| Investigate | Internal path leaks through the proxy; backend not directly reachable              |
| Remediate   | Proxy restricted and persisted; internal path refused at the proxy                 |
| Verify      | Internal path returns 403; public path works; segmentation intact; checker `fixed` |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on state, not the clock.

| Trigger                                                      | Instructor Response                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Student asks for help before probing paths through the proxy | Redirect to the investigation questions; do not name the mode.                                                          |
| Student tries to change the backend                          | Ask which component actually decides what crosses the boundary, and whether the backend has any student-facing setting. |
| Student blocks everything, including the public path         | Ask which paths should still cross and which should not.                                                                |
| Student changed config but nothing changed                   | Ask when the proxy re-reads its configuration.                                                                          |
| Student stuck after all three written hints                  | Point at the proxy's config file and reload helper; do not give the value.                                              |

**Do not reveal:** the exact `PROXY_MODE` value or the reload command. If a student cannot reach these, record it as guide-design evidence.

## Common Mistakes

-   Tries to fix the backend - How to address: ask which component enforces the boundary.
-   Restricts the public path too - How to address: ask which paths are meant to cross.
-   Edits config but does not reload - How to address: ask when the proxy reads its config.

## Checker States

| State        | Condition                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Internal path reachable through the proxy; proxy mode still `open`                                                   |
| `fixed`      | Internal path returns 403; proxy mode persisted `restricted`; public path works; backend not directly reachable      |
| `partial`    | One objective fixed but not the other (e.g. mode persisted but a stale process still forwards), or a guardrail broke |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   A prior-vs-post confidence gap on "network reachability vs policy" is the signal for this lab's segmentation lesson.
-   Low clarity scores usually point at the topology: students who could not tell why the backend was unreachable need Your Lab Environment stated more plainly.
-   Stuck-point free text mentioning "backend" reveals students who tried to fix the wrong component - the boundary is the proxy plus the topology.
-   Confusion about which paths should cross is guide-design signal about the public-vs-internal distinction.

## Teaching Notes

-   Emphasise that segmentation is enforced by topology _and_ the middlebox's policy together - either alone is incomplete.
-   This is the application-layer Pattern C reference; the firewall lab is the packet-filter (iptables + NET_ADMIN) variant.
-   Connect to defense in depth: the internal backend is unreachable directly, and the proxy refuses internal paths - two independent controls.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, safety, intervention, and feedback interpretation.
