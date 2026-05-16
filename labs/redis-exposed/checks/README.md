# Redis Exposed Checks


Expected command:

```text
checks/check.py
```

Expected classifications:

- `vulnerable`: Redis accepts unauthenticated access and the demo app is healthy.
- `fixed`: Redis rejects unauthenticated access, accepts the configured app credential, and the demo app is healthy.
- `broken`: Redis or the demo app is unavailable, miswired, or only partially remediated.
