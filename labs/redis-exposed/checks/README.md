# Redis Exposed Checks

The checker classifies the running Redis lab and emits JSON for `labctl`, the portal, and verification evidence.

Expected command:

```text
checks/check.py
```

Expected classifications:

-   `vulnerable`: Redis accepts unauthenticated access and the demo app is healthy.
-   `fixed`: Redis rejects unauthenticated access, accepts the configured app credential, and the demo app is healthy.
-   `broken`: Redis or the demo app is unavailable, miswired, or only partially remediated.
