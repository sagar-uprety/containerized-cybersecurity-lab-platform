# Sample Custom Workstation (Pattern D) - Instructor Guide

<!-- AUTHORING NOTE: this is the Pattern D reference (Custom Workstation). The
topology is standalone (Pattern A); the point is the lab-specific workstation
image. Keep the H2 order aligned with INSTRUCTOR_GUIDE_TEMPLATE.md. -->

## Lab Overview

A standalone records service returns data without authentication. Students enable
access control and reload the service. The distinguishing feature is the
workstation: it runs a lab-specific image that adds the HTTPie `http` client on
top of the shared workstation base, demonstrating how to give one lab an extra
tool without changing the global image.

## Learning Objectives

| #   | Objective                                    | Assessment Criteria                                                                |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Identify unauthenticated access to a service | Student shows records returned with no credential                                  |
| 2   | Enforce authentication persistently          | `ACCESS_CONTROL=enabled` persisted; unauthenticated read returns 401               |
| 3   | Preserve authorized access                   | Authorized (token) read still returns records                                      |
| 4   | Use the lab-provided client tooling          | Student successfully uses the workstation's HTTPie client (or curl) to investigate |

## Safety and Scope Boundaries

-   **Contained blast radius:** service and workstation run in one per-student isolated Podman network. Nothing is reachable outside the lab.
-   **Synthetic data only:** two fabricated records and one demo token (`sample-demo-token`). No real data.
-   **Intentional risks:** `ACCESS_CONTROL=disabled` baseline. Safe because the service is disposable and isolated.
-   **Student boundaries:** students edit config from the workstation and reload via the `recadmin` SSH account's narrow helper - not platform operator commands.
-   **Instructor recovery:** portal **Reset** restores the vulnerable baseline. A student who wedges the service should End Lab and Start again.
-   **Build note:** this lab builds two images - the service and the custom workstation (`thesis-labs/sample-d-custom-workstation-ws:latest`). Both must be built on the lab worker before the lab can start; if `http` is missing on the workstation, the custom image was not built or not wired.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                 |
| ----------- | ----------------------------------------------------------------------------------------- |
| Orient      | Student can state the service returns records without authentication                      |
| Investigate | Unauthenticated read succeeds, demonstrated with curl or the HTTPie client                |
| Remediate   | Access control enabled and persisted; service reloaded                                    |
| Verify      | Unauthenticated read returns 401; authorized read works; service healthy; checker `fixed` |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on state, not the clock.

| Trigger                                                         | Instructor Response                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Student asks for help before requesting records unauthenticated | Redirect to the investigation questions; do not name the setting.                                                |
| Student cannot find the HTTPie client                           | Confirm the lab's workstation is the custom image; `http --help` should work. curl is an equally valid fallback. |
| Student changed config but nothing changed                      | Ask when the service re-reads its configuration.                                                                 |
| Student stuck after all three written hints                     | Point at the config file and reload helper; do not give the value.                                               |

**Do not reveal:** the exact `ACCESS_CONTROL` value or the reload command. If a student cannot reach these, record it as guide-design evidence.

## Common Mistakes

-   Edits config but does not reload - How to address: ask when the service reads its configuration.
-   Assumes HTTPie is in the base workstation - How to address: explain the custom workstation image; curl is always available as a fallback.

## Checker States

| State        | Condition                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `vulnerable` | Service returns records unauthenticated; config still `disabled`                                     |
| `fixed`      | Unauthenticated read returns 401; config persisted `enabled`; authorized read works; service healthy |
| `partial`    | One objective fixed but not the other, or a guardrail broke                                          |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   Because the vulnerability is deliberately simple, low clarity scores here more likely reflect the tooling/wiring narrative than the security concept.
-   Stuck-point free text mentioning "http: command not found" indicates the custom workstation image was not built or wired - an infrastructure signal, not a student one.
-   Confidence gaps are less informative for this lab than for the research-grounded labs; treat it primarily as an authoring reference.

## Teaching Notes

-   Emphasise the wiring: `build.images` builds the workstation image, and `services.workstation.image` points labctl at it. Do not modify the shared workstation base for a single-lab tool.
-   HTTPie is a stand-in; the pattern applies to any client a lab needs that the base lacks.
-   The three research-grounded topology patterns are exercised by real catalog labs; this reference exists to make the custom-workstation wiring copy-pasteable.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, safety, intervention, and feedback interpretation.
