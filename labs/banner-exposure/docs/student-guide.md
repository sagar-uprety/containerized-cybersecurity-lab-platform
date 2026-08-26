# Service Reconnaissance and Information Exposure

## Scenario

**Role:** Junior systems administrator

A server is being prepared for its production launch next week. Before sign-
off, the operations lead wants confirmation that nothing beyond what is
strictly necessary can be learned about the server by someone probing it from
outside, without needing any credentials.

## Why This Matters

Every network service says something about itself before anyone
authenticates - and attackers read that information first. A 2018 study of
system operators identified "publishing extended log files or version
information in connect banners" as one of the internet's most common
deployment mistakes (Dietrich et al., ACM CCS 2018). A 2024 large-scale audit
of directory services alone found nearly 12,000 servers - almost 12% of the
sample - leaking internal detail through unauthenticated metadata (Kaspereit
et al., USENIX Security 2024), and a 2025 Internet-wide measurement study
tied disclosed SSH software versions directly to attackers narrowing their
search for a working exploit, while finding tens of thousands of other
devices leaking detailed configuration through comparable unauthenticated
responses (Deng et al., IEEE S&P 2025). None of this
requires a password. It only requires someone paying attention to what a
service says when nobody's watching.

## Objectives

By the end of this lab you should be able to:

-   Perform unauthenticated reconnaissance against a host using both an
    automated scanner and a raw protocol-level tool, and explain why the two
    can disagree
-   Distinguish between "a port is open" and "here is exactly what software
    and operating system this host runs," and state why the second is
    materially more valuable to an attacker
-   Identify multiple independent channels through which the same host can
    disclose information about itself, rather than assuming one fix covers
    all of them
-   Reduce a service's self-disclosed information to the minimum needed for
    it to keep functioning, and verify the reduction without breaking
    legitimate access
-   Recognize leftover default or diagnostic content as its own category of
    information exposure, separate from service configuration

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic TCP/IP networking concepts (ports, client-server connections, and
    what it means for a service to "listen" on a port)
-   The general idea of a service identification string or "banner" - many
    network protocols announce basic facts about themselves to any client
    that connects, before any authentication happens
-   Basic HTTP structure (status codes, request/response headers)

If you need to review these topics, see:

-   Networking basics: `man ss`, `man nc`
-   HTTP headers overview: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers>
-   nmap's official reference: <https://nmap.org/book/man.html>

## Your Lab Environment

Your browser terminal starts on the **workstation**. One other host shares
the lab with you: **target-host**, which runs both an SSH service and a web
server. Your workstation reaches target-host over the lab's internal
network; target-host is not reachable from outside the lab.

Paths and access you will need:

-   **Administrator account on target-host** - if you need a shell on
    target-host itself (for example, to edit a service's configuration or
    reload it), log in over SSH as the `root` account. Its password is your
    own workstation/lab login password, shown on the portal's Workstation
    Access page (it is also already set as `$STUDENT_PASSWORD` in your
    workstation shell).

## Investigation

Before changing anything, map out exactly what this host is willing to tell
a stranger.

**Guiding questions:**

-   What does target-host say about itself the instant you connect to each
    of its services, before you've sent anything back?
-   Does asking the same question through different tools - an automated
    scanner versus a raw connection - get you the same answer, or does one
    show more than the other?
-   Beyond the services themselves, does the host serve any web content that
    was never meant to be looked at by an outside visitor?
-   What, specifically, could an outside attacker do with each piece of
    information you find - not "it's exposed," but what decision does it let
    them make next?

A network scanner, a raw TCP client, and an HTTP client are installed on the
workstation. Command shapes to start from - fill in what you discover:

```bash
nmap -sV <target-host>
nc -w 2 <target-host> <port>
curl -sI http://<target-host>/
curl -s http://<target-host>/<path>
```

**Proving impact:** A response is not a finding. For each disclosure you
locate, state exactly what detail it hands over - a software name, an exact
version, an operating system, an internal hostname, a file that was never
meant to be public - and how that detail would change what an attacker tries
next. Use only what this lab environment provides.

## Remediate

Now put it right. There is more than one disclosure here, and fixing one
does not fix the others.

**Goal:** When you are done: nothing target-host's SSH service or web server
hands an unauthenticated connection identifies the specific operating system
distribution or exact software version running underneath; nothing served
over HTTP still shows default installer content or leftover internal
diagnostic material; and all of this is true while an administrator can
still log in over SSH and the web server still answers ordinary requests.

**Constraints:** Your own administrator access to target-host must keep
working throughout, and the web server must keep answering requests.
Nothing here requires taking a service offline to fix it.

**Where to work:** Both services you investigated run on target-host
itself; edit their configuration and any served content over an SSH session
to target-host as `root` (see Your Lab Environment for how to reach it). The
portal's **Reset** action restores the vulnerable baseline, so it is not the
right tool for reloading a fix.

**References:**

-   Official documentation: <https://man.openbsd.org/sshd_config> (OpenSSH server configuration reference)
-   Official documentation: <https://httpd.apache.org/docs/current/mod/core.html> (Apache core directives reference)
-   Local: `man sshd_config`, `apache2ctl -h`, `curl --help`

**If you're stuck:**

-   Two different layers are handing out information here: the protocol-level
    identification a service sends before you've authenticated, and the
    content a web server chooses to serve. A fix that only touches one layer
    leaves the other exactly as exposed as before.
-   Look for a setting on each service that controls how much detail it
    includes about itself by default - one lives in SSH's own configuration,
    the other in the web server's. Separately, ask whether every file
    currently reachable under the web root was ever supposed to be there.
-   OpenSSH's `sshd_config` manual page documents the directive that controls
    what appears in the identification string; the Apache core directives
    reference documents the two settings that control what the `Server`
    header and generated error pages reveal.

## Verify

After applying your fix, confirm:

1. Neither service discloses the specific OS distribution or exact software
   version to an unauthenticated connection
2. Nothing served over HTTP still shows default installer content or
   leftover internal diagnostic material
3. An administrator can still log in over SSH
4. The web server still answers ordinary requests

Use the same tools from your investigation to re-check each one. When
satisfied, click **Run Check** in the portal.

## Real-World Context

The four things you just found are not a hypothetical checklist - each one
has been measured at scale. Dietrich et al. surveyed system operators and
formally named "publishing extended log files or version information in
connect banners" as a recognized deployment misconfiguration category, not
an edge case (ACM CCS 2018). Kaspereit et al. scanned directory services at
Internet scale in 2024 and found 9,731 servers - 11.85% of their sample -
leaking internal detail (user management structure, directory topology,
password policy) through metadata that required no authentication to read
(USENIX Security 2024). Deng et al.'s 2025 Internet-wide measurement went a
step further and connected disclosed SSH software versions directly to
attackers narrowing their search for a working exploit against a specific
build, while separately finding 47,117 devices leaking detailed
configuration through a comparable unauthenticated protocol (IEEE S&P 2025).

None of these findings required breaking into anything. Each service simply
told the truth about itself to whoever asked - which is precisely why this
class of exposure is so persistent: it looks harmless, costs nothing to
leave in place, and only becomes a problem in the hands of someone already
looking for a way in. What you just did - suppressing OpenSSH's distribution
tag, tightening Apache's `ServerTokens` and `ServerSignature` behavior, and
clearing out default and diagnostic content - is the exact minimal-disclosure
practice these studies point to as missing in the field.

What would catch this earlier in production: a pre-launch checklist that
treats "what does this host say to an anonymous connection" as its own
review item, separate from authentication and access control; periodic
external scanning of your own infrastructure the way an attacker would scan
it; and a rule that any diagnostic or default content is removed - not
merely unlinked - before a host goes live.

**Sources:**

-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   Kaspereit et al. (2024). LanDscAPe: Exploring LDAP Weaknesses and Data Leaks at Internet Scale. USENIX Security 2024. <https://www.usenix.org/conference/usenixsecurity24>
-   Deng et al. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE Symposium on Security and Privacy 2025.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific
scenario._
