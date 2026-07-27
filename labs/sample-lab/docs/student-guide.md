# Sample Records Review

You are supporting a small internal records service that was deployed from an unfinished template. Monitoring suggests clients may be receiving records without proving who they are. Determine what is happening, demonstrate why it matters using only synthetic data, and correct it without breaking legitimate use.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic HTTP request and response concepts
-   Authentication and authorization as separate security controls
-   Editing Linux configuration files and applying service changes

If you need to review these topics, see:

-   OWASP Authorization Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
-   MDN HTTP overview: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview>
-   NIST least-privilege definition: <https://csrc.nist.gov/glossary/term/least_privilege>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your environment contains a workstation and a target records service on an isolated lab network. Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem is real.

**Guiding questions:**

-   What happens when a client requests records without presenting identity or authorization information?
-   Does the active configuration match the behavior you observe?
-   How can an authorized client continue to read records after access controls are enabled?

Use HTTP clients and standard Linux text-processing tools available on the workstation. The records are deliberately synthetic; do not add real names, credentials, or external data.

**Proving impact:** Show that an unauthenticated client can retrieve at least one seeded sample record. Then identify the configuration decision that permits the read.

## Remediate

Now fix the issue.

**Goal:** Require authorization before the service returns records while preserving the intended authorized path.

**Constraints:** The change must be stored in persistent lab configuration, applied to the running service, and survive a service reload.

**References:**

-   OWASP Authorization Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
-   OWASP REST Security Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html>
-   Local configuration comments and the constrained administration helper on the target service

**If you're stuck:**

-   Start from default-deny: a client should receive data only after the service recognizes an allowed identity.
-   Compare the active setting in the shared configuration with the security outcome you need.
-   Look for the target service's narrow reload helper after making a persistent configuration change.

## Verify

After applying your fix, confirm:

1. An unauthenticated request can no longer retrieve records
2. An authorized request can still retrieve the seeded sample records
3. The target service remains healthy

Use the same HTTP and configuration-inspection tools from your investigation to re-check. When satisfied, click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback form. Take a moment to reflect on what you learned: what surprised you, what you would do differently, and how this applies beyond this sample service._

---

**Note:** This file lives at `labs/sample-lab/docs/student-guide.md`. The MkDocs include at `docs/labs/sample-lab.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
