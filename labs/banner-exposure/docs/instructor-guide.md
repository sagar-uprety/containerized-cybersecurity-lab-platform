# Service Banner and Debug-Page Information Disclosure - Instructor Guide

## Lab Overview

`target-host` runs SSH and Apache at their verbose out-of-the-box defaults:
the SSH identification string discloses the Debian distribution build, the
Apache `Server` header and error-page footer disclose the exact version, OS,
and module set, the stock installer landing page is still being served, and
an orphaned internal diagnostic page is still reachable. Students perform
unauthenticated reconnaissance against all four, demonstrate what an attacker
would learn from each, then edit two configuration files and replace/remove
two static pages so that only minimal, non-identifying information is
exposed - without breaking SSH administrator access or the web server itself.

## Learning Objectives

| #   | Objective                                                                     | Assessment Criteria                                                                                                |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Use nmap and a raw TCP tool to perform unauthenticated service reconnaissance | Student runs `nmap -sV` and grabs a raw banner with `nc`/`telnet` and explains the output                          |
| 2   | Assess what a disclosed banner or debug page gives an attacker                | Student states, in their own words, how a version string narrows a CVE search                                      |
| 3   | Distinguish transport-, application-, and content-layer information leaks     | Student identifies that the SSH banner, HTTP header, error footer, and debug page are four separate leaks, not one |
| 4   | Configure a service to minimize its self-disclosed banner                     | Student edits the correct directive on each service and reloads without a config error                             |
| 5   | Remove leftover default and debug content from a production-facing host       | Student replaces the default page and deletes the diagnostic page rather than merely unlinking it                  |
| 6   | Verify a fix without breaking legitimate access                               | Student confirms SSH administrator login and HTTP reachability still succeed after hardening                       |

## Safety and Scope Boundaries

-   **Contained blast radius:** `target-host` and the workstation run in a
    single per-student Podman network. `target-host` is never published to
    the host; it is reachable only from the student's own workstation
    container.
-   **Synthetic data only:** The internal diagnostic page contains entirely
    fabricated lab-internal hostnames, RFC 1918 addresses, and an obviously
    fake token (`intentional-risk-allowlist.yaml`). No real personal data,
    credentials, or infrastructure detail is present anywhere in the lab.
-   **Intentional risks:** SSH's `DebianBanner yes` and Apache's
    `ServerTokens Full` / `ServerSignature On` are the deliberate vulnerable
    baseline; both are purely informational and do not themselves grant
    access to anything. This is safe only because the container is
    per-student and isolated.
-   **Student boundaries:** Students stay inside the lab network, probe only
    `target-host`, and use only the seeded/fabricated content - never
    platform operator commands or real external targets.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable
    baseline and discards a student's fix; it does not repair a workstation a
    student has wedged. To fully recover, End Lab and Start again.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Investigate | Student runs `nmap -sV` and a raw banner grab, and separately inspects HTTP headers, a generated error page, the default page, and finds the debug page - naming all four leaks, not just the first one found |
| Investigate | Student can state what an attacker gains from each (targeted CVE search, technology fingerprinting, internal topology hints) beyond "a port is open"                                                          |
| Remediate   | Student edits the SSH banner directive and the Apache `ServerTokens`/`ServerSignature` directives, validates config before reloading, and replaces/removes the two static pages                               |
| Verify      | Student re-runs the same recon commands and confirms every earlier finding is gone, and separately confirms SSH login and HTTP reachability still work                                                        |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them.
Escalate on the student's state, not the clock.

| Trigger                                                                                  | Instructor Response                                                                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Student asks for help before running any reconnaissance                                  | Redirect to the investigation questions; do not confirm or deny what is exposed.                                      |
| Student finds the SSH banner but stops there                                             | Ask what other unauthenticated responses the same host gives - point at HTTP, not just the port they already checked. |
| Student fixes `ServerTokens` but leaves the error-page footer or the default/debug pages | Ask which of the Verify conditions they can currently demonstrate - most will have skipped one or two.                |
| Student believes the lab is done once `Run Check` first shows partial progress           | Ask them to name, out loud, all four things a stranger could learn about this host before they started.               |
| Student stuck after all three written hints                                              | Point at the relevant section of the official docs; do not name the directive or file path.                           |

**Do not reveal:** the exact directive names, file paths, or the specific
`sed`/heredoc commands from `solution-notes.md`. If a student cannot reach
these independently, record it as guide-design evidence.

## Common Mistakes

-   Students stop after fixing the SSH banner and assume the lab is done -
    How to address: Ask what a browser (not just `nc`) would see if it
    connected to this same host right now.
-   Students set `ServerTokens Prod` but forget `ServerSignature Off` - How
    to address: Ask them to trigger a 404 and read the whole response, not
    just the headers.
-   Students edit the default page but leave the internal diagnostic page in
    place - How to address: Ask whether every file under the web root was
    actually meant to be public.
-   Students `mv` or rename the debug page instead of removing it - How to
    address: Ask whether an attacker who already found the filename once
    would try the same path again after a rename, and what "removed" should
    actually mean here.
-   Students reload/restart a service incorrectly and lock themselves out -
    How to address: Ask them to validate configuration syntax before
    reloading, and to keep a second terminal open to confirm the reload
    succeeded.

## Checker States

| State        | Condition                                                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | SSH banner discloses the Debian tag; Apache `Server` header and error footer disclose full version/OS; the default installer page is served; the diagnostic page returns 200; SSH login and HTTP both still work                                                                             |
| `fixed`      | SSH banner no longer discloses the OS; Apache `Server` header reads only `Apache`; the error footer signature line is gone entirely; the default page has been replaced; the diagnostic page returns 404; SSH login and HTTP both still work                                                 |
| `partial`    | Some of the five objective checks report `fixed` and others still report `vulnerable` - most commonly the SSH banner and/or `Server` header fixed while the error-page footer, default page, or diagnostic page are untouched, since students tend to find and fix disclosures one at a time |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   A confidence gap between "before" and "after" on "is this actually a
    vulnerability" indicates the misconception this lab targets directly:
    many students start the lab believing banner text is cosmetic. If that
    gap is small, the Why This Matters section and the debrief citations are
    not landing.
-   Low clarity scores concentrated on Remediate usually mean students could
    not tell there were four separate things to fix, not one - strengthen
    the plural framing ("services" and "pages", not "the service") in Your
    Mission rather than adding more hints.
-   Stuck-point free text mentioning only "SSH" or only "Apache" reveals a
    student who fixed one surface and assumed the checker's `partial` result
    meant something was broken, rather than that another surface was
    untouched.
-   Free text about the debug page ("didn't know it was there", "how would
    I even find that") is guide-design signal about whether the Investigation
    section's guiding questions pushed students to look beyond the first
    two obvious ports.

## Teaching Notes

-   Emphasize that this lab intentionally uses OpenSSH's Debian-specific
    banner behavior and Apache's default `ServerTokens Full`/`ServerSignature
On` combination to make the disclosure maximally visible for teaching
    purposes; do not describe every field deployment as this verbose by
    default (some distributions ship less verbose defaults already).
-   Frame the four leaks (SSH banner, HTTP header, error-page footer, orphaned
    debug page) as one lesson, not four: information disclosure accumulates
    across independent code paths, and "I fixed the service" rarely means
    every surface of that service was addressed.
-   Real-world reference: Dietrich et al. (CCS 2018) name "publishing extended
    log files or version information in connect banners" as a distinct,
    operator-recognized misconfiguration category; Kaspereit (USENIX Security 2024) found 11.85% of a large LDAP sample leaking comparable internal
    detail through unauthenticated metadata; Deng (IEEE S&P 2025) ties
    disclosed SSH versions directly to targeted CVE exploitation at scale.
-   This lab is a strong precursor to deeper hardening labs (e.g., SSH
    authentication hardening): reconnaissance is normally the first phase of
    any real intrusion, and this lab isolates that phase on its own.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full
remediation walkthrough, refer to `solution-notes.md` directly. The
instructor guide focuses on assessment, safety, intervention, and feedback
interpretation.
