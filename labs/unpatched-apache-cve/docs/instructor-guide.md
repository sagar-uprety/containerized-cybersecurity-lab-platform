# Unpatched Service with Known Vulnerability - Instructor Guide

## Lab Overview

Students discover an outdated Apache HTTP Server running version 2.4.49,
identify the known CVE-2021-41773 path-traversal vulnerability, demonstrate
arbitrary file read, and apply a compensating configuration mitigation (deny
filesystem-root access, disable CGI, and remove the CGI alias/directory grant).
Apache remains 2.4.49, so this is not presented as patching the binary.

## Learning Objectives

| #   | Objective                                                   | Assessment Criteria                                                                                     |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Identify outdated software through version detection        | Student correctly identifies Apache 2.4.49 via banner/version                                           |
| 2   | Research and map a running service to a known CVE           | Student references CVE-2021-41773 and explains the path-traversal mechanism                             |
| 3   | Demonstrate exploitation in a controlled environment        | Student successfully reads `/etc/passwd` via crafted URL                                                |
| 4   | Apply a compensating control when patching is not immediate | Student hardens `<Directory />`, disables `mod_cgi`, removes the CGI mapping/grant, then reloads Apache |
| 5   | Verify service continuity after remediation                 | Student confirms the home page still serves correctly                                                   |

## Safety and Scope Boundaries

-   **Contained blast radius:** The Apache server and workstation run in a per-student isolated Podman network. The vulnerable server is reachable only inside the lab; there is no route to any external host.
-   **Synthetic data only:** The server serves placeholder web content and a sentinel file used to demonstrate traversal. No real data is present.
-   **Intentional risks:** Apache 2.4.49 with a permissive CGI/root configuration (CVE-2021-41773) is deliberately installed (`intentional-risk-allowlist.yaml`). Safe because the host is disposable, isolated, and holds no real data; the exploit cannot reach beyond the lab.
-   **Student boundaries:** Students exercise the vulnerability only against the lab server, using only the lab environment - no external exploit infrastructure or real payloads.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable baseline. Emphasise in debrief that the mitigation is virtual patching, not a real fix; the binary stays vulnerable by design.

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover  | Student identifies Apache on port 80 and version 2.4.49 from the server banner                                                                       |
| Impact    | Student demonstrates `/etc/passwd` readable via `/cgi-bin/.%2e/%2e%2e/%2e%2e/etc/passwd`                                                             |
| Remediate | Student denies root access, comments out `LoadModule cgi_module` and the CGI alias, removes the CGI directory grant, then reloads through nested SSH |
| Verify    | Portal checker reports `fixed`; exploit gets 403/404 and home page returns actual HTTP 200                                                           |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock.

| Trigger                                              | Instructor Response                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Student asks for help before identifying the version | Redirect to version detection and advisory lookup; do not name the CVE.                           |
| Student named the CVE but cannot demonstrate it      | Ask them to show the server actually returning content it should not, not just cite the advisory. |
| Student believes upgrading is the only option        | Ask what configuration-level control could block the attack path without replacing the binary.    |
| Student mitigated but broke the normal home page     | Ask them to confirm an ordinary request still succeeds, not just that the exploit fails.          |
| Student stuck after all three written hints          | Point at Apache's URL-mapping and authorization documentation; do not give the directives.        |

**Do not reveal:** the specific directives to change or the exact mitigation edits. Reinforce that this is virtual patching - the binary stays vulnerable by design. If a student cannot reach the mitigation, record it as guide-design evidence.

## Common Mistakes

-   Students try to upgrade the software instead of applying a configuration workaround - How to address: Remind them that in this scenario the goal is an immediate protective fix; upgrading requires a maintenance window and testing.
-   Students break the web server itself while trying to remove the alias - How to address: Ask which specific directive controls the alias that maps URLs to file paths.
-   Students edit the config but forget to restart Apache - How to address: Ask what happens when a service reads its configuration file on startup.
-   Students use operator-side Ansible or `labctl`, or try a broad sudo fallback - How to address: Return them to the student workstation -> `apacheadmin` SSH -> allowed restart helper path.

## Checker States

| State        | Condition                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------ |
| `vulnerable` | Path traversal to `/etc/passwd` via `/cgi-bin/.%2e/...` succeeds; home page returns 200    |
| `fixed`      | Request returns 403/404, hardened config is present, and home page returns actual HTTP 200 |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   A prior-vs-post confidence gap on "virtual patching vs upgrading" indicates whether students grasped that a compensating control buys time but does not fix the software - the central judgment this lab teaches.
-   Low clarity scores usually point at the Remediate section: students who upgraded, or tried to, instead of applying a config mitigation need the "do not upgrade the binary" constraint stated more prominently.
-   Stuck-point free text mentioning "still returns the file" or "home page broken" reveals whether the mitigation was incomplete or too aggressive - both recoverable, both worth surfacing in debrief.
-   Confusion about the `apacheadmin` reload privilege is guide-design signal: strengthen the reload-path pointer in "Your Lab Environment".

## Teaching Notes

-   Emphasize that "still works" does not mean "still secure" - the Equifax breach is a prime example of deferred patching.
-   Contrast immediate patching vs. virtual patching / compensating controls.
-   Reinforce that the checker verifies this narrow compensating control; production remediation still requires upgrading Apache.
-   Real-world reference: Deng et al. (2025) found 53.54% of affected HTTP services running end-of-life versions.
-   The lab teaches vulnerability assessment as an operational discipline, not just exploit execution.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
