# The Exposed Cache — Instructor Guide

## Lab Overview

Students discover an unauthenticated Redis instance, demonstrate data access, apply `requirepass` authentication, and verify service continuity.

## Expected Solution

1. Orient by reading `~/SITREP.txt`
2. Discover Redis on port 6379 via nmap
3. Demonstrate: `redis-cli -h redis-host keys '*'` returns seeded data
4. Remediate: add `requirepass` to Redis config, update demo app env, restart via SSH
5. Verify: unauthenticated ping fails, authenticated ping succeeds, app health check OK
6. Run portal checker — should report `fixed`

## Checker States

| State        | Condition                                                                  |
| ------------ | -------------------------------------------------------------------------- |
| `vulnerable` | Redis accepts commands without auth                                        |
| `fixed`      | Redis rejects unauthenticated commands, accepts with password, app healthy |
| `broken`     | Redis unreachable, app unhealthy, or config corrupted                      |

## Common Mistakes

-   Students forget to restart Redis after changing config
-   Students update Redis config but not the demo app env file
-   Students lock themselves out by setting a password they don't record
-   Students accidentally break the config file syntax

## Teaching Notes

-   Emphasize that "default != secure" — Redis defaults to no auth, bind 0.0.0.0
-   Contrast `protected-mode` (insufficient alone) vs `requirepass`
-   Real-world reference: Ferrari et al. (2020) found 1,532 exposed Redis instances
-   Duration: ~45-60 minutes
