# Custom Workstation Tooling (Pattern D Reference)

## Situation

**Role:** Junior Linux administrator

A small internal records service was deployed from an unfinished template.
Monitoring suggests clients may be receiving records without proving who they
are. Investigate with the tools on your workstation, preserve legitimate
access, and correct the configuration.

<!-- AUTHORING NOTE (sample lab only): this is the runnable reference for
Pattern D (Custom Workstation). The topology is a standalone service (Pattern A);
the distinguishing feature is that this lab's workstation runs a lab-specific
image adding the HTTPie client. Follows every reveal-tier rule in
STUDENT_GUIDE_TEMPLATE.md. -->

## Why This Matters

Investigation depends on having the right client for the service in front of you.
Most of the time the shared workstation already has it - curl, nmap, an LDAP
client, a database client. Occasionally a lab needs a tool the base image does
not carry, and the platform lets a lab ship its own workstation with that tool
added. The security lesson underneath is the familiar one: operator studies find
that services returning data without checking identity are among the most common
misconfigurations in practice (Dietrich et al., ACM CCS 2018), because a default
that answers everyone looks identical to a working service until someone
unauthorized connects.

This lab pairs that everyday access-control lesson with a demonstration of how a
lab provides an extra investigation tool.

## Objectives

By the end of this lab you should be able to:

-   Use an HTTP client to inspect how a service responds to requests with and without a credential
-   Demonstrate that the service returns records to a client that presented no identity
-   Enforce authentication so unauthenticated reads are refused
-   Preserve authorized access after the change
-   Confirm the fix persists across a service reload

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic HTTP request and response concepts, including request headers
-   Authentication as a credential a client presents to a service
-   Editing Linux configuration files and applying service changes

If you need to review these topics, see:

-   OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
-   MDN HTTP Authorization header: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization>
-   HTTPie documentation: <https://httpie.io/docs/cli>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **records service**
(`records-service`) sits on the same isolated lab network.

This lab's workstation is a lab-specific image: in addition to the usual clients,
it includes the **HTTPie** `http` command, an ergonomic HTTP client. You can use
`http` or the always-present `curl` - whichever you prefer.

Paths and access you will need:

-   `/lab/records/config.env` - the service's configuration, editable from the workstation
-   **Service admin account** - to reload the service after editing its config, log in over SSH as the `recadmin` account on `records-service`. The SSH password is your own workstation/lab login password from the portal's Workstation Access page. The account can run only a narrow reload helper.

## Your Mission

1. Inspect how the records service responds to a request that presents no identity.
2. Establish which configuration decision permits that behaviour.
3. Bring the service to a state where unauthenticated reads are refused, using only synthetic data.
4. Keep authorized access working after the change.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before changing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What does the service return when you request records without presenting any credential?
-   Does the active configuration match the behaviour you observe?
-   How would an authorized client continue to read records once access control is enforced?

Both `curl` and the lab-provided HTTPie `http` client are available. Command
shapes to start from:

```bash
curl -s http://<service-host>:<port>/records
http --print=b GET http://<service-host>:<port>/records
http GET http://<service-host>:<port>/records "Authorization: Bearer <token>"
```

The records are deliberately synthetic; do not add real names, credentials, or
external data.

**Proving impact:** Show that an unauthenticated client can retrieve at least one
seeded record, then identify the configuration decision that permits the read.

## Remediate

Now fix the issue.

**Goal:** When you are done: an unauthenticated request can no longer retrieve
records, while an authorized request still can. The change must be written to the
persistent lab configuration and survive a service reload.

**Constraints:** Authorized access must keep working. The change must be persisted
and reloaded, not applied only to a running process.

**Where to work:** The config is at `/lab/records/config.env`, editable from the
workstation. Reloading requires the `recadmin` SSH account (see Your Lab
Environment). The portal's **Reset** action restores the vulnerable baseline, so
it is not the right tool for reloading a fix.

**References:**

-   OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
-   HTTPie documentation: <https://httpie.io/docs/cli>
-   Local: the configuration file's own comments and the narrow reload helper

**If you're stuck:**

-   Start from default-deny: a client should receive data only after the service recognizes an identity it is allowed to serve. Which of those steps is the service currently skipping?
-   Compare the active setting in the configuration against the security outcome you need.
-   Look for the service's reload helper after you make a persistent configuration change - editing the file is not the same as the running service honouring it.

## Verify

After applying your fix, confirm each of the following:

1. An unauthenticated request can no longer retrieve records
2. An authorized request can still retrieve the seeded records
3. The service remains healthy after the reload

Use the same tools from your investigation to re-check. When satisfied, click
**Run Check** in the portal.

## Real-World Context

The vulnerability here is the plainest access-control failure there is, and it is
deliberately simple so the lab can foreground something else: how an
investigation gets the right tools. In practice, the client you reach for shapes
what you notice - a readable HTTP client makes a missing `Authorization` check
obvious, just as the right database or directory client makes other exposures
visible. Dietrich's operator study found that missing authentication is among the
most frequently encountered misconfiguration classes, and that operators often
attribute it to lack of knowledge rather than negligence: the default returned
data, the service worked, and nobody realized a decision had been made.

Every other lab in this collection is a specific instance of the same principle -
recognize identity before granting access, and deny by default. What this
reference adds is the mechanics of equipping a lab's workstation with a tool the
shared image does not carry, so an author is never blocked on tooling.

What would catch the underlying issue earlier in production: a deployment check
that asserts a protected endpoint refuses unauthenticated requests before it is
considered ready.

**Sources:**

-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   OWASP Authentication Cheat Sheet. <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>

---

_When you're done, end the lab through the portal and complete the feedback form.
Take a moment to reflect on what you learned: what surprised you, what you would
do differently, and how this applies beyond this sample service._
