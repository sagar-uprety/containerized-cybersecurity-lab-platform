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

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover  | Student identifies Apache on port 80 and version 2.4.49 from the server banner                                                                       |
| Impact    | Student demonstrates `/etc/passwd` readable via `/cgi-bin/.%2e/%2e%2e/%2e%2e/etc/passwd`                                                             |
| Remediate | Student denies root access, comments out `LoadModule cgi_module` and the CGI alias, removes the CGI directory grant, then reloads through nested SSH |
| Verify    | Portal checker reports `fixed`; exploit gets 403/404 and home page returns actual HTTP 200                                                           |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                       |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | The vulnerability is related to how the server handles special URL-encoded characters in paths.               |
| 2     | Student stuck > 10 min | Look at the modules loaded and the aliases configured in the main configuration file.                         |
| 3     | Student stuck > 20 min | See <https://httpd.apache.org/docs/2.4/mod/mod_alias.html> and search for CVE-2021-41773 official advisories. |

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

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that "still works" does not mean "still secure" - the Equifax breach is a prime example of deferred patching.
-   Contrast immediate patching vs. virtual patching / compensating controls.
-   Reinforce that the checker verifies this narrow compensating control; production remediation still requires upgrading Apache.
-   Real-world reference: Deng et al. (2025) found 53.54% of affected HTTP services running end-of-life versions.
-   The lab teaches vulnerability assessment as an operational discipline, not just exploit execution.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
