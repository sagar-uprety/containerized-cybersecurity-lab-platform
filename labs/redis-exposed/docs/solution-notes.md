# Solution Notes: The Exposed Cache

## Root Cause

Redis starts with protected mode disabled and no authentication. It is not
published to the VM IP, but any process inside the student's private lab network
can access it.

## Impact Demonstration

```bash
redis-cli -h redis-host ping
redis-cli -h redis-host keys '*'
redis-cli -h redis-host get support_token:demo-only-token
```

The seeded values are dummy data. The point is that internal network access is
not a substitute for service authentication.

## POC Fix

```bash
printf '\nrequirepass demo-redis-password\n' >> /lab/redis/redis.conf
printf 'REDIS_PASSWORD=demo-redis-password\n' > /lab/demo-app/app-config.env
ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host
sudo /usr/local/sbin/restart-redis
exit
```

The demo app reads `REDIS_PASSWORD` from `/lab/demo-app/app-config.env` on each
request, so it picks up the new password automatically after Redis restarts.

## Expected Verification

```bash
redis-cli -h redis-host ping
redis-cli -h redis-host -a demo-redis-password ping
curl -s http://demo-app:8080/health
```

The unauthenticated `PING` should fail with an authentication error. The
authenticated `PING` should return `PONG`, and `/health` should return `ok`.

## Final-Lab Improvement

For a thesis-quality version, prefer Redis ACLs over a single `requirepass`
shared secret so the app can use least-privilege credentials.
