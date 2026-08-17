# Network Zone Isolation and Access Control - Instructor Guide

## Lab Overview

The environment models a three-zone deployment: a public web application in a
DMZ, and a database plus a file share in an internal zone, all reachable only
through a single gateway container (`firewall-host`). In the vulnerable
baseline the gateway's `iptables` `FORWARD` chain has an unconditional
`ACCEPT` policy, so the gateway forwards traffic to the database (3306) and
file share (445) exactly as freely as it forwards the legitimate web path
(80). A student positioned at the DMZ vantage point (the workstation, on the
same network as the gateway) can reach every backend zone with no additional
foothold. A complete remediation replaces the `FORWARD` policy with a
default-deny ruleset plus one explicit allow rule for the web path, verified
against both the live and persisted ruleset, while keeping the web
application reachable.

## Learning Objectives

| #   | Objective                                                                                                   | Assessment Criteria                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Map which hosts and zones exist in a multi-tier environment and identify where a boundary is missing.       | Student can describe the three zones, which host bridges them, and which cross-zone paths currently exist.                                                            |
| 2   | Demonstrate what a position in one zone grants access to in adjacent zones when no boundary exists.         | Student produces evidence (scan output, a live query, a retrieved file) that the database and file share are reachable and functioning, not just that a port answers. |
| 3   | Apply a default-deny gateway policy that permits only the cross-zone path a business function requires.     | Student's `FORWARD` chain uses a `DROP` default policy with an explicit allow rule scoped to the web path only.                                                       |
| 4   | Verify that a zone boundary blocks unauthorized cross-zone access without breaking the service it protects. | Student demonstrates blocked reachability to 3306/445 and continued 200 responses on the web path, both from the DMZ vantage point.                                   |
| 5   | Explain why least privilege applies to network paths, not only to user accounts or credentials.             | Student can articulate, in a debrief, why "the database has a password" does not substitute for "the database is unreachable from the DMZ."                           |

## Safety and Scope Boundaries

-   **Contained blast radius:** all five containers run on isolated Podman
    networks scoped to this lab instance (`external`, `dmz`, `internal`).
    `firewall-host` is the only container attached to more than one network;
    `database` and `file-server` are single-homed on `internal` and have no
    route out of the lab topology. `NET_ADMIN` is granted only to
    `firewall-host`, which is the intended point of remediation.
-   **Synthetic data only:** the database seed is three fake customer rows
    with `@example.invalid` addresses; the file share holds one placeholder
    text file. Neither contains real personal data, and no database
    credential is used or required anywhere in this lab - the
    impact-demonstration and checker paths both rely on unauthenticated
    reachability evidence only.
-   **Intentional risks:** the unconditional `FORWARD ACCEPT` baseline
    (`config.vulnerable`) is the deliberate finding students are meant to
    discover and correct.
-   **Student boundaries:** students work only within the lab's own
    containers and networks. They must not attempt to reach hosts outside
    the lab topology, introduce real credentials, or run platform operator
    commands (`labctl`) directly - all lifecycle actions go through the
    portal.
-   **Instructor recovery:** if a student's `iptables` edit locks out even
    the legitimate web path or breaks the gateway's own SSH reachability,
    **Reset** in the portal destroys and recreates every container, which
    restores the original vulnerable baseline (including a fresh
    `firewall-host`). Reset is not a way to reload only the student's fix -
    it discards it.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orient      | Student can state that a single gateway fronts three zones and that "the web app is public" does not establish what else the gateway forwards.                                                                                |
| Investigate | Student scans or probes the gateway's port surface, then proves at least one internal service is not merely open but functional (a real query or file retrieval), not just an `nc` connect.                                   |
| Remediate   | Student edits the gateway's active and persisted `FORWARD` ruleset to a default-deny policy with one explicit allow rule, reasoning about why a broad "drop these two ports" rule is more fragile than "allow only this one." |
| Verify      | Checker reports `fixed`; student can independently show 3306/445 blocked and port 80 still returning `200`, all from the same DMZ vantage point used during investigation.                                                    |

## Reveal Policy and Intervention

| Trigger                                                                                            | Instructor Response                                                                                            |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Student asks for help before investigating                                                         | Redirect to the investigation questions; do not confirm or deny findings.                                      |
| Student found open ports but stopped at "the port is open" without proving reachable data or files | Ask what evidence would convince a skeptical manager that this is a real exposure, not a scan artifact.        |
| Student blocked all forwarding, including the web path, and believes the lab is solved             | Ask which of the Verify conditions they can currently demonstrate for the web application specifically.        |
| Student is editing rules on `web-server`, `database`, or `file-server` instead of the gateway      | Ask them to trace, hop by hop, which host actually decides whether a packet crosses a zone boundary.           |
| Student stuck after all three written hints                                                        | State plainly that exactly one host in this topology can enforce a zone boundary, and ask them to identify it. |

**Do not reveal:** the specific `iptables` rule syntax, the `FORWARD` policy
value, the destination port to allow, or the reload command - these come
from the student working through `man iptables` and the guide's official
reference link. If a student cannot get there after the full hint ladder and
the one additional sentence above, record it as guide-design evidence rather
than handing over the ruleset from `solution-notes.md`.

## Common Mistakes

-   **Editing service-container firewalls instead of the gateway:** students
    familiar with per-host firewalls sometimes look for rules on
    `database` or `file-server`. How to address: ask them which single host
    every cross-zone packet must pass through, based on their own topology
    map from Investigate.
-   **Blocking by port number only, everywhere:** a broad `DROP` for
    3306/445 without a `FORWARD` default-deny policy is fragile - it forgets
    every other port an attacker might try next. How to address: ask what
    happens if a fourth internal service existed tomorrow; would their rule
    still hold?
-   **Forgetting the persisted ruleset:** editing only the live `iptables`
    state (not `/etc/iptables/rules.v4`) passes a live check but fails a
    reload or restart. How to address: ask what happens to their fix if the
    gateway container restarts right now.
-   **Not verifying the web path after the fix:** a `DROP`-everything policy
    with no allow rule "solves" cross-zone access by breaking the legitimate
    service too. How to address: ask them to demonstrate the web
    application still works, from the same vantage point they used to prove
    the original exposure.

## Checker States

| State        | Condition                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Both `db_zone_isolation` and `fileserver_zone_isolation` report the database and file share reachable from the DMZ vantage point, and `fw_policy_enforced` finds no default-deny policy. Both guardrails are healthy.                                                                              |
| `fixed`      | Both objectives report the database and file share blocked, `fw_policy_enforced` confirms a default-deny `FORWARD` policy with only the port-80 exception in both the live and persisted ruleset, and both guardrails remain healthy (forwarding path intact, web application still serving 200s). |
| `partial`    | One objective (e.g. the database) is fixed but the other (e.g. the file share) is not, or the ruleset check disagrees with the live-reachability checks - this usually means the student edited the live state but not the persisted file, or vice versa.                                          |

## Interpreting Feedback

-   A confidence gap where students rate themselves high on "I understand
    network segmentation" before the lab but report the Remediate phase as
    the hardest part usually means they understood the concept abstractly
    but had never located an actual enforcement point in a real topology -
    worth calling out explicitly in debrief.
-   Low clarity scores paired with stuck-point text mentioning "which
    container" or "which host" point at the **Your Lab Environment**
    section under-explaining the gateway's role; consider making the
    single-enforcement-point fact more prominent there.
-   Stuck-point text describing attempts to fix `database` or `file-server`
    directly (rather than the gateway) signals the topology diagram in
    Investigation needs to make the gateway's bridging role more visually
    obvious before students start editing rules.
-   Free text praising the "aha" of seeing a live SQL query succeed through
    the gateway (rather than just an open port) indicates the impact-first
    investigation design is working as intended for this lab; short
    "port scan only" completions without that step suggest reinforcing the
    guidance to prove functional access, not just port state.

## Teaching Notes

-   Emphasize in debrief that the database and file share were never
    individually misconfigured - the lesson is entirely about the one host
    that decides what crosses a zone boundary, and that "compromise one
    service, reach everything" is a property of missing segmentation, not
    of any single service's own hardening.
-   Research grounding: Soll (EDUCON 2023) built a teaching scenario around
    exactly this shape - a public-facing compromise granting internal reach
    with no barrier - and Dietrich (CCS 2018) names "insufficiently
    separated systems" as a formal, recurring misconfiguration category
    across production environments.
-   This lab belongs to the Design and Evaluation cycle of the guided-
    discovery FEDS process: students first construct their own mental model
    of the topology (Investigate) before being handed the remediation goal,
    then the checker's dual live/persisted verification tests whether their
    fix generalizes past the one manual test they happened to run.
-   This concept recurs in cloud security groups/VPC design, Kubernetes
    NetworkPolicy, and zero-trust micro-segmentation - all are the same
    "default deny, explicit allow, verify continuity" pattern applied to a
    different enforcement point.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full
remediation walkthrough, refer to `solution-notes.md` directly. The
instructor guide focuses on assessment, safety, intervention, and feedback
interpretation.
