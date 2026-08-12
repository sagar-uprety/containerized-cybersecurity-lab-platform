# <Lab Title> - Instructor Guide

## Lab Overview

<Two to four sentences: what the environment contains, what the student is expected to discover, and what a complete remediation looks like. Written for an instructor scanning it five minutes before a session.>

## Learning Objectives

| #   | Objective   | Assessment Criteria                                         |
| --- | ----------- | ----------------------------------------------------------- |
| 1   | <objective> | <what you should see or hear from a student who has met it> |
| 2   | <objective> | <how to assess>                                             |

## Safety and Scope Boundaries

-   **Contained blast radius:** <what the vulnerable service can and cannot reach; which Podman networks are isolated>
-   **Synthetic data only:** <what seeded data exists and confirmation that it contains no real personal data, credentials, or customer records>
-   **Intentional risks:** <the deliberate weaknesses declared in intentional-risk-allowlist.yaml, and why each is safe in this topology>
-   **Student boundaries:** <what students must not do - attack hosts outside the lab network, introduce real credentials, or use platform operator commands>
-   **Instructor recovery:** <how to restore a lab a student has broken beyond the checker's guardrails, and what Reset does and does not undo>

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Orient      | <student can state the risk class and why it matters operationally>                                      |
| Investigate | <what students should find, and what distinguishes proof from a superficial finding>                     |
| Remediate   | <what students should change and the reasoning they should be able to give>                              |
| Verify      | <what the checker should report, and what the student should be able to demonstrate independently of it> |

## Reveal Policy and Intervention

| Trigger                                                                            | Instructor Response                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Student asks for help before investigating                                         | Redirect to the investigation questions; do not confirm or deny findings. |
| <state-based trigger, e.g. "student proved exposure but cannot locate the config"> | <point to scope, not to the setting>                                      |
| <state-based trigger, e.g. "student fixed one layer and believes they are done">   | <ask which of the Verify conditions they can currently demonstrate>       |
| Student stuck after all three written hints                                        | <the one additional sentence you may give, still short of the command>    |

**Do not reveal:** <the specific values, directives, or commands that must come from the student, no matter how long they struggle. If a student cannot get there, record it as guide-design evidence in the feedback analysis rather than handing over the answer.>

## Common Mistakes

-   <Mistake>: <why students make it> - How to address: <what to ask them>
-   <Mistake>: <why students make it> - How to address: <what to ask them>

## Checker States

| State        | Condition                                                                |
| ------------ | ------------------------------------------------------------------------ |
| `vulnerable` | <condition>                                                              |
| `fixed`      | <condition>                                                              |
| `partial`    | <if the scenario defines multiple objectives, what a mixed result means> |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   <What a prior-vs-post confidence gap indicates for this lab's specific concept>
-   <Which low clarity score points at which section of this lab's guide>
-   <Which specific words or phrases in stuck-point free text reveal which misconception>
-   <What free text tells you about guide design rather than student ability>

## Teaching Notes

-   <Key concept to emphasise in debrief>
-   <Research grounding: which measurement study this lab models, with the figure worth quoting>
-   <Which FEDS evaluation episode this lab belongs to>
-   <Where this concept recurs beyond this service>

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, safety, intervention, and feedback interpretation.
