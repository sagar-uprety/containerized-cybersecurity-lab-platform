# Unpatched Service with Known Vulnerability

You've been assigned as a security assessor for a small research lab. During a
routine asset inventory, a legacy web server was discovered still running on the
internal network. No one on the current team knows when it was last updated, and
management wants to know whether it is safe to keep online. Your job is to
assess the server, determine if it poses a risk, and apply an immediate
protective fix if it does.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic HTTP and web server concepts (what a web server does, URL paths, and how requests are handled)
-   What a CVE (Common Vulnerabilities and Exposures) entry is and how to read a security advisory
-   Basic Linux file editing and service management (editing configuration files and restarting services)

If you need to review these topics, see:

-   Apache HTTP Server documentation: <https://httpd.apache.org/docs/2.4/> (Getting Started and URL Mapping sections)
-   CVE program overview: <https://www.cve.org/About/Overview>
-   HTTP basics: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation and a web server on an isolated
lab network. Use the portal to **Start Lab**, **Run Check**, **Reset**, or
**End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What web server software is running, and what version does it report?
-   Is this version associated with any publicly known security issues?
-   Can you demonstrate that a known vulnerability is actually exploitable against this specific server?

Use standard Linux networking tools and HTTP clients to explore the environment.

**Proving impact:** Once you've identified the issue, demonstrate that it
has real consequences. Use only what the lab environment provides - do not
introduce real credentials or external resources.

## Remediate

Now fix the issue.

**Goal:** Block the attack path by removing the configuration entry point that
allows the path traversal to succeed.

**Constraints:** Changes must survive a service restart.

**References:**

-   Official documentation: <https://httpd.apache.org/docs/2.4/mod/mod_alias.html>
-   Local: `man httpd.conf`, `/usr/local/apache2/bin/httpd -V`
-   Restart: `sudo /usr/local/sbin/restart-apache` (reload the server after configuration changes)

**If you're stuck, here are hints to help without giving away the answer:**

-   Think about how a web server decides which directories are allowed to execute scripts.
-   Look for the module and alias configuration that enables script execution in a specific directory.
-   Check the official Apache module documentation for how to disable a loaded module and remove a directory alias.

## Verify

After applying your fix, confirm that the vulnerability is no longer
exploitable and that the server still serves normal web requests.

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback form. Take a moment to reflect on what you learned - what surprised you, what you'd do differently, and how this applies beyond this specific scenario._

---

**Note:** This file lives at `labs/unpatched-apache-cve/docs/student-guide.md`. The MkDocs include at `docs/labs/unpatched-apache-cve.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
