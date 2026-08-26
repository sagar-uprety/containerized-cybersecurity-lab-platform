# Shared-Service Hardening Without Breaking Dependents (Pattern B Reference)

## Scenario

**Role:** Junior Linux administrator

A small records service is shared by an internal application. Monitoring
suggests the records service may be handing out data without checking who is
asking. Investigate, correct the shared service, and make sure the application
that depends on it keeps working.

<!-- AUTHORING NOTE (sample lab only): this is the runnable reference for
Pattern B (Service With Dependent Application). It follows every reveal-tier rule
in STUDENT_GUIDE_TEMPLATE.md. When you copy this lab, keep the section order and
the reveal boundary; replace the sample-specific content. -->

## Why This Matters

Most applications do not talk to the network directly - they talk to a shared
service behind them: a database, a cache, a records store. When that shared
service is hardened, every application that depends on it feels the change.
Operator studies repeatedly find that missing or default access controls on
shared services are among the most common misconfigurations in deployed systems
(Dietrich et al., ACM CCS 2018), and the reason they linger is exactly this
coupling: tightening the service risks breaking something that was quietly
relying on it being open.

The skill this lab builds is hardening a shared service _and_ keeping its
dependents working - the everyday reality of production security work.

## Objectives

By the end of this lab you should be able to:

-   Explain how one shared service's authentication decision propagates to every application that depends on it
-   Demonstrate that a shared service returns data to a client that presented no identity
-   Enforce authentication on the shared service so unauthenticated reads are refused
-   Reconfigure a dependent application so it keeps working after the shared service is hardened
-   Confirm both the security outcome and service continuity independently

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic HTTP request and response concepts, including request headers
-   Authentication as a credential a client presents to a service
-   Editing Linux configuration files and applying service changes

If you need to review these topics, see:

-   OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
-   MDN HTTP Authorization header: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization>
-   NIST least-privilege definition: <https://csrc.nist.gov/glossary/term/least_privilege>

## Your Lab Environment

Your browser terminal starts on the **workstation**. Two services share the lab
network: the **records backend** (`records-backend`), the shared service that
holds the data, and the **records app** (`records-app`), an application that
reads from the backend and serves a short summary. Your workstation can reach
both.

Paths and access you will need:

-   `/lab/backend/config.env` - the backend's configuration, editable from the workstation
-   `/lab/app/config.env` - the dependent app's configuration, editable from the workstation
-   **Service admin accounts** - to reload a service after editing its config, log in over SSH as the `appadmin` account on that service host (`records-backend` or `records-app`). The SSH password is your own workstation/lab login password from the portal's Workstation Access page. Each account can run only a narrow reload helper.

## Investigation

Before changing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What does the backend return when you request records without presenting any credential?
-   How does the app read from the backend - does it present a credential today, and where would that be configured?
-   If you require a credential on the backend, what happens to a client (including the app) that does not have it?

HTTP clients and standard Linux text-processing tools are on the workstation.
Command shapes to start from:

```bash
curl -s http://<backend-host>:<port>/records
curl -s http://<app-host>:<port>/summary
curl -s -H "Authorization: Bearer <token>" http://<backend-host>:<port>/records
```

The records are deliberately synthetic; do not add real names, credentials, or
external data.

**Proving impact:** Show that the backend returns at least one seeded record to a
request that carried no credential. Then identify the app as a consumer of that
same backend, so you understand what your fix will affect.

## Remediate

Now fix the shared service without breaking the app.

**Goal:** When you are done: the backend refuses to return records to a client
that has not authenticated; the dependent app can still read records and serve
its summary; and both changes survive a service reload.

**Constraints:** The dependent app must keep working - a fix that secures the
backend but leaves the app unable to read has not met the goal. Changes must be
written to the persistent lab configuration and reloaded, not applied only to a
running process.

**Where to work:** The backend config is at `/lab/backend/config.env` and the app
config is at `/lab/app/config.env`, both editable from the workstation. Reloading
each service requires its `appadmin` SSH account (see Your Lab Environment). The
portal's **Reset** action restores the vulnerable baseline, so it is not the
right tool for reloading a fix.

**References:**

-   OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
-   MDN HTTP Authorization header: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization>
-   Local: each service's configuration file comments and its narrow reload helper

**If you're stuck:**

-   Two things must be true at once: the backend should demand a credential, and the app should be able to present one. Fixing only the first breaks the second.
-   Compare what the backend will require once it is hardened with what the app currently sends. The gap between them is what you need to close, in the app's own configuration.
-   Look at each service's configuration file and its reload helper. The value the app must present is the same one the backend is configured to accept.

## Verify

After applying your fix, confirm each of the following:

1. An unauthenticated request to the backend can no longer read records
2. The dependent app can still read records and serve its summary
3. Both services are healthy after being reloaded

Use the same tools from your investigation to re-check each one. When satisfied,
click **Run Check** in the portal.

## Real-World Context

This sample models the coupling that makes shared-service hardening hard in
practice. In real systems the "backend" is a database or cache, and the
"dependent app" is one of many services that read from it - each carrying its own
copy of a credential in its own configuration. Dietrich's operator interviews
found that missing authentication on shared data services is among the most
frequently encountered misconfiguration classes, and that fear of breaking
dependents is a real reason operators leave them open: the service "works" for
everything that relies on it precisely because it asks nothing of anyone.

The discipline you practised here - harden the shared service, then update every
dependent to present a valid credential, then verify both the security outcome
and continuity - is exactly what a safe production rollout of authentication
looks like. The research-grounded version of this pattern in the lab catalog is
the exposed-cache lab, where an order application depends on an unauthenticated
Redis instance.

What would catch this earlier in production: treating "a shared data service
answers unauthenticated requests" as a finding regardless of whether anything
currently breaks; and rolling out authentication to the service and its
consumers together, with a continuity check on each consumer.

**Sources:**

-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   OWASP Authentication Cheat Sheet. <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>

---

_When you're done, end the lab through the portal and complete the feedback form.
Take a moment to reflect on what you learned: what surprised you, what you would
do differently, and how this applies beyond this sample service._
