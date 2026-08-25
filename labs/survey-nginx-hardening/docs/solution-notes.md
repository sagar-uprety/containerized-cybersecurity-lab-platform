# Securing an Nginx Web Server - Solution Notes

Answer key for the standardized survey lab. Not served to students.

## Root Cause

The nginx site ships with two documented information-disclosure weaknesses in
`/etc/nginx/conf.d/site.conf` (editable from the workstation at
`/lab/nginx/site.conf`):

-   `server_tokens on;` - the `Server:` response header advertises the exact nginx
    version (CWE-200), free reconnaissance for an attacker.
-   `autoindex on;` in the `/files/` location - directory listing is enabled, so
    anyone can browse and download the seeded `db-backup.sql` and
    `internal-notes.txt` that were never meant to be listed (CWE-548).

Admin access: `nginxadmin@nginx-host` uses the student's own lab password.

## Impact Demonstration

Context: student workstation.

```bash
# Version leaks in the Server header.
curl -sI http://nginx-host:8080/ | grep -i '^server:'

# Directory listing exposes the files.
curl -s http://nginx-host:8080/files/
curl -s http://nginx-host:8080/files/db-backup.sql
```

Expected: `Server: nginx/<version>`; an HTML "Index of /files/" listing; and the
synthetic backup contents.

## Canonical Remediation

Context: student workstation (config editable at `/lab/nginx/site.conf`).

```bash
sed -i 's/server_tokens on;/server_tokens off;/' /lab/nginx/site.conf
sed -i 's/autoindex on;/autoindex off;/' /lab/nginx/site.conf
```

Context: `nginxadmin@nginx-host` (validate and reload nginx).

```bash
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new \
  nginxadmin@nginx-host 'sudo /usr/local/sbin/reload-nginx'
```

`$LAB_PASSWORD` is the student's own lab password; set it first
(`read -rs LAB_PASSWORD`). The reload helper runs `nginx -t` before reloading.

## Verification

Context: student workstation.

```bash
# Version banner gone (Server: nginx, no version).
curl -sI http://nginx-host:8080/ | grep -i '^server:'

# Directory listing now refused.
curl -s -o /dev/null -w '%{http_code}\n' http://nginx-host:8080/files/   # 403

# Home page still serves.
curl -s http://nginx-host:8080/ | grep -q 'Acme Records Portal' && echo OK
```

Then **Run Check** in the portal → `fixed`: version banner hidden, directory
listing disabled, both directives persisted (objectives), home page still
serving (guardrail).

## Reset Behavior

Portal **Reset** destroys and recreates the container and config volume from
versioned source, restoring `server_tokens on;` and `autoindex on;`. Edits
survive an ordinary reload/restart (config on a named volume) but not a reset.

## Known Failure Modes

-   Student edits the config but does not reload → the running server keeps the old
    behavior until `reload-nginx` runs.
-   Student sets an invalid directive → `nginx -t` in the reload helper fails and
    the reload is refused (nginx keeps the last good config); fix the syntax and
    reload again.
