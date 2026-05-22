# Instructor Guide: The Exposed Cache

## Purpose

This lab validates the reusable platform path: portal action, browser terminal,
private Podman network, vulnerable service, demo app, checker, reset, and end.
The Redis scenario is intentionally small so infrastructure issues are easy to
separate from lab-content issues.

## Expected Flow

1. Student opens the portal and starts `redis-exposed`.
2. Student uses the embedded browser terminal.
3. Student discovers Redis on `redis-host:6379`.
4. Student proves unauthenticated access with fake keys.
5. Student enables Redis authentication and updates the demo app config.
6. Student runs the portal check and receives `fixed`.
7. Student completes the reflection.

## Verification

Expected platform checks:

```bash
labctl start redis-exposed student01
labctl check redis-exposed student01
labctl reset redis-exposed student01
labctl destroy redis-exposed student01
```

Expected checker states:

- `vulnerable`: Redis unauthenticated commands work and the app is healthy.
- `fixed`: unauthenticated Redis commands fail and the app is healthy.
- `broken`: Redis or the app is unavailable or only partially remediated.

## Privacy Boundary

Use checker JSON, lifecycle events, status, reset counts, and timing evidence.
Do not collect screenshots, terminal recordings, keystrokes, command history, or
browser activity.

## Recovery

If a lab reaches `error`, use **End Lab** followed by **Start Lab**. The expected
admin path is `labctl destroy redis-exposed <student>` followed by
`labctl start redis-exposed <student>`.
