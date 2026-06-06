# <Lab Title>

Briefly state the student's role, the observed symptom, and the mission. Do not name the exact vulnerability in the opening paragraph.

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

```bash
# example discovery commands
```

## 3. Demonstrate Impact

Prove why the issue matters using safe, seeded, fake data only.

```bash
# example impact commands
```

## 4. Remediate

Apply the fix inside the lab environment. Include only commands that students are intended to run.

```bash
# example remediation commands
```

## 5. Verify

Verify both security and service continuity, then run **Run Check** in the portal.

```bash
# example verification commands
```

## 6. Reflect

Provide root cause, impact, remediation, verification, and prevention.

---

**Note:** This file lives at `labs/<lab-id>/docs/student-guide.md`. The MkDocs include at `docs/labs/<lab-id>.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
