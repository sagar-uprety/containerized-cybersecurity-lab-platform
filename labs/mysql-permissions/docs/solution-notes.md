# Solution Notes: Database Service Exposure with Weak Permissions

## Root Cause

The MariaDB server was stood up without ever running the equivalent of
`mariadb-secure-installation`. Four separate weaknesses compound:

1. `root@'%'` exists with a blank password, so anyone who can reach TCP 3306
   is root on the database server.
2. An anonymous account (`''@'%'`) exists with `SELECT` on the application
   database, so unauthenticated clients can read customer data without any
   credential at all.
3. `bind-address = 0.0.0.0` means the server listens on every interface,
   including the network the student workstation sits on, not just the
   internal network the application actually needs.
4. The application account, `app_user`, holds `GRANT ALL PRIVILEGES ON *.*`
   instead of privileges scoped to `app_db` - so a compromised or merely
   buggy application component can read or write an entirely unrelated
   database (`hr_db`) on the same server.

None of these are exotic - they are the default result of standing up a
database quickly and never coming back to harden it, which is exactly what
Dietrich (CCS 2018) and Deng (IEEE S&P 2025) found operators leave behind at
scale.

## Impact Demonstration

```bash
# Context: student workstation
# Root has full access to every database on the server, with no password
mysql -h db-host -u root -e "SHOW DATABASES;"
mysql -h db-host -u root -e "SELECT full_name, role, annual_salary_usd FROM hr_db.employees;"

# The anonymous account can read customer data with no credential supplied
mysql -h db-host -u '' -e "SELECT full_name, email, phone FROM app_db.customers;"

# The application's own account (credential from /lab/demo-app/app-config.env)
# holds far more than the order application needs
cat /lab/demo-app/app-config.env
mysql -h db-host -u app_user -papp-demo-password -e "SHOW GRANTS;"
```

The last command's output includes `GRANT ALL PRIVILEGES ON *.* TO app_user` -
proof that the application account is not scoped to the one database it
reads and writes.

## Canonical Remediation

### 0. Reach the database host

The fixes below change server-level accounts, bind configuration, and the
running process - none of that is reachable through `app_user`'s
application-scoped connection. SSH into the database host itself using the
credentials published inside this isolated lab:

```bash
# Context: student workstation
cat /lab/access/credentials.txt
ssh -o StrictHostKeyChecking=accept-new root@db-host
```

Run the remaining steps in that session unless a step says otherwise.

### 1. Remove the blank-password network root account and the anonymous account

```bash
# Context: root shell on db-host
mariadb -u root <<'SQL'
DROP USER 'root'@'%';
DROP USER ''@'%';
FLUSH PRIVILEGES;
SQL
```

`mariadb -u root` with no `-h` connects over the local Unix socket, which
authenticates the connecting OS user (`root`, via SSH) directly - it works
regardless of what network-facing passwords exist and is unaffected by the
bind-address change in step 3.

### 2. Scope the application account to least privilege

```bash
# Context: root shell on db-host
mariadb -u root <<'SQL'
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'app_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON app_db.* TO 'app_user'@'%';
FLUSH PRIVILEGES;
SQL
```

This keeps the same account and password the application already uses -
only the grant changes - so the running order application does not need a
new credential.

### 3. Restrict network binding to the internal interface and enable logging

Find this host's address on the internal application network (the one
`demo-app` actually uses to reach the database):

```bash
# Context: root shell on db-host
APP_NET_IP=$(getent hosts db-app | awk '{print $1}' | head -n1)
echo "$APP_NET_IP"
```

Bind to that address plus loopback (loopback keeps local administration
working over the Unix socket-independent TCP path), and turn on the general
query log for audit:

```bash
# Context: root shell on db-host
sed -i "s/^bind-address = .*/bind-address = ${APP_NET_IP},127.0.0.1/" /etc/mysql/mariadb.conf.d/60-lab.cnf
sed -i "s/^general_log = 0/general_log = 1/" /etc/mysql/mariadb.conf.d/60-lab.cnf
cat /etc/mysql/mariadb.conf.d/60-lab.cnf
```

### 4. Restart MariaDB to apply the configuration change

The portal's **Reset** action would wipe every fix back to the vulnerable
baseline, so don't use it here. Restart the server manually, from the same
SSH session, so it picks up the new bind-address and logging settings:

```bash
# Context: root shell on db-host
pkill mariadbd
sleep 3
setsid /usr/sbin/mariadbd --user=mysql --datadir=/var/lib/mysql --socket=/run/mysqld/mysqld.sock < /dev/null > /dev/null 2>&1 &
disown
sleep 3
mariadb-admin --socket=/run/mysqld/mysqld.sock -u root ping
```

Note: the entrypoint runs `tail -f` as the container's foreground process,
so killing `mariadbd` does NOT auto-restart it - you must start it again
yourself. `setsid`/`disown` detach the new process from the SSH session so
it keeps running after you disconnect. `mariadb-admin ... ping` should print
`mysqld is alive`, confirming the new process is up before you leave.

### 5. Confirm the application account's scoped grant, from the host itself

Restricting `bind-address` to the internal network plus loopback means the
workstation's own network can no longer reach TCP 3306 at all - not with any
account, including `app_user`. That is the intended outcome, not a side
effect to work around: `app_user`'s privileges are proven from here, over
the loopback address that stayed reachable, while still on `db-host`:

```bash
# Context: root shell on db-host

# The application account can still do its job against its own database
mariadb -h 127.0.0.1 -u app_user -papp-demo-password -e "SELECT COUNT(*) FROM app_db.orders;"
# Expected: a row count, same as before

# ...but can no longer reach the unrelated HR database
mariadb -h 127.0.0.1 -u app_user -papp-demo-password -e "SELECT COUNT(*) FROM hr_db.employees;"
# Expected: ERROR 1142 (42000): SELECT command denied to user
#           'app_user'@'127.0.0.1' for table `hr_db`.`employees`
```

### 6. Leave the database host

```bash
# Context: root shell on db-host
exit
```

## Verification

```bash
# Context: student workstation, after leaving the db-host SSH session

# Root with a blank password no longer works - and neither does any other
# account over TCP from this network, because bind-address no longer
# includes it at all
mysql -h db-host -u root -e "SELECT 1;"
# Expected: ERROR 2002 (HY000): Can't connect to server on 'db-host' -
# the database is unreachable from this network now, a stronger outcome
# than merely denying the account.

# The anonymous account is unreachable for the same reason
mysql -h db-host -u '' -e "SELECT 1;"
# Expected: ERROR 2002 (HY000): Can't connect to server on 'db-host'

# The order application - on the internal network the database is still
# bound to - is unaffected, and its own security check confirms app_user's
# privileges are exactly what step 5 already proved directly
curl -fsS http://demo-app:8080/
curl -fsS http://demo-app:8080/health
curl -fsS http://demo-app:8080/security-check
# Expected: "Order service reachable. orders_visible=true", "ok", and
#           "app_db=ok cross_db=denied"
```

Then click **Run Check** in the portal and confirm the result is `fixed`.

## Final-Lab Improvement

For production, also consider:

-   Requiring TLS for client connections (`REQUIRE SSL` on accounts, or
    `require_secure_transport = ON`)
-   Rotating `app_user`'s password on the same cadence as other service
    credentials, not just when its grants change
-   Enforcing a password strength policy (`validate_password` plugin) so a
    weak or blank password cannot be set again by accident
-   Shipping `general_log`/`log_error` to a central log pipeline instead of
    a local file, and alerting on unexpected `GRANT`/`CREATE USER` statements
-   Running MariaDB as a dedicated, unprivileged service account with no
    interactive shell, separate from the SSH administration account used in
    this lab
