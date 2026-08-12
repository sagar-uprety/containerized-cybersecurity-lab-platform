# Sample Records Review

You are supporting a small internal records service that was deployed from an
unfinished template. Monitoring suggests clients may be receiving records
without proving who they are. Determine what is happening, demonstrate why it
matters using only synthetic data, and correct it without breaking legitimate
use.

<!-- AUTHORING NOTE (sample lab only): this guide is the reference implementation
of labs/templates-contract/STUDENT_GUIDE_TEMPLATE.md. It follows every reveal-tier
rule so a new author can copy the shape. When you copy labs/sample-a-standalone, replace the
sample-specific content but keep the section order and the reveal boundary intact. -->

## Why This Matters

Access control is the difference between a service that answers "here is the
data" and one that first asks "who is asking, and are they allowed?". Operator
studies repeatedly find that missing or default access controls are among the
most common security misconfigurations in deployed systems, and the root cause
is rarely malice - it is that a default which returns data freely looks
identical to a working service until someone unauthorized connects (Dietrich et
al., ACM CCS 2018). The failure is invisible right up to the moment it is
expensive.

The habit this lab builds is default-deny: a service should hand back data only
after it has recognized an identity it is willing to trust.

## Objectives

By the end of this lab you should be able to:

-   Distinguish authentication (proving who a client is) from authorization (deciding what that client may do)
-   Demonstrate that a service returns protected records to a client that presented no identity
-   Trace an observed behaviour back to the specific configuration decision that permits it
-   Enforce default-deny so records are returned only to an authorized identity, without breaking legitimate access
-   Confirm a fix persists across a service reload rather than only in the running process

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic HTTP request and response concepts
-   Authentication and authorization as separate security controls
-   Editing Linux configuration files and applying service changes

If you need to review these topics, see:

-   OWASP Authorization Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
-   MDN HTTP overview: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview>
-   NIST least-privilege definition: <https://csrc.nist.gov/glossary/term/least_privilege>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **target records
service** sits on the same isolated lab network.

Paths and access you will need:

-   `/lab/sample` - the records service's configuration directory, mounted so you can inspect and edit it from the workstation. Its settings file is `config.env`.
-   **Service administration** - the target service's administration account uses your own workstation/lab password from the portal's Workstation Access page, and exposes a narrow reload helper for applying a saved configuration.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any
time. **Reset** restores the original vulnerable baseline, so it is not a way to
reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on
the portal's Workstation Access page.

## Your Mission

1. Identify the target records service and observe its current behaviour.
2. Determine whether an unauthenticated client can read the synthetic records.
3. Trace the behaviour to the persistent setting that causes it.
4. Bring the service to a state where records require an authorized identity, without breaking legitimate authorized reads or service health.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What happens when a client requests records without presenting any identity or authorization?
-   Does the active configuration match the behaviour you observe?
-   How would an authorized client continue to read records once access controls are enforced?

HTTP clients and standard Linux text-processing tools are installed on the
workstation. Command shapes to start from:

```bash
curl -s http://<target-host>:<port>/<path>
curl -s -H "Authorization: <scheme> <token>" http://<target-host>:<port>/<path>
```

The records are deliberately synthetic; do not add real names, credentials, or
external data.

**Proving impact:** Show that an unauthenticated client can retrieve at least one
seeded record, then identify the configuration decision that permits the read.
Retrieving the record is the demonstration; naming the setting behind it is the
understanding.

## Remediate

Now fix the issue.

**Goal:** When you are done: an unauthenticated request can no longer retrieve
records, while an authorized request still can. The change must be stored in the
persistent lab configuration, applied to the running service, and still in effect
after a service reload.

**Constraints:** The change must be written to persistent configuration, applied
to the running service, and survive a reload. Legitimate authorized reads must
keep working.

**Where to work:** The configuration is at `/lab/sample/config.env`, editable
from the workstation. Apply it with the service's narrow reload helper (see Your
Lab Environment). The portal's **Reset** action restores the vulnerable baseline,
so it is not the right tool for reloading a fix.

**References:**

-   OWASP Authorization Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
-   OWASP REST Security Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html>
-   Local: the configuration file's own inline comments, and the constrained administration helper on the target service

**If you're stuck:**

-   Start from default-deny: a client should receive data only after the service recognizes an identity it is allowed to serve. Which of those two steps is the service currently skipping?
-   Compare the active setting in the shared configuration against the security outcome you need. The gap between what it says and what you want is the change.
-   Look for the target service's narrow reload helper after you make a persistent configuration change - editing the file is not the same as the running service honouring it.

## Verify

After applying your fix, confirm each of the following:

1. An unauthenticated request can no longer retrieve records
2. An authorized request can still retrieve the seeded sample records
3. The target service remains healthy after the reload

Use the same HTTP and configuration-inspection tools from your investigation to
re-check. When satisfied, click **Run Check** in the portal.

## Real-World Context

This sample models the most basic access-control failure there is, and its very
plainness is the point: it is the shape that dozens of real misconfigurations
share. Dietrich's operator study found that missing authentication and overly
permissive access are among the most frequently encountered misconfiguration
classes in practice, and that operators overwhelmingly attribute them to lack of
knowledge rather than carelessness - the default returned data, the service
worked, and nobody realized a decision had been made on their behalf.

Every other lab in this collection is a specific instance of the principle you
just applied here: recognize identity before granting access, and deny by
default. A cache that answers unauthenticated commands, a directory that returns
entries to anonymous queries, a file share that maps unknown users to a guest -
they are all this same failure wearing a different service's clothes.

What would catch it earlier in production: a deployment check that asserts a
protected endpoint refuses unauthenticated requests before it is considered
ready; and treating "returns data without authentication" as a release blocker
rather than a later hardening task.

**Sources:**

-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>
-   OWASP Authorization Cheat Sheet. <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>

---

_When you're done, end the lab through the portal and complete the feedback form.
Take a moment to reflect on what you learned: what surprised you, what you would
do differently, and how this applies beyond this sample service._
