# The Exposed Order Cache

You've been assigned as the junior administrator for a small order-processing
application. Monitoring has flagged unusual direct connections to the
application's cache service - connections that do not appear to come from the
application itself. The cache holds customer data, order state, session tokens,
and internal configuration. The order application still works, but nobody has
checked what else can reach the cache.

## Why This Matters

In-memory caches are deployed for speed, and speed is usually the only thing
anyone tests. An Internet-scale study of six cloud providers found 12,276
misconfigured NoSQL data stores, and 87.2% of them were not merely readable but
writable by anyone who connected (Ferrari et al., ACSAC 2020). ENISA's 2024
threat landscape names exposed caching services as a current significant risk,
and the 2025 Verizon DBIR keeps "data stores put on the network without
controls" among its top error varieties year after year.

The lesson is not that caches are dangerous. It is that a data store which
accepts whatever the network hands it will eventually be handed something you
did not send.

## Objectives

By the end of this lab you should be able to:

-   Explain why a service's default configuration is a deployment decision rather than a safe starting point
-   Determine which network paths a service actually needs, and demonstrate that it is unreachable on the others
-   Distinguish authentication from authorization, and grant an application only the permissions its workload requires
-   Demonstrate the difference between read exposure and write exposure, and explain why write access to a live cache is the more serious finding
-   Verify each control independently instead of trusting a single check

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic TCP/IP networking concepts (ports, interfaces, binding, and local vs. remote addresses)
-   What an in-memory key-value cache is and why applications use one
-   The difference between network access and authentication (being able to reach a service vs. being authorized to use it)

If you need to review these topics, see:

-   Redis documentation overview: <https://redis.io/docs/latest/> (what Redis is and common use cases)
-   Networking basics - ports and addresses: `man ip`, `man ss`, or your system's networking guide
-   Authentication vs. authorization: <https://csrc.nist.gov/glossary/term/authentication> and <https://csrc.nist.gov/glossary/term/authorization>

## Your Lab Environment

Your browser terminal starts on the **workstation**. Two other hosts share the
lab with you: the **cache server**, which is attached to two separate networks,
and the **demo order application**. Your workstation reaches the cache server
over a client-facing network. The order application talks to it over a separate
application network. Which of those paths the cache actually needs is one of the
things you are here to work out.

Paths and access you will need:

-   `/lab/redis` - the cache server's configuration directory, mounted so you can read and edit it from the workstation
-   `/lab/demo-app` - the order application's configuration, including how it connects to the cache
-   **Cache server admin account** - if you need a shell on the cache server itself (for example, to restart the service after a configuration change), log in over SSH as the `redisadmin` account. Its password is your own workstation/lab login password from the portal's Workstation Access page.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any
time. **Reset** restores the original vulnerable baseline, so it is not a way to
reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on
the portal's Workstation Access page.

## Your Mission

1. Map the lab network and establish how the cache service is reachable, and from where.
2. Establish what the cache asks of a client before it accepts commands.
3. Demonstrate the real consequence of what you found, using only the seeded demo data - and show whether the exposure is limited to reading.
4. Put the cache on a sound footing without breaking the order application or your own ability to administer it.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before changing anything, understand the environment and confirm the problem is
real - and establish how far it goes.

**Guiding questions:**

-   Which hosts and services answer on each of the lab networks?
-   The cache server sits on two networks. Which one does the order application use, and which one is your workstation on?
-   Does the cache ask anything of a client before accepting commands?
-   What can a client that never presented credentials read? Is reading the limit of what it can do?
-   How sensitive is the data you can see, and what would change for the business if someone altered it?

Network scanners, the cache service's own command-line client, HTTP tools, and
standard Linux utilities are installed on the workstation. Command shapes to
start from - fill in what you discover:

```bash
nmap -sV -p- <target-host>
redis-cli -h <target-host> -p <port> <COMMAND>
curl -s http://<app-host>:<port>/
```

Stay inside the lab network and use only the seeded demo data.

**Proving impact:** "A port is open" is not a finding. Establish what an
unauthorized client can actually obtain from this cache, and whether it is
confined to reading. A cache that can be _modified_ by an outsider is a
different class of problem from one that can merely be read - make clear which
one you are looking at, and what an attacker could achieve with it against a
live order flow. Use only what the lab environment provides.

## Remediate

Now put it right. One control alone will not get you there.

**Goal:** When you are done: no client on the client-facing network can reach
the cache service at all; no unauthenticated client can read or write cached
data; the order application can still read the data it needs but can no longer
modify it; an administrator can still connect and perform maintenance; and all
of this is still true after the service restarts.

**Constraints:** The order application depends on the cache and must keep
working throughout. Your changes must survive a service restart. The
application should hold the minimum permissions its workload requires, not
administrative access.

**Where to work:** The cache configuration is at `/lab/redis` and the
application's own configuration is at `/lab/demo-app`; both are editable from
your workstation. Restarting the cache service requires a shell on the cache
server - see Your Lab Environment for the admin account. The portal's **Reset**
action restores the vulnerable baseline, so it is not the right tool for
reloading a fix.

**References:**

-   Official security documentation: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/>
-   Access control reference: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/>
-   Local: `man redis.conf`, `redis-cli --help`

**If you're stuck:**

-   Two separate questions are hiding in this scenario: who can reach the service at all, and who is permitted to do what once connected. A fix that answers only one of them leaves the other wide open.
-   Decide which network path the application genuinely needs before you touch anything else. Then consider that this service offers more than one way to authenticate, and that only one of them can express "this client may read, but not write".
-   The official security documentation has a dedicated page for the permission system - it covers defining named users, dealing with the default one, and making the server load your definitions at startup. The application's configuration reference shows which connection fields it is able to send.

## Verify

After applying your fixes, confirm each of the following independently:

1. The cache is unreachable from the client-facing network
2. An unauthenticated client can no longer read or write cached data
3. The order application can still read data, and can no longer modify it
4. An administrator can still connect and perform maintenance
5. All of the above is still true after the service restarts

Use the same tools from your investigation to re-check each one. Confirming a
single layer is not evidence for the others. When satisfied, click **Run Check**
in the portal.

## Real-World Context

The configuration you just corrected is one of the most heavily measured
misconfigurations in the literature. Ferrari et al. scanned 67,725,641 addresses
across six cloud providers and found 12,276 misconfigured NoSQL services; 1,532
of the exposed instances were Redis. The striking figure is not the exposure
count but the permission state: **87.2% of exposed databases were both readable
and writable**, and 742 live websites were linked to writable instances. Their
sampling turned up 2.7 million email addresses and roughly 208,000 password
fields in MongoDB alone.

This is not new, and it is not shrinking. Dietrich et al. recorded more than
40,000 publicly accessible MongoDB instances without authentication as early as
2015, alongside hundreds of thousands of unprotected Redis and memcached
services, and traced the leak of Mexican voter records to exactly this pattern.
Their operator interviews found that 78.73% of respondents named _lack of
knowledge_ as the root cause - not negligence, not time pressure. The people
running these services did not know the default was a decision.

What would catch it earlier: a deployment check that asserts every data store
requires authentication before it is reachable from any network the application
does not use; periodic internal scanning that treats "responds to an
unauthenticated command" as a finding rather than an inventory entry; and
reviewing the _permissions_ an application account holds, not merely whether it
has a password. An application that only reads should not hold an account that
can write.

**Sources:**

-   Ferrari, D., Carminati, M., Polino, M., & Zanero, S. (2020). NoSQL Breakdown: A Large-scale Analysis of Misconfigured NoSQL Services. ACSAC 2020. <https://doi.org/10.1145/3427228.3427260>
-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   ENISA (2024). ENISA Threat Landscape 2024. <https://www.enisa.europa.eu/publications/enisa-threat-landscape-2024>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
