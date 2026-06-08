# <Lab Title>

Briefly state the student's role and the observed symptom. Do not name the exact vulnerability.

> **Authoring note:** Bash blocks in this guide are diagnostic only. The verifier does not read this file. Only `bash verifier` blocks in `solution-notes.md` are executed by the verifier. This distinction must appear in every lab's student guide.

## Success Criteria

-   State the security issue in your own words.
-   Demonstrate impact using only provided dummy data.
-   Apply the intended remediation.
-   Keep required application/service functionality working.
-   Run the portal checker and receive the expected fixed result.

## 1. Orient

Read the incident brief and locate the allowed files or services.

```bash
cat ~/SITREP.txt
```

List the important paths or endpoints for this lab.

## 2. Discover

Use normal Linux or service-administration commands to inspect the environment. Keep this section focused on investigation, not remediation.

**Investigation questions:**

-   <question 1>
-   <question 2>

**Tools available:** <tool list>

```bash
# diagnostic commands — students run these to investigate, verifier ignores them
```

**What to look for:** <output patterns, not exact values>

**Evidence checkpoint:** Record which services you found and what ports they use.

## 3. Demonstrate Impact

Prove why the issue matters using safe, seeded, fake data only.

**Impact to prove:** <what students should demonstrate to show the vulnerability matters>

```bash
# diagnostic commands — prove the vulnerability exists, verifier ignores them
```

**Evidence checkpoint:** What specific output proves the vulnerability?

## 4. Remediate

State the hardening objective and constraints. Provide official documentation links and a hint ladder. Do NOT include exact remediation commands, passwords, or configuration changes — students must figure these out using the references.

**Objective:** <what to achieve>

**Constraints:** <what must remain working>

**Official Documentation:**

-   <link to official docs>

**Local Fallback:**

-   `man <page>` or `<command> --help`

**Hints:**

-   Level 1 (conceptual): <general security principle>
-   Level 2 (directional): <which parameter or area controls this>
-   Level 3 (specific): See <doc reference>

**Evidence checkpoint:** What did you change and why?

## 5. Verify

Verify both security and service continuity, then run **Run Check** in the portal. Do NOT include authenticated verification commands that reveal the solution credential.

```bash
# diagnostic commands — confirm service still works, verifier ignores them
```

**Checker states:**

-   `vulnerable`: Issue still present
-   `fixed`: Issue resolved, service working
-   `broken`: Service broken or misconfigured

**Evidence checkpoint:** What does the checker result tell you?

## 6. Evidence & Feedback

List the evidence items you should have collected during this lab:

-   [ ] <evidence item 1>
-   [ ] <evidence item 2>

After ending the lab, complete the **mandatory** combined feedback form in the portal. You cannot start a new lab until feedback is submitted for the previous lab. Responses are not graded — they are thesis evaluation evidence only.

---

**Note:** This file lives at `labs/<lab-id>/docs/student-guide.md`. The MkDocs include at `docs/labs/<lab-id>.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
