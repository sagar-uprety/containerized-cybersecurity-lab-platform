# Solution Notes: The Exposed Cache

## Root Cause

Two independent failures combined:

1.  Redis is bound to `0.0.0.0` (all network interfaces) instead of the
    specific internal interface, making it reachable from any container on the
    lab network.
2.  Redis has no authentication configured — anyone who can reach the port can
    run arbitrary commands, including reading all stored data and writing new
    values.

## Investigation

```bash
nmap -p 6379 redis-host
redis-cli -h redis-host ping
redis-cli -h redis-host keys '*'
redis-cli -h redis-host HGETALL customer:1001
redis-cli -h redis-host GET "internal:db_connection_string"
redis-cli -h redis-host SET feature_flag:admin_mode "true"
```

The `PING` returns `PONG` without authentication. `KEYS *` reveals customer
records, session tokens, order data, rate-limit configuration, and an internal
database connection string — all readable without any credentials. Write
operations also succeed, allowing an attacker to modify application state.

## Remediation

### Step 1: Restrict Network Binding

This limits Redis to listen only on the lab-network interface and loopback.
A port scan from another network interface would no longer find it reachable.

### Step 2: Define ACL Users with Least Privilege

-   `user default off` — disables the implicit default user that requires no
    authentication.
-   `admin` — full access to all keys and commands, used by the administrator.
-   `app` — **least privilege**: can only read keys (`+@read`) and run
    connection/health commands (`+@connection +ping`). Cannot write, delete,
    flush, or modify configuration.

### Step 3: Point Redis to the ACL File

The `aclfile` directive tells Redis to load user definitions from the ACL file
on startup.

### Step 4: Update the Application Configuration

The demo app reads both `REDIS_USERNAME` and `REDIS_PASSWORD` from this file on
each request, so it picks up the new ACL credentials automatically after Redis
restarts.

### Step 5: Restart Redis

## Verification

### Unauthenticated Access Blocked

```bash
redis-cli -h redis-host ping
# Expected: (error) NOAUTH Authentication required.
```

### Admin User Works

```bash
redis-cli -h redis-host --user admin --pass admin-demo-password ping
# Expected: PONG
```

### App User Works but is Restricted (Least Privilege)

```bash
redis-cli -h redis-host --user app --pass app-demo-password ping
# Expected: PONG

redis-cli -h redis-host --user app --pass app-demo-password SET test value
# Expected: (error) NOPERM this user has no permissions to run the 'set' command
```

### Application Health

```bash
curl -s http://demo-app:8080/health
# Expected: ok
```

## Design Rationale

This remediation teaches three layered security controls:

1.  **Network segmentation** (bind address) — reduce attack surface by limiting
    which interfaces the service listens on. Network isolation alone is not
    enough: any container on the same network could still reach the service.
2.  **Authentication** (ACL users) — require credentials before accepting
    commands. Even inside the network, clients must prove their identity.
3.  **Least privilege** (ACL permissions) — the application user gets only the
    commands it needs (`read`, `ping`, connection commands). It cannot write,
    delete data, or reconfigure the server. This limits blast radius if the
    application credentials are compromised.
