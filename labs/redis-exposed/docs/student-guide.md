# The Exposed Cache

You are the junior Linux administrator assigned to a small order application. Monitoring saw direct cache traffic that does not look like normal application traffic. Your job is to investigate, prove the impact with fake data, harden the cache, and keep the application working.

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
ls -l /lab/redis /lab/demo-app
```

List the important paths or endpoints for this lab.

## 2. Discover

Use normal Linux or service-administration commands to inspect the environment. Keep this section focused on investigation, not remediation.

**Investigation questions:**

-   Which services are reachable on the internal network?
-   Does any service accept connections without credentials?

**Tools available:** `nmap`, `redis-cli`, `curl`, `getent`

```bash
getent hosts redis-host demo-app
nmap -sV -p 6379 redis-host
nmap -sV -p 8080 demo-app
curl -s http://demo-app:8080/health
```

**What to look for:** Open ports, service banners, and any mention of authentication requirements.

**Evidence checkpoint:** Record which services you found and what ports they use.

## 3. Demonstrate Impact

Prove why the issue matters using safe, seeded, fake data only.

**Impact to prove:** A workstation user can read cache data without knowing a password.

```bash
redis-cli -h redis-host ping
redis-cli -h redis-host keys '*'
redis-cli -h redis-host get support_token:demo-only-token
```

**Evidence checkpoint:** What specific output proves the vulnerability?

## 4. Remediate

State the hardening objective and constraints. Provide official documentation links and a hint ladder. Do NOT include exact remediation commands, passwords, or configuration changes — students must figure these out using the references.

**Objective:** Require authentication for the cache service and ensure the order application can still connect.

**Constraints:** Do not break the demo application. Changes must survive a restart.

**Official Documentation:**

-   Redis security: <https://redis.io/docs/management/security/>

**Local Fallback:**

-   `man redis.conf`
-   `redis-cli --help`

**Hints:**

-   Level 1 (conceptual): Redis can require a password before accepting commands.
-   Level 2 (directional): Look for the `requirepass` directive in the Redis configuration file.
-   Level 3 (specific): See `redis.io/docs/management/security/` and `man redis.conf`

**Evidence checkpoint:** What did you change and why?

## 5. Verify

Verify both security and service continuity, then run **Run Check** in the portal. Do NOT include authenticated verification commands that reveal the solution credential.

```bash
# Confirm the application health endpoint still responds
curl -s http://demo-app:8080/health
```

**Checker states:**

-   `vulnerable`: Issue still present
-   `fixed`: Issue resolved, service working
-   `broken`: Service broken or misconfigured

**Evidence checkpoint:** What does the checker result tell you?

## 6. Evidence & Feedback

List the evidence items you should have collected during this lab:

-   [ ] Service inventory showing exposed cache port
-   [ ] Proof of unauthenticated data access
-   [ ] Description of the hardening change applied

After ending the lab, complete the **mandatory** combined feedback form in the portal. You cannot start a new lab until feedback is submitted for the previous lab. Responses are not graded — they are thesis evaluation evidence only.

---

**Note:** This file lives at `labs/<lab-id>/docs/student-guide.md`. The MkDocs include at `docs/labs/<lab-id>.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
