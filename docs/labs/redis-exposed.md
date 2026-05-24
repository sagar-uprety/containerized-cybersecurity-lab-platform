# The Exposed Cache

You are the junior Linux administrator assigned to a small order application. Monitoring saw direct cache traffic that does not look like normal application traffic. Your job is to investigate, prove the impact with fake data, harden the cache, and keep the application working.

## Success Criteria

- You can explain which service was exposed and why that matters.
- Unauthenticated Redis commands fail after your fix.
- Authenticated Redis commands still work with the password you configured.
- The demo order application health check still returns healthy.
- The portal checker reports fixed.

## 1. Orient

Start by reading the incident brief and locating the files you are allowed to edit:

```bash
cat ~/SITREP.txt
ls -l /lab/redis /lab/demo-app
```

Important paths:

- Redis config: `/lab/redis/redis.conf`
- Demo app config: `/lab/demo-app/app-config.env`

## 2. Discover

Map the tiny lab network from the browser terminal:

```bash
getent hosts redis-host demo-app
nmap -sV -p 6379 redis-host
nmap -sV -p 8080 demo-app
curl -s http://demo-app:8080/health
```

You are looking for the internal cache/database service and whether the order app is currently healthy.

## 3. Demonstrate Impact

Check whether Redis accepts unauthenticated commands:

```bash
redis-cli -h redis-host ping
redis-cli -h redis-host keys '*'
redis-cli -h redis-host get support_token:demo-only-token
```

Use only the seeded fake data. Do not add real credentials or personal data. The finding you are trying to prove is: a workstation user can read cache data without knowing a Redis password.

## 4. Remediate

For the POC, require a Redis password and configure the demo app to use it:

```bash
printf '\nrequirepass demo-redis-password\n' >> /lab/redis/redis.conf
printf 'REDIS_PASSWORD=demo-redis-password\n' > /lab/demo-app/app-config.env
ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host
sudo /usr/local/sbin/restart-redis
exit
```

When SSH asks for a password, enter your lab password. The `sudo` command is restricted to the Redis restart helper inside the lab container.

## 5. Verify

```bash
redis-cli -h redis-host ping
redis-cli -h redis-host -a demo-redis-password ping
curl -s http://demo-app:8080/health
```

The unauthenticated Redis command should fail. The authenticated Redis command and app health check should succeed. Then run **Run Check** in the portal.

## 6. Finish

Congratulations, you have completed the lab!
