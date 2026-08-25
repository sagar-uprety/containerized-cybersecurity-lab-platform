# Network Zone Isolation and Access Control

## Situation

**Role:** Network security engineer

A recent internal assessment gave you the same operating position an attacker
would gain after landing on the company's externally facing web application.
Leadership wants a clear picture of exactly what that position can reach across
the rest of the environment, and a plan to contain it so a single compromised
front-end host cannot become a path to everything else.

## Why This Matters

Network boundaries are one of the oldest ideas in defense-in-depth, and one
of the most commonly assumed rather than verified. Dietrich et al.'s survey
of production system operators names "insufficiently separated systems" as
one of the recurring misconfiguration categories they identified across
real environments, and the same study found that when operators were asked
why misconfigurations like this happen, 78.73% pointed to a gap in
knowledge rather than negligence or time pressure - people did not realize
a boundary they assumed existed was never actually enforced (Dietrich et
al., ACM CCS 2018). Recent large-scale measurement of firewall
configurations has found that gateway rulesets which look restrictive on
paper routinely contain gaps that expose services never meant to be reached
from outside their intended zone (Deng et al., IEEE S&P 2025).

The lesson is not that gateways are hard to configure. It is that a gateway
which forwards traffic is not the same thing as a gateway which enforces a
boundary, and the difference is invisible until someone tests it from the
attacker's position instead of the administrator's.

## Objectives

By the end of this lab you should be able to:

-   Map which hosts and zones exist in a multi-tier environment and
    determine which of them your current position can actually reach
-   Demonstrate, with functioning evidence rather than a port scan alone,
    what a foothold in one zone currently grants access to in zones that
    should be separate
-   Design and apply a boundary policy that admits only the cross-zone
    traffic a business function genuinely requires, instead of everything
    or nothing
-   Verify that a zone boundary holds under direct testing, from the same
    vantage point used to find the original exposure
-   Explain why network reachability and service functionality are two
    separate guarantees, and why a real fix has to preserve one while
    removing the other

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic TCP/IP networking concepts (ports, addresses, and what it means
    for one host to forward traffic to another)
-   What a network gateway or firewall does at a conceptual level, and the
    idea of separating a network into zones of differing trust
-   How to read and interpret basic port-scanning and connectivity-testing
    output

If you need to review these topics, see:

-   Networking basics - ports and addresses: `man ip`, `man ss`, or your
    system's networking guide
-   NIST SP 800-41 Rev. 1, Guidelines on Firewalls and Firewall Policy:
    <https://csrc.nist.gov/pubs/sp/800/41/r1/final>
-   Network segmentation concepts: <https://www.cloudflare.com/learning/network-layer/what-is-network-segmentation/>

## Your Lab Environment

Your browser terminal starts on the **workstation**, which sits in the same
network segment as the **gateway host** that fronts the organization's
public web application. Everything else in this environment - the web
application itself, an internal database, and an internal file share - sits
on networks your workstation is not directly attached to. Whatever you can
reach beyond the gateway, you can only reach through it.

Paths and access you will need:

-   **Gateway admin account** - if you need a shell on the gateway itself
    (for example, to inspect or change how it decides what to forward), log
    in over SSH as the `firewall` account. Its password is your own
    workstation/lab login password from the portal's Workstation Access
    page.

## Your Mission

1. Map what your current network position can and cannot reach, and
   identify which of those paths the environment actually requires.
2. Demonstrate, with working evidence rather than a bare port scan, what
   your position currently grants access to beyond what it should.
3. Establish a boundary at the one point in this topology capable of
   enforcing one, so that only the cross-zone traffic each business
   function genuinely needs is permitted.
4. Confirm the public-facing application you depend on keeps working
   throughout.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before changing anything, understand the environment and confirm the
problem is real - and establish exactly how far it goes.

**Guiding questions:**

-   Which host in this topology is your workstation actually able to see
    and reach directly, and what does that host, in turn, forward on to?
-   Beyond the one service you know is meant to be public, what else
    answers when you probe the gateway's other ports?
-   For anything that answers, is it merely a TCP handshake, or a live,
    functioning service you can actually use?
-   If you had to draw the intended zones in this environment - public,
    application, and internal - where does the current behavior of the
    gateway not match that intended drawing?

Network scanners, database and file-share clients, HTTP tools, and standard
Linux utilities are installed on the workstation. Command shapes to start
from - fill in what you discover:

```bash
nmap -sV -p- <target-host>
nc -zv <target-host> <port>
curl -s http://<target-host>/
mysql -h <target-host> -P <port> -u <username> -p<password> <database>
smbclient //<target-host>/<share> -N
```

Stay inside the lab network and use only the seeded demo data.

**Proving impact:** A port answering is not a finding. For anything you
find open beyond the expected public service, establish whether it is a
real, functioning backend - can you retrieve actual data or a real file
through it - not merely a connection that completes. Use only what the lab
environment provides; do not introduce outside credentials or resources.

## Remediate

Now put it right.

**Goal:** When you are done: your current position can no longer reach the
internal database or file share at all, through any path; the public web
application you depend on still returns normal responses; and both of
these hold true after the gateway restarts.

**Constraints:** The public web application must keep working throughout -
a fix that blocks every path, including the legitimate one, is not a valid
fix. Your change must survive a restart of the gateway, not just apply to
its currently running state.

**Where to work:** The one host in this topology that can decide what
crosses a zone boundary is the gateway. If you need a shell there, see
Your Lab Environment for the admin account and how to obtain its password.

**References:**

-   Official documentation: <https://www.netfilter.org/documentation/HOWTO/packet-filtering-HOWTO.html>
-   Local: `man iptables`, `man iptables-save`

**If you're stuck:**

-   A boundary that forwards everything by default is not a boundary - its
    strength comes from what it denies, not from what happens to be
    allowed today.
-   Every packet crossing between zones passes through exactly one host in
    this topology. Look at how that host currently decides whether to
    forward a new connection versus drop it, and consider what changes if
    that default flips from "allow" to "deny."
-   The official packet-filtering documentation for this gateway's firewall
    subsystem has a section on chain policies and on matching traffic by
    connection state - read the parts covering default chain policies and
    how to admit only replies to connections that were already permitted.

## Verify

After applying your fix, confirm:

1. Your current position cannot reach the internal database or file share
   at all.
2. The public web application still returns normal responses.
3. Both of the above remain true after the gateway restarts.

Use the same tools from your investigation to re-check each one. When
satisfied, click **Run Check** in the portal.

## Real-World Context

The gap you just closed - a gateway that forwards a legitimate public path
correctly while also forwarding everything else it happens to see - is a
recurring, named category rather than a one-off mistake. Dietrich et al.'s
qualitative study of production operators explicitly catalogued
"insufficiently separated systems" (their example: Internet-facing and
intranet systems with no enforced boundary between them) as one of the
misconfiguration patterns operators reported encountering, and traced most
occurrences back to a mismatch between what administrators believed was
enforced and what the configuration actually did (Dietrich et al., ACM CCS
2018). Soll's teaching-scenario research builds a nearly identical case
study for the same reason: a public-facing compromise that reaches an
internal file service is one of the clearest ways to demonstrate why
"the perimeter is protected" is not the same claim as "the internal network
is protected" (Soll, IEEE EDUCON 2023). At Internet scale, Deng et al.'s
2025 measurement of deployed firewall rulesets found that configurations
which appear restrictive on inspection routinely still expose internal
services through gaps in how forwarding rules interact with source and
destination matching (Deng et al., IEEE S&P 2025).

The pattern behind all three: a single compromised or overly trusted host
becomes a pivot point precisely because nothing downstream of it was ever
tested from its point of view. This is why lateral movement - not the
initial compromise - is what most real intrusions spend most of their time
doing, and why MITRE ATT&CK dedicates distinct techniques to internal
service and system discovery (T1046, T1018) rather than treating the
perimeter as the only boundary worth defending.

What would catch it earlier: treating every gateway or forwarding host as
untrusted-by-default and testing reachability from the vantage point of
each zone it touches, not just from outside the perimeter; reviewing
forwarding rules for what they permit by omission, not only what they
explicitly deny; and re-testing zone boundaries whenever a new service is
added behind an existing gateway, since a boundary that held yesterday can
silently stop holding the moment something new is placed behind it.

**Sources:**

-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018).
    Investigating System Operators' Perspective on Security
    Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   Soll, M. (2023). Teaching Network Security Through Realistic Attack
    Scenarios. IEEE EDUCON 2023.
-   Deng, S. et al. (2025). Measuring Firewall Misconfigurations at
    Internet Scale. IEEE Symposium on Security and Privacy 2025.

---

_When you're done, end the lab through the portal and complete the
feedback form. Take a moment to reflect on what you learned - what
surprised you, what you'd do differently, and how this applies beyond this
specific scenario._
