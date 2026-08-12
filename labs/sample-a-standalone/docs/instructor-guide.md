# Sample Lab: Access Control Misconfiguration - Instructor Guide

## Lab Overview

This runnable reference lab shows the complete platform contract with a small,
synthetic records service. Students prove that records are readable without
authorization, enable the service's access-control mode in persistent
configuration, reload it through a constrained administration helper, and
verify that unauthorized access is blocked while authorized access and health
remain intact.

The lab is deliberately generic. Instructors should use its structure and
checker patterns as a starting point, then replace its service, story, evidence,
commands, and documentation with scenario-specific content.

## Learning Objectives

| #   | Objective                                 | Assessment Criteria                                                |
| --- | ----------------------------------------- | ------------------------------------------------------------------ |
| 1   | Explain default-deny access control       | Student explains why network reachability is not authorization     |
| 2   | Demonstrate unauthorized information read | Student produces only synthetic records without presenting a token |
| 3   | Apply a persistent configuration fix      | Shared configuration enables access control and survives reload    |
| 4   | Preserve required behavior                | Authorized access and service health remain available              |

## Safety and Scope Boundaries

-   **Contained blast radius:** The records service and workstation run in a per-student isolated Podman network. Nothing is reachable outside the lab.
-   **Synthetic data only:** The service returns fabricated sample records and a dummy authorization token. No real data or credentials are present.
-   **Intentional risks:** Access control is disabled in the baseline (`ACCESS_CONTROL=disabled`) and a dummy token is seeded (`intentional-risk-allowlist.yaml`). Safe because the service is disposable, isolated, and synthetically populated.
-   **Student boundaries:** Students stay on the lab network, use only synthetic data, and apply changes through the service's narrow reload helper — not platform operator commands.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable baseline and discards the fix. If a student wedges the service, End Lab and Start again.

<!-- AUTHORING NOTE: this is the reference instructor guide. Keep this section, its
heading, and the H2 order aligned with INSTRUCTOR_GUIDE_TEMPLATE.md when copying. -->

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| Scenario    | Student identifies the records service as the scoped target and uses only dummy data     |
| Investigate | Unauthenticated request returns seeded records; active configuration explains the result |
| Remediate   | Persistent shared configuration is changed and the narrow reload helper succeeds         |
| Verify      | Unauthorized request returns 401; authorized records and health endpoint still work      |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock. (This is the reference instructor guide: it models a state-triggered intervention table rather than a clock-based hint ladder.)

| Trigger                                                        | Instructor Response                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Student asks for help before making an unauthenticated request | Redirect to the investigation questions; do not name the setting.                                               |
| Student retrieved a record but cannot say why                  | Ask whether the service checked identity before returning data, and where that decision is configured.          |
| Student changed the running service but not persistent config  | Ask whether their change would survive a reload, and which file holds the persistent setting.                   |
| Student stuck after all three written hints                    | Point at the configuration file's own inline comments and the constrained reload helper; do not give the value. |

**Do not reveal:** the exact configuration value or remediation command. If a student can explain the intended state but is blocked only by shell syntax after all three hints, `solution-notes.md` is the command reference of last resort.

## Common Mistakes

-   Student changes a copy outside `/lab/sample` - How to address: ask which path is backed by the named shared volume.
-   Student changes configuration but does not reload - How to address: ask whether observed runtime behavior has consumed the new file.
-   Student blocks every request - How to address: ask how the checker proves legitimate authorized use still works.
-   Student hardcodes a different token - How to address: ask why credential rotation should not require changing checker source.
-   Student interprets a healthy endpoint as proof of security - How to address: separate availability evidence from access-control evidence.

## Checker States

| State        | Condition                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Both objective checks observe unauthorized access and disabled persistent configuration; guardrails pass |
| `partial`    | Synthesized when one objective is fixed and the other remains vulnerable                                 |
| `fixed`      | Unauthorized access is blocked, persistent config is hardened, and both guardrails pass                  |
| `unknown`    | A check emits an unrecognized token or a guardrail no longer matches expected healthy behavior           |
| `error`      | A checker command exits nonzero or lab execution fails                                                   |

Criterion intent:

-   `sample_unauthorized_access` is an objective behavior check.
-   `sample_persistent_config` is an objective persistence check.
-   `sample_authorized_access` is a legitimate-use guardrail.
-   `sample_service_healthy` is an availability guardrail.

## Interpreting Feedback

Use combined feedback responses to improve both the sample and future labs:

-   Low clarity scores may indicate that hostnames, useful paths, or credential discovery are missing.
-   Repeated reports of reload difficulty may indicate a broken admin helper or undiscoverable lab-password path.
-   Students who fix behavior but not persistent state may need stronger explanation of volumes and reset behavior.
-   Students who break authorized access may need more support distinguishing objectives from guardrails.
-   Free text is qualitative design evidence, not a grading signal or behavioral-risk score.

## Teaching Notes

The target misconception is that a service on an internal network can trust any
client that reaches it. Emphasize that network placement and authentication are
different controls, and that a secure change must preserve legitimate use.

For lab authors, this guide models the boundary among artifacts:

-   Student guide: outcomes, questions, references, progressive hints, and the
    always-visible Your Lab Environment / Your Mission facts (paths, access,
    deliverables — formerly in SITREP.txt).
-   Instructor guide: assessment criteria, safety, intervention policy, and feedback use.
-   Solution notes: exact student-executable commands and expected results.
-   `scenario.yaml`: machine-consumed topology, limits, builds, and checks only.

Read `/docs/instructor/new-lab-setup/` before cloning this package. The global
guide explains scenario patterns for all selected lab families, validation,
deployment, live verification, and platform limits.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
