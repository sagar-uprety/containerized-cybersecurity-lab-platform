# Web Server Vulnerability Mitigation

You've been assigned as a security assessor for a small research lab. During a
routine asset inventory, a legacy web server was discovered still running on the
internal network. No one on the current team knows when it was last updated, and
management wants to know whether it is safe to keep online. Your job is to assess
the server, determine whether it poses a risk, and apply an immediate protective
fix if it does.

## Why This Matters

"It still works, why touch it?" is how most breachable systems stay breachable.
Missing or delayed updates are the second most common misconfiguration operators
report about their own systems (Dietrich et al., ACM CCS 2018), and the
consequences are on the record: the Equifax breach that exposed 143 million
people's data traced to a patch that had been released months earlier and simply
never deployed. A 2025 Internet scan found 53.54% of exposed web servers running
end-of-life software (Deng et al., IEEE S&P 2025), and the 2025 Verizon DBIR
reports that vulnerabilities in the CISA Known Exploited catalog are
mass-exploited in a median of about five days.

The judgment this lab builds is vulnerability assessment as an operational
habit - version, advisory, exposure, mitigation - rather than as a one-off
exploit exercise.

## Objectives

By the end of this lab you should be able to:

-   Identify the exact software and version a running service reports, and look up whether that version has known vulnerabilities
-   Read a security advisory (CVE) well enough to understand what the vulnerability allows and how it is triggered
-   Demonstrate that a known vulnerability is genuinely exploitable against this specific server, not merely present in theory
-   Apply a compensating configuration control that closes the attack path when upgrading is not immediately possible
-   Explain the difference between virtual patching and an actual upgrade, and why the vulnerable binary still needs replacing

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic HTTP and web server concepts (what a web server does, URL paths, and how requests are handled)
-   What a CVE (Common Vulnerabilities and Exposures) entry is and how to read a security advisory
-   Basic Linux file editing and service management (editing configuration files and restarting services)

If you need to review these topics, see:

-   Apache HTTP Server documentation: <https://httpd.apache.org/docs/2.4/> (Getting Started and URL Mapping sections)
-   CVE program overview: <https://www.cve.org/About/Overview>
-   HTTP basics: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **legacy web server**
sits on the same isolated lab network.

Paths and access you will need:

-   `/lab/apache` - the web server's configuration directory, mounted directly into your workstation so you can edit it in place with any editor. Its main file is `httpd.conf`.
-   **Web-server admin account** - reloading the service requires the server's administrative account, `apacheadmin`. Its password is your lab password, and its privileges are deliberately limited to the supported service-management path. Inspect those privileges and use that path after saving a valid configuration.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any
time. **Reset** restores the original vulnerable baseline, so it is not a way to
reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on
the portal's Workstation Access page.

## Your Mission

1. Identify the web server and determine exactly what software and version it is running.
2. Research whether that version has any publicly known vulnerabilities, and understand what they allow.
3. Demonstrate that the vulnerability is real against this specific server, using only the lab environment.
4. Apply a protective configuration fix that blocks the attack path without upgrading the software, while keeping normal requests working.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What web server software is running, and what version does it report?
-   Is that version associated with any publicly known security issues? What do the advisories say the issue allows?
-   Can you demonstrate that a known vulnerability is actually exploitable against this specific server, rather than just plausibly present?

Standard Linux networking tools and HTTP clients are installed on the
workstation. Command shapes to start from:

```bash
nmap -sV -p <port> <target-host>
curl -sI http://<target-host>:<port>/
curl -s "http://<target-host>:<port>/<path>"
```

**Proving impact:** Establish that the vulnerability has real consequences on
this server - that a crafted request returns something it should not. Identifying
the version and citing the CVE is the start; showing the server actually behaving
insecurely is the proof. Use only what the lab environment provides.

## Remediate

Now apply a protective fix.

**Goal:** When you are done: a crafted request can no longer escape the intended
web content or reach files outside it, while ordinary requests to the site still
succeed. You are applying a compensating configuration control - the vulnerable
binary itself remains unpatched and would still need a real upgrade in
production; this lab does not claim to fix the software.

**Constraints:** Changes must survive a service restart. Editing alone is not
enough - the server only picks up configuration changes when it restarts.

**Where to work:** The configuration directory is mounted at `/lab/apache`; edit
`/lab/apache/httpd.conf` in place from the workstation. Reloading requires the
`apacheadmin` account's limited service-management privilege - inspect what it is
allowed to do and use that path after saving a valid configuration. The portal's
**Reset** action restores the vulnerable baseline, so it is not the right tool
for reloading a fix.

**References:**

-   Official documentation: <https://httpd.apache.org/docs/2.4/mod/mod_alias.html>
-   Local: `man httpd.conf`, `/usr/local/apache2/bin/httpd -V`

**If you're stuck:**

-   The attack abuses how the server maps a request path onto the filesystem and which locations it is willing to serve or execute from. Think in terms of least privilege: which directories genuinely need to be reachable or runnable, and which are exposed only because the default left them open?
-   Compare the server's filesystem-root access policy with the features it has loaded and the URL mappings around the affected path. The fix tightens what the server is willing to do, rather than patching the flaw itself.
-   Apache's core authorization, CGI, and URL-mapping documentation together describe the least-privilege configuration that closes the path while leaving the site serving normally.

## Verify

After applying your mitigation, confirm both of the following:

1. The crafted request no longer returns sensitive file content
2. The normal home page still serves successfully

Connection success alone is not enough - check the actual response. Use the same
tools from your investigation to re-check. When satisfied, click **Run Check** in
the portal.

## Real-World Context

The specific flaw in this lab (a path-traversal and remote-code-execution issue
in a well-known Apache 2.4.49 release) is a stand-in for a much larger pattern.
Deng et al. found that more than half of the exposed web servers and MySQL
servers they scanned were running end-of-life versions - not obscure software,
but mainstream services left un-upgraded. Dietrich's operator interviews explain
why: "time pressure" and "everything has to be fast" defer the patch, the service
keeps working, and the window between a public advisory and an exploit keeps
shrinking. The Verizon DBIR's five-day median for mass exploitation of catalogued
vulnerabilities is the size of that window now.

The mitigation you applied is what practitioners call virtual patching:
tightening configuration to block the attack path when you cannot upgrade
immediately. It buys time, and it is a legitimate emergency control - but it is
not a substitute for replacing the vulnerable binary, and treating it as one is
its own trap. The honest version of "we mitigated it" is "we bought ourselves the
time to upgrade properly".

What would catch this earlier in production: an asset inventory that records
software versions and cross-references them against advisories automatically;
alerting when a running service matches a Known Exploited Vulnerability; and a
patch cadence that does not depend on someone remembering the legacy box exists.

**Sources:**

-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE S&P 2025. <https://doi.org/10.1109/SP61157.2025.00164>
-   CVE-2021-41773 (Apache HTTP Server 2.4.49 path traversal). <https://www.cve.org/CVERecord?id=CVE-2021-41773>

---

_When you're done, end the lab through the portal and complete the feedback form.
Take a moment to reflect on what you learned - what surprised you, what you'd do
differently, and how this applies beyond this specific scenario._
