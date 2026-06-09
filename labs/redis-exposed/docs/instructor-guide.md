# The Exposed Cache — Instructor Guide

## Lab Overview

Students discover an unauthenticated Redis instance bound to all interfaces, read exposed data (customer records, session tokens, internal config), then apply layered remediation: restrict network binding, configure ACL-based authentication, and create a least-privilege application user.

## Learning Objectives

| #   | Objective                                  | Assessment Criteria                                                    |
| --- | ------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | Identify an exposed internal cache service | Student lists reachable services, interfaces, and auth status          |
| 2   | Demonstrate unauthorized data access       | Student shows unauthenticated read/write of customer data and config   |
| 3   | Apply network-level hardening              | Student restricts bind address from `0.0.0.0` to specific interface    |
| 4   | Apply ACL-based authentication             | Student creates ACL users with `default off`, admin + app users        |
| 5   | Enforce least-privilege for the app        | Student creates app user with `+@read` only, confirms write is blocked |
| 6   | Verify security and continuity             | Student confirms checker reports `fixed` and app health is OK          |

## Reveal Boundary

| Content                  | Student Guide            | Solution Notes       | This Guide        |
| ------------------------ | ------------------------ | -------------------- | ----------------- |
| Mission/role             | Yes                      | No                   | Summary           |
| Diagnostic commands      | Yes (investigation only) | Yes (full)           | Reference         |
| Impact demonstration     | Yes (what to observe)    | Yes (exact commands) | Expected evidence |
| Remediation objective    | Yes (goal + constraints) | Yes (exact commands) | Rubric            |
| Solution password/config | NEVER                    | Yes                  | Reference         |
| Restart sequence         | NEVER                    | Yes                  | Reference         |
| Hint ladder              | Yes (3 levels)           | No                   | Reveal policy     |
| Official doc links       | Yes                      | Yes                  | Yes               |
| Evidence checklist       | Yes                      | No                   | Expected answers  |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Discover  | Student identifies Redis on port 6379, notes `bind 0.0.0.0`, confirms no auth required                           |
| Impact    | Student shows reading customer PII (`HGETALL customer:1001`), session tokens, and internal connection strings    |
| Impact    | Student demonstrates write capability by modifying a key (e.g., `SET feature_flag:admin_mode "true"`)            |
| Remediate | Student changes `bind 0.0.0.0` to `bind redis-host 127.0.0.1`                                                    |
| Remediate | Student creates `users.acl` with `user default off`, admin user, and `app` user with `+@read +@connection +ping` |
| Remediate | Student adds `aclfile` directive to redis.conf                                                                   |
| Remediate | Student updates `app-config.env` with `REDIS_USERNAME=app` and `REDIS_PASSWORD`                                  |
| Remediate | Student restarts Redis service via `redisadmin` SSH + sudo                                                       |
| Verify    | Portal checker reports `fixed`; app health endpoint returns OK                                                   |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                      |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1     | Student asks for help  | Network isolation alone is not enough — consider the interface binding and what authentication Redis offers. |
| 2     | Student stuck > 10 min | Redis 6+ supports ACLs with per-user command permissions. The `aclfile` directive loads user definitions.    |
| 3     | Student stuck > 20 min | See ACL reference: `redis.io/docs/management/security/acl/`. The app config supports `REDIS_USERNAME`.       |

## Common Mistakes

-   Students only fix auth but leave `bind 0.0.0.0` — How to address: Ask what other services on the network could reach this port if binding is unrestricted.
-   Students set a password but forget to disable `user default` — How to address: Ask what happens when no credentials are supplied and a default user exists.
-   Students give the app user `+@all` instead of `+@read` — How to address: Ask "what is the minimum set of commands the application actually needs?"
-   Students update `app-config.env` with password but forget `REDIS_USERNAME` — How to address: ACL AUTH requires both username and password; check the app.py source.
-   Students forget to add the `aclfile` directive to redis.conf — How to address: Ask how Redis knows where to find the ACL definitions.
-   Students forget to restart Redis after config changes — How to address: Ask when a service reads its configuration file.

## Checker States

| State        | Condition                                                                            |
| ------------ | ------------------------------------------------------------------------------------ |
| `vulnerable` | Redis accepts unauth commands, write via app user succeeds (no ACL)                  |
| `fixed`      | Redis rejects unauth commands (NOAUTH), app user write blocked (NOPERM), app healthy |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that "default != secure" — Redis defaults to no auth, bind 0.0.0.0
-   Contrast `protected-mode` (insufficient alone) vs proper auth
-   Walk through the layered defense mindset: network binding → authentication → authorization → least privilege
-   Real-world reference: Ferrari et al. (2020) found 1,532 exposed Redis instances; ENISA 2024 names exposed Redis as current risk
-   ACLs are the recommended approach since Redis 6 — `requirepass` is legacy
-   Duration: ~60-75 minutes (longer than the original requirepass-only version due to ACL complexity)

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
