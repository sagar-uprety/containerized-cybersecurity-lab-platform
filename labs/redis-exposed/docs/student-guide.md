# The Exposed Cache

You've been assigned as the junior administrator for a small order-processing
application. Monitoring has flagged unusual direct connections to the
application's cache service — connections that do not appear to come from the
application itself. The cache holds customer data, order state, session tokens,
and internal configuration. The order application still works, but the cache
may be exposed on the internal network.

Your job is to figure out what is exposed, demonstrate why it matters beyond
just "someone can connect," fix the root cause, and make sure the application
still works afterward.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply layered fixes (network and access controls) without breaking
    dependent services
-   Verify your fix using the portal checker

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation, the cache server, and the demo
order application on an isolated lab network. Use the portal to **Start Lab**,
**Run Check**, **Reset**, or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real — and worse than it might first appear.

**Guiding questions:**

-   What services are reachable from the workstation inside the lab network?
-   Which network interfaces does the cache service listen on, and why does
    that matter even inside an isolated lab network?
-   Does the cache service require any form of authentication before accepting
    commands?
-   Can someone who is not the application read or change data? How sensitive
    is the data that is exposed?
-   If you can read data, can you also write data? What could an attacker do
    with write access to a live cache?

Use network scanners, the cache service's command-line client, HTTP tools, and
standard Linux utilities to explore the environment. Stay inside the lab
network and use only the seeded demo data.

**Proving impact:** Once you've identified the issue, demonstrate that this is
more than an "open port" — it is a data breach waiting to happen. Show that the
exposed service reveals sensitive information and that write access allows
modification of application state. Use only what the lab environment provides.

## Remediate

Now fix the issue with layered controls — one layer alone is not enough.

**Goal:** Restrict network exposure, require authentication, and enforce
least-privilege access so that the application can still read data but an
unauthenticated attacker cannot do anything.

**Constraints:** Changes must survive a service restart. The order application
depends on the cache, so your fix must not break normal application behavior.
The application should only have the minimum permissions it needs — not full
administrative access.

**References:**

-   Official security documentation: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/>
-   ACL reference: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/>
-   Local: `man redis.conf`, `redis-cli --help`

**Need a hint?**

-   Network isolation inside the lab is a starting point, but it is not
    authorization. Think about what an attacker on the same network segment
    could still reach, and what controls would stop them at the network level.
-   Redis supports two authentication mechanisms. The newer one lets you create
    named users with different permission sets — including read-only users for
    applications. Look for how to define and load user permissions.
-   Check the ACL documentation for how to disable the default unauthenticated
    user, create a restricted application user, and point the server at the ACL
    file. The application configuration file supports a username field in
    addition to the password.

## Verify

After applying your fixes, confirm:

1.  Unauthenticated access is blocked
2.  The application user can still read data but cannot write
3.  The order application still works as expected

Use the same tools from your investigation to re-check each layer. When
satisfied, click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned — what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
