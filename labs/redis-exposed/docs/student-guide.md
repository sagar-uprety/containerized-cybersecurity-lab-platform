# The Exposed Cache

You've been assigned as the junior administrator for a small order-processing
application. Monitoring has flagged unusual direct connections to the
application's cache service — connections that do not appear to come from the
application itself. Your job is to figure out what is exposed, demonstrate why
it matters, fix it, and make sure the application still works afterward.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix without breaking dependent services
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
real.

**Guiding questions:**

-   What services are reachable from the workstation inside the lab network?
-   Does the cache service require any form of authentication before accepting
    commands?
-   Can someone who is not the application read or change demo data?
-   How does the order application depend on the cache service?

Use network tools, Redis client tools, HTTP tools, and standard Linux utilities
to explore the environment. Stay inside the lab network and use only the seeded
demo data.

**Proving impact:** Once you've identified the issue, demonstrate that direct
cache access has real consequences. Show that the exposed service can reveal or
modify lab data, then consider what would happen if the same pattern existed in
a production order system.

## Remediate

Now fix the issue.

**Goal:** Require authentication for direct cache access while keeping the order
application functional.

**Constraints:** Changes must survive a service restart. The order application
depends on the cache, so your fix must not break normal application behavior.

**References:**

-   Official documentation: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/>
-   Local: `man redis.conf`, `redis-cli --help`

**Need a hint?**

-   Think about why internal network reachability is not the same thing as
    authorization.
-   Look for Redis configuration that controls whether clients must prove their
    identity before running commands.
-   The Redis security documentation explains authentication options and how
    applications authenticate after the server requires credentials.

## Verify

After applying your fix, confirm:

1.  The vulnerability is no longer exploitable
2.  The order application still works as expected

Use the same tools from your investigation to re-check both direct cache access
and application behavior. When satisfied, click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned — what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
