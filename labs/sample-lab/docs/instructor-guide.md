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

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| Scenario    | Student identifies the records service as the scoped target and uses only dummy data     |
| Investigate | Unauthenticated request returns seeded records; active configuration explains the result |
| Remediate   | Persistent shared configuration is changed and the narrow reload helper succeeds         |
| Verify      | Unauthorized request returns 401; authorized records and health endpoint still work      |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                               |
| ----- | ---------------------- | ------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | Ask whether network location alone should grant permission to read records.           |
| 2     | Student stuck > 10 min | Direct attention to the active configuration exposed through the shared lab path.     |
| 3     | Student stuck > 20 min | Point out that the service has a constrained reload helper and uses the lab password. |

Do not reveal the exact configuration value or remediation command before the
third hint. If a student can explain the intended state but is blocked by shell
syntax after the third hint, use `solution-notes.md` as the command reference.

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

-   Student guide: outcomes, questions, references, and progressive hints.
-   Instructor guide: assessment criteria, intervention policy, and feedback use.
-   Solution notes: exact student-executable commands and expected results.
-   SITREP: mission, deliverables, useful paths, and guide URL only.
-   `scenario.yaml`: machine-consumed topology, limits, builds, and checks only.

Read `/docs/instructor/new-lab-setup/` before cloning this package. The global
guide explains scenario patterns for all selected lab families, validation,
deployment, live verification, and platform limits.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
