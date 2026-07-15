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

**Goal:** Apply a compensating configuration mitigation that prevents crafted
paths from escaping the intended web content while keeping normal requests
available. Reduce unnecessary exposure and restore least-privilege access around
the affected request path. The Apache 2.4.49 binary remains vulnerable and still
needs a production upgrade; this lab does not claim to patch it.

**Constraints:** Changes must survive a service restart. Editing alone isn't
enough - Apache only picks up configuration changes when it restarts.

**Where to work:** The server's configuration directory is mounted directly
into your workstation at `/lab/apache`, so you can edit it in place with any
editor. Reloading the service requires the server's administrative account,
`apacheadmin`. Its password is your lab password, and its privileges are
deliberately limited to the supported service-management path. Inspect those
privileges and use that path after saving a valid configuration.

**References:**

-   Official documentation: <https://httpd.apache.org/docs/2.4/mod/mod_alias.html>
-   Local: `man httpd.conf`, `/usr/local/apache2/bin/httpd -V`

**If you're stuck, here are hints to help without giving away the answer:**

-   Think about how a web server decides which directories are allowed to execute scripts.
-   Compare the filesystem-root policy with loaded features and URL mappings around the affected path.
-   Check Apache's core authorization, CGI, and URL-mapping documentation for the least-privilege configuration.

## Verify

After applying your mitigation, confirm that the crafted request no longer
returns sensitive file content. Also confirm that the normal home page still
serves successfully; connection success alone is not enough.

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback form. Take a moment to reflect on what you learned - what surprised you, what you'd do differently, and how this applies beyond this specific scenario._

---

**Note:** This file lives at `labs/unpatched-apache-cve/docs/student-guide.md`. The MkDocs include at `docs/labs/unpatched-apache-cve.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
