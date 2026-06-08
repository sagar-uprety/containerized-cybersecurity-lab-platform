# The Exposed Cache — Instructor Guide

## Lab Overview

Students discover an unauthenticated Redis instance, demonstrate data access, apply authentication, and verify service continuity.

## Learning Objectives

| #   | Objective                                  | Assessment Criteria                                                        |
| --- | ------------------------------------------ | -------------------------------------------------------------------------- |
| 1   | Identify an exposed internal cache service | Student lists reachable services and their ports                           |
| 2   | Demonstrate unauthorized data access       | Student shows unauthenticated read of seeded data                          |
| 3   | Apply service-level authentication         | Student configures Redis `requirepass` without breaking the app            |
| 4   | Verify security and continuity             | Student confirms unauthenticated commands fail while app health remains OK |

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

| Phase     | Expected Student Evidence                                                             |
| --------- | ------------------------------------------------------------------------------------- |
| Discover  | Student identifies Redis on port 6379 and the demo app on port 8080                   |
| Impact    | Student shows `keys '*'` and `get support_token:...` returning data without auth      |
| Remediate | Student adds `requirepass` to Redis config, updates app env, and restarts the service |
| Verify    | Portal checker reports `fixed`; app health endpoint returns OK                        |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                               |
| ----- | ---------------------- | --------------------------------------------------------------------- |
| 1     | Student asks for help  | Redis can require a password before accepting commands.               |
| 2     | Student stuck > 10 min | Look for the `requirepass` directive in the Redis configuration file. |
| 3     | Student stuck > 20 min | See `redis.io/docs/management/security/` and `man redis.conf`         |

## Common Mistakes

-   Students forget to restart Redis after changing config — How to address: Ask what happens when a service reads its config file.
-   Students update Redis config but not the demo app env file — How to address: Ask how the application learns the new password.
-   Students lock themselves out by setting a password they don't record — How to address: Remind them to document credentials before applying them.
-   Students accidentally break the config file syntax — How to address: Suggest validating the file before restarting.

## Checker States

| State        | Condition                                                                  |
| ------------ | -------------------------------------------------------------------------- |
| `vulnerable` | Redis accepts commands without auth                                        |
| `fixed`      | Redis rejects unauthenticated commands, accepts with password, app healthy |
| `broken`     | Redis unreachable, app unhealthy, or config corrupted                      |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that "default != secure" — Redis defaults to no auth, bind 0.0.0.0
-   Contrast `protected-mode` (insufficient alone) vs `requirepass`
-   Real-world reference: Ferrari et al. (2020) found 1,532 exposed Redis instances
-   Duration: ~45-60 minutes

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
