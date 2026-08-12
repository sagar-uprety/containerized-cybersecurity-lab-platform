# Sample Dependent App (Pattern B) - Instructor Guide

<!-- AUTHORING NOTE: this is the Pattern B reference (Service With Dependent
Application). Clone it when hardening a shared service must not break a dependent
app. Keep the H2 order aligned with INSTRUCTOR_GUIDE_TEMPLATE.md. -->

## Lab Overview

A shared records backend returns data to anyone without authentication. A
dependent application reads from it. Students enable access control on the
backend and reconfigure the app with the backend's credential so it keeps
working. The lesson is Pattern B's defining constraint: harden a shared service
without breaking its dependents.

## Learning Objectives

| #   | Objective                                                 | Assessment Criteria                                                                     |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Identify unauthenticated access to a shared service       | Student shows the backend returns records with no credential                            |
| 2   | Enforce authentication on the shared service persistently | `ACCESS_CONTROL=enabled` in the backend config volume; unauthenticated read returns 401 |
| 3   | Preserve dependent-app continuity                         | Student gives the app the backend credential; `/summary` still returns records          |
| 4   | Apply changes so they survive a restart                   | Edits on the named config volumes plus a reload of each service                         |

## Safety and Scope Boundaries

-   **Contained blast radius:** backend, app, and workstation run in one per-student isolated Podman network. Nothing is reachable outside the lab.
-   **Synthetic data only:** two fabricated records and one clearly-marked demo token (`sample-demo-token`). No real data or credentials.
-   **Intentional risks:** `ACCESS_CONTROL=disabled` on the backend baseline (`intentional-risk-allowlist.yaml`). Safe because the topology is per-student and isolated.
-   **Student boundaries:** students edit config from the workstation and reload via the `appadmin` SSH account and its narrow sudo helpers — not platform operator commands.
-   **Instructor recovery:** portal **Reset** restores the vulnerable baseline (backend disabled, app token empty). A student who wedges either service should End Lab and Start again.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Orient      | Student can state that a shared service feeds a dependent app and why that couples their security |
| Investigate | Unauthenticated read of the backend succeeds; student identifies the app as a dependent consumer  |
| Remediate   | Backend access control enabled and persisted; app given the matching credential; both reloaded    |
| Verify      | Backend read returns 401; app `/summary` still returns records; both healthy; checker `fixed`     |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock — this lab's characteristic failure is fixing the backend and forgetting the app.

| Trigger                                                   | Instructor Response                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Student asks for help before probing the backend directly | Redirect to the investigation questions; do not name the setting.                           |
| Student enabled backend auth and the app broke            | Ask what the app now needs to present to the backend, and where the app keeps that value.   |
| Student set a token but the app still fails               | Ask whether the app's token matches the backend's, and whether both services were reloaded. |
| Student changed config but nothing took effect            | Ask when each service re-reads its configuration.                                           |
| Student stuck after all three written hints               | Point at the app's own config file and the reload helpers; do not give the values.          |

**Do not reveal:** the exact `ACCESS_CONTROL` value, the token, or the reload commands. If a student cannot reach these, record it as guide-design evidence.

## Common Mistakes

-   Hardens the backend, forgets the app - How to address: ask which of the Verify conditions currently fails and why.
-   Sets a mismatched app token - How to address: ask where the backend's expected credential is defined.
-   Edits config but does not reload - How to address: ask when a service reads its configuration file.

## Checker States

| State        | Condition                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Backend returns records unauthenticated; backend config still `disabled`                                                      |
| `fixed`      | Unauthenticated backend read returns 401; backend config persisted `enabled`; app still serves records; both services healthy |
| `partial`    | One objective fixed but not the other (e.g. config persisted but a stale process still serves), or a guardrail broke          |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   A prior-vs-post confidence gap on "hardening without breaking dependents" is the signal for this lab's core Pattern B lesson.
-   Low clarity scores usually point at the two-part remediation: students who fixed only the backend need the app-continuity constraint stated more plainly.
-   Stuck-point free text mentioning "app broke" or "502"/"401" reveals the intended teaching moment landed — the fix required reconfiguring the dependent, not only the shared service.
-   Confusion about reloading two separate services is guide-design signal about the multi-service admin model.

## Teaching Notes

-   Emphasise that coupling security to a dependent service is the norm, not the exception (apps behind databases and caches).
-   This is the runnable Pattern B reference; `redis-exposed` is the research-grounded Pattern B lab in the catalog.
-   Connect to the general principle: a shared service's authentication decision propagates to every consumer.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, safety, intervention, and feedback interpretation.
