# The Exposed Cache

You've been assigned as the junior administrator for a small order-processing
application. Monitoring has flagged unusual direct connections to the
application's cache service — connections that don't appear to come from the
application itself. Your job is to figure out what's going on, demonstrate
why it matters, fix it, and make sure the application still works afterward.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the provided demo data
-   Apply an appropriate fix without breaking dependent services
-   Verify your fix using the portal checker

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation, the cache server, and the demo
application — all on an isolated lab network. Use the portal to **Start Lab**,
**Run Check**, **Reset**, or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem
is real.

**Guiding questions:**

-   What services are running and reachable on the lab network?
-   Does the cache service require any form of authentication?
-   Can you access stored data without credentials?

Use network scanners, the cache service's own command-line client, and
standard Linux tools to explore the environment.

**Proving impact:** Once you've identified the issue, demonstrate that an
unauthenticated user can read and manipulate data. The cache contains seeded
demo records — use only that data to prove your point. Do not introduce real
credentials or sensitive information.

## Remediate

Now fix the issue.

**Goal:** Require authentication for the cache service so that only
authorized clients can connect.

**Constraints:** The demo application depends on the cache. Your fix must
not break the application. Changes should survive a service restart.

**References:**

-   Official documentation: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/>
-   Local: `man redis.conf`, `redis-cli --help`

**Need a hint?**

-   Think about what principle requires verifying identity before granting access.
-   Look for the configuration directive that controls password authentication.
-   Check the official security documentation for the specific setting name
    and syntax.

## Verify

After applying your fix, confirm two things:

1. The cache service now requires authentication
2. The demo application still works as expected

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned — what surprised you,
what you'd do differently, and how this applies beyond this specific scenario._
