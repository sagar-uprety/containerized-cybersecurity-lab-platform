# Solution Notes: Unauthenticated NoSQL Database Exposure

## Root Cause

Two independent failures combined:

1. Redis is bound to `0.0.0.0` (all network interfaces), including its
   `client-net` interface. The application uses a separate `app-net` interface,
   so Redis does not need to accept database traffic from `client-net`.
2. Redis has no authentication configured - anyone who can reach the port can
   run arbitrary commands, including reading all stored data and writing new
   values.

## Investigation

```bash
nmap -p 6379 redis-host
redis-cli -h redis-host ping
redis-cli -h redis-host keys '*'
redis-cli -h redis-host HGETALL customer:1001
redis-cli -h redis-host GET "internal:db_connection_string"
redis-cli -h redis-host SET impact:write-test "unauthorized-write"
redis-cli -h redis-host GET impact:write-test
redis-cli -h redis-host DEL impact:write-test
```

The `PING` returns `PONG` without authentication. `KEYS *` reveals customer
records, session tokens, order data, rate-limit configuration, and an internal
database connection string - all readable without any credentials. Write
operations also succeed, allowing an attacker to modify application state.

## Remediation

### Step 1: Restrict Network Binding

```bash
sed -i 's/^bind 0.0.0.0/bind redis-app 127.0.0.1/' /lab/redis/redis.conf
```

This keeps Redis reachable on its application-facing interface and loopback,
but removes its listener from the client-facing interface. The workstation can
still reach the Redis container's SSH service through `redis-host`; direct
Redis traffic from `client-net` is no longer accepted.

### Step 2: Define ACL Users with Least Privilege

```bash
cat > /lab/redis/users.acl << 'ACLEOF'
user default off
user admin on >admin-demo-password ~* &* +@all
user app on >app-demo-password ~* +@read +@connection +ping
ACLEOF
```

-   `user default off` - disables the implicit default user that requires no
    authentication.
-   `admin` - full access to all keys and commands, used by the administrator.
-   `app` - **least privilege**: can only read keys (`+@read`) and run
    connection/health commands (`+@connection +ping`). Cannot write, delete,
    flush, or modify configuration.

### Step 3: Point Redis to the ACL File

```bash
sed -i '/^aclfile/d' /lab/redis/redis.conf
echo 'aclfile /usr/local/etc/redis/users.acl' >> /lab/redis/redis.conf
```

The `aclfile` directive tells Redis to load user definitions from the ACL file
on startup.

### Step 4: Update the Application Configuration

```bash
printf 'REDIS_USERNAME=app\nREDIS_PASSWORD=app-demo-password\n' > /lab/demo-app/app-config.env
```

The demo app reads both `REDIS_USERNAME` and `REDIS_PASSWORD` from this file on
each request, so it picks up the new ACL credentials automatically after Redis
restarts.

### Step 5: Restart Redis

The `redisadmin` account uses your workstation/lab password. Enter it at the
hidden prompt; the command keeps it only in the current shell variable and
clears that variable afterward:

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host 'sudo /usr/local/sbin/restart-redis'
unset LAB_PASSWORD
```

## Verification

### Unauthenticated Access Blocked

```bash
if redis-cli -h redis-host ping 2>&1 | grep -q 'Could not connect'; then
  printf '%s\n' 'client-net Redis access blocked'
else
  exit 1
fi

read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host \
  "redis-cli -h 127.0.0.1 ping 2>&1 | grep -q NOAUTH"
unset LAB_PASSWORD
```

### Admin User Works

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host \
  "REDISCLI_AUTH=admin-demo-password redis-cli -h 127.0.0.1 --user admin ping" \
  | grep -qx PONG
unset LAB_PASSWORD
```

### App User Works but is Restricted (Least Privilege)

```bash
test "$(curl -fsS http://demo-app:8080/security-check)" = \
  'read=false write=denied'
```

### Application Health

```bash
test "$(curl -fsS http://demo-app:8080/)" = \
  'Order cache is reachable. admin_mode=false'
test "$(curl -fsS http://demo-app:8080/health)" = ok
```

### Runtime Configuration

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host \
  "REDISCLI_AUTH=admin-demo-password redis-cli -h 127.0.0.1 --user admin --raw CONFIG GET bind" \
  | grep -qx 'redis-app 127.0.0.1'
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new redisadmin@redis-host \
  "REDISCLI_AUTH=admin-demo-password redis-cli -h 127.0.0.1 --user admin --raw CONFIG GET aclfile" \
  | grep -qx '/usr/local/etc/redis/users.acl'
unset LAB_PASSWORD
```

## Design Rationale

This remediation teaches three layered security controls:

1. **Network segmentation** (bind address) - Redis listens on `app-net`, where
   its dependent application runs, but not on `client-net`, where direct cache
   access originates. Network placement does not replace authentication.
2. **Authentication** (ACL users) - require credentials before accepting
   commands. Even inside the network, clients must prove their identity.
3. **Least privilege** (ACL permissions) - the application user gets only the
   commands it needs (`read`, `ping`, connection commands). It cannot write,
   delete data, or reconfigure the server. This limits blast radius if the
   application credentials are compromised.
