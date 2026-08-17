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

## Safety and Scope Boundaries

-   **Contained blast radius:** Redis, the demo order application, and the workstation run in per-student Podman networks (`client-net`, `app-net`). Nothing reaches outside the lab; the dual-homed cache is the only host bridging the two networks.
-   **Synthetic data only:** The cache is seeded with obviously fake demo values (`demo-only-token`, `demo-postgresql://fake-svc`, and similar). No real PII, credentials, or customer records are present.
-   **Intentional risks:** Protected mode is disabled and Redis binds all interfaces with no authentication. This is safe only because the topology is per-student and network-isolated.
-   **Student boundaries:** Students stay on the lab network, use only seeded data, and reach the cache host through the `redisadmin` SSH account - never platform operator commands.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable baseline and discards a student's fix; it does not repair a workstation a student has wedged. To fully recover, End Lab and Start again.

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

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock.

| Trigger                                                     | Instructor Response                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Student asks for help before probing both networks          | Redirect to the investigation questions; do not confirm which interface is wrong.                                                    |
| Student fixed authentication but left Redis on `client-net` | Ask which network the application actually uses, and what still reaches the cache from the workstation.                              |
| Student believes they are done after setting a password     | Ask which of the five Verify conditions they can currently demonstrate - most will have skipped least-privilege or the default user. |
| Student gave the application user `+@all`                   | Ask what minimum command set the application truly needs.                                                                            |
| Student stuck after all three written hints                 | Point at the ACL page of the official security docs; do not name the directives or values.                                           |

**Do not reveal:** the exact `bind` value, the contents of `users.acl`, the `aclfile` directive, or the application config field names. If a student cannot reach these, record it as guide-design evidence.

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

How to read this lab's combined feedback form responses:

-   A small prior-vs-post confidence gap on "authentication vs authorization" suggests students conflated the two - this lab's core distinction is that network binding, authentication, and least-privilege are three separate layers.
-   Low clarity scores usually point at Remediate: students who could not tell which network the application uses need the topology stated more plainly, not more hints.
-   Stuck-point free text mentioning "still connects" or "NOAUTH" reveals whether a student stopped at network binding without adding ACLs, or set a password but left the default user enabled.
-   Repeated confusion about the application's username field is guide-design signal, not student weakness: strengthen the app-config pointer in "Your Lab Environment".

## Teaching Notes

-   Emphasize that this lab intentionally disables protected mode and binds all interfaces to model an unsafe deployment; do not describe that full combination as a universal packaged default
-   Contrast `protected-mode` (insufficient alone) vs proper auth
-   Walk through the layered defense mindset: network binding → authentication → authorization → least privilege
-   Real-world reference: Ferrari et al. (2020) found 1,532 exposed Redis instances; ENISA 2024 names exposed Redis as current risk
-   ACLs are the recommended approach since Redis 6 - `requirepass` is legacy

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
