# Securing an Nginx Web Server - Instructor Guide

<!-- AUTHORING NOTE: this is the survey lab. It is deliberately short and gives
exact commands so first-time participants can exercise the same Start / terminal /
edit / reload / Run Check workflow without prior advanced skill. The reveal
boundary is intentionally relaxed here (gated by the `survey-` ID prefix in the
validator). Keep the H2 order aligned with the template. -->

## Lab Overview

A small nginx site ships with two real, documented information-disclosure
weaknesses: the version banner (`server_tokens on`, CWE-200) and an open
directory listing (`autoindex on`, CWE-548) that exposes seeded synthetic files.
The student flips both directives off, reloads nginx, and re-checks. The purpose
is to evaluate the student-facing platform workflow under standardized
conditions, not to assess learning gain or advanced security skill.

## Learning Objectives

| #   | Objective                                           | Assessment Criteria                                                                    |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Recognise version-banner disclosure                 | Student shows the `Server:` header advertising the nginx version, then removes it      |
| 2   | Recognise and close a directory-listing exposure    | Student browses `/files/`, sees the exposed content, then makes the listing return 403 |
| 3   | Persist a configuration change and reload a service | Both directives set to `off` in the config file and applied via the reload helper      |
| 4   | Use the platform workflow end to end                | Student completes Start, terminal, edit, reload, Run Check, and End Lab                |

## Safety and Scope Boundaries

-   **Contained blast radius:** the nginx server and workstation run in one per-student isolated Podman network. Nothing is reachable outside the lab.
-   **Synthetic data only:** the "backup" and "notes" in `/files/` are clearly-marked demo files with fake values. No real data or credentials.
-   **Intentional risks:** `server_tokens on` and `autoindex on`. Safe because the server is disposable, isolated, and synthetically seeded.
-   **Student boundaries:** students edit the config from the workstation and reload via the `nginxadmin` SSH account's narrow sudo helper - not platform operator commands.
-   **Instructor recovery:** portal **Reset** restores the vulnerable baseline. A student who wedges nginx (invalid config) is protected by `nginx -t` in the reload helper, which refuses a bad reload; if needed, End Lab and Start again.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Orient      | Student can state that the server leaks its version and lists a private directory              |
| Investigate | `Server:` header shows a version; `/files/` returns a browsable listing with the seeded files  |
| Remediate   | Both directives set to `off` and applied via the reload helper                                 |
| Verify      | Version header reduced to `nginx`; `/files/` returns 403; home page still 200; checker `fixed` |

## Reveal Policy and Intervention

This is the survey lab, so the student guide shows the exact commands by design.
The standardized instructions allow participants to evaluate the same workflow.
Intervention is about resolving access or platform failures, not assessing
independent problem solving.

| Trigger                                       | Instructor Response                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Student unsure where to start                 | Point them to the guide's numbered steps - everything is spelled out.                              |
| Student edited the config but nothing changed | Ask whether they ran the reload step; nginx re-reads config only on reload.                        |
| Reload reports an error                       | The helper runs `nginx -t`; a syntax slip (missing `;`) is the usual cause - fix and reload again. |
| Student wants more depth                      | Point them to the Real-World Context section and the CWE references.                               |

## Common Mistakes

-   Edits the config but forgets to reload - How to address: the change only takes effect after `reload-nginx`.
-   Introduces a typo (missing semicolon) - How to address: `nginx -t` in the helper refuses the reload; the error names the line.
-   Expects Reset to keep their fix - How to address: Reset restores the vulnerable baseline; reload (not Reset) applies a fix.

## Checker States

| State        | Condition                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Version banner exposed and/or directory listing enabled; config still has an `on` directive                       |
| `fixed`      | Version banner reduced to `nginx`; `/files/` returns 403; both directives persisted `off`; home page still serves |
| `partial`    | One directive fixed but not the other (e.g. autoindex off but server_tokens still on)                             |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   Treat clarity and confidence responses as **feedback on the platform experience** (Start, terminal, edit, reload, Run Check, End Lab), not as evidence of security learning.
-   Stuck-point free text mentioning "reload" or "nothing changed" is the most common survey friction - it tells you whether the edit→reload→check loop is clear enough.
-   A participant who cannot complete even this lab signals an onboarding/tooling problem to fix before the real exercises.

## Teaching Notes

-   Both weaknesses are CIS NGINX Benchmark hardening items: `server_tokens off` (version disclosure, CWE-200) and `autoindex off` (directory listing, CWE-548).
-   Emphasise the difference in severity: the directory listing exposes real files (impactful); hiding the version reduces reconnaissance (defense in depth).
-   This is the standardized survey lab; course exercises use the research-grounded catalog labs and their guided-discovery format.

---

**Note:** This guide does not duplicate `solution-notes.md`. For the full
remediation sequence, refer to `solution-notes.md` directly. The instructor guide
focuses on assessment, safety, intervention, and feedback interpretation.
