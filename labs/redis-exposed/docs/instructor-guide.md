# Unauthenticated NoSQL Database Exposure - Instructor Guide

## Lab Overview

Students discover an unauthenticated, dual-homed Redis instance listening on both the client and application networks, read exposed data, then keep Redis traffic on the application network, configure ACL-based authentication, and create a least-privilege application user.

## Learning Objectives

| #   | Objective                                  | Assessment Criteria                                                    |
| --- | ------------------------------------------ | ---------------------------------------------------------------------- |
| 1   | Identify an exposed internal cache service | Student lists reachable services, interfaces, and auth status          |
| 2   | Demonstrate unauthorized data access       | Student shows unauthenticated read/write of customer data and config   |
| 3   | Apply network-level hardening              | Redis stops listening on `client-net` but remains usable on `app-net`  |
| 4   | Apply ACL-based authentication             | Student creates ACL users with `default off`, admin + app users        |
| 5   | Enforce least-privilege for the app        | Student creates app user with `+@read` only, confirms write is blocked |
| 6   | Preserve administrative access             | Admin authenticates and can perform a controlled write/read/delete     |
| 7   | Verify restart persistence and continuity  | Live config is hardened after restart and app behavior/health pass     |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Discover  | Student identifies Redis on port 6379, notes `bind 0.0.0.0`, confirms no auth required                              |
| Impact    | Student shows reading customer PII (`HGETALL customer:1001`), session tokens, and internal connection strings       |
| Impact    | Student demonstrates write capability with a disposable test key, then removes it                                   |
| Remediate | Student binds Redis to its `app-net` alias and loopback, removing the `client-net` listener                         |
| Remediate | Student creates `users.acl` with `user default off`, admin user, and `app` user with `+@read +@connection +ping`    |
| Remediate | Student adds `aclfile` directive to redis.conf                                                                      |
| Remediate | Student updates `app-config.env` with `REDIS_USERNAME=app` and `REDIS_PASSWORD`                                     |
| Remediate | Student restarts Redis service via `redisadmin` SSH + sudo                                                          |
| Verify    | Direct client-network Redis access fails; local unauthenticated commands get `NOAUTH`                               |
| Verify    | App reads expected data, app writes get `NOPERM`, admin behavior works, and live config matches files after restart |
| Verify    | Portal checker reports `fixed`; app behavior and health endpoints pass                                              |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                   |
| ----- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | Separate network paths help only if Redis listens on the application-facing path it needs.                |
| 2     | Student stuck > 10 min | Redis 6+ supports ACLs with per-user command permissions. The `aclfile` directive loads user definitions. |
| 3     | Student stuck > 20 min | See ACL reference: `redis.io/docs/management/security/acl/`. The app config supports `REDIS_USERNAME`.    |

## Common Mistakes

-   Students only fix auth but leave Redis listening on `client-net` - How to address: Ask which interface the application actually uses.
-   Students set a password but forget to disable `user default` - How to address: Ask what happens when no credentials are supplied and a default user exists.
-   Students give the app user `+@all` instead of `+@read` - How to address: Ask "what is the minimum set of commands the application actually needs?"
-   Students update `app-config.env` with password but forget `REDIS_USERNAME` - How to address: ACL AUTH requires both username and password; check the app.py source.
-   Students forget to add the `aclfile` directive to redis.conf - How to address: Ask how Redis knows where to find the ACL definitions.
-   Students forget to restart Redis after config changes - How to address: Ask when a service reads its configuration file.

## Checker States

| State        | Condition                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Redis is reachable from `client-net`, accepts local unauthenticated commands, app reads and writes, admin ACL is absent, and runtime bind is `0.0.0.0`                      |
| `fixed`      | Client-network Redis access fails; local unauth gets `NOAUTH`; app reads but cannot write; admin works; runtime bind/ACL file, app behavior, and app health all pass checks |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that this lab intentionally disables protected mode and binds all interfaces to model an unsafe deployment; do not describe that full combination as a universal packaged default
-   Contrast `protected-mode` (insufficient alone) vs proper auth
-   Walk through the layered defense mindset: network binding → authentication → authorization → least privilege
-   Real-world reference: Ferrari et al. (2020) found 1,532 exposed Redis instances; ENISA 2024 names exposed Redis as current risk
-   ACLs are the recommended approach since Redis 6 - `requirepass` is legacy

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
