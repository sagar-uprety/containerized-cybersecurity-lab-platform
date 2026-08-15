# Solution Notes: Multi-Service Banner and Debug-Page Information Disclosure

## Root Cause

`target-host` runs its SSH and web services at their verbose, out-of-the-box
defaults: OpenSSH's Debian build appends a distribution tag to the SSH
identification string (`DebianBanner yes`); Apache's `ServerTokens Full` and
`ServerSignature On` put the exact Apache version, OS, and compiled module
list in both the `Server` response header and the footer of every
server-generated error page; the untouched Apache installer landing page is
still being served at `/`; and a static internal diagnostic page was left
reachable at a predictable path. None of these require any credential to
observe - they leak to anyone who can reach the host at all.

## Impact Demonstration

Run every command in this section from the student workstation.

```bash
nc -w 2 target-host 22 </dev/null
```

The raw SSH identification line comes back immediately, unauthenticated,
including the OpenSSH version and a `Debian-<n>` build tag.

```bash
curl -sI http://target-host/
```

The `Server:` header discloses the exact Apache version, the OS, and
loaded module versions (OpenSSL, etc.) - a precise fingerprint an attacker
can cross-reference against known CVEs for that exact build.

```bash
curl -s http://target-host/checker-probe-missing-path
```

A generated 404 response includes a footer repeating the same Apache
version/OS string.

```bash
curl -s http://target-host/
```

The response body is the stock Apache/Debian installer placeholder page,
proving the host is still running default content rather than a reviewed
deployment.

```bash
curl -s http://target-host/internal-status.html
```

This internal diagnostic page (never meant to be public) discloses fabricated
internal hostnames, addresses, and a debug token. In a real incident this
class of leftover debug output is exactly what turns "the server exists"
into "here is what's running behind it and how it is wired together."

None of the five findings above required a username, password, or exploit -
each is a passive read of information the services hand out unprompted.

## Canonical Remediation

### 1. Remove the OS tag from the SSH identification string

Execution context: student workstation, transitioning over SSH to
`root@target-host`. The administrator account uses your own workstation/lab
password; the command below keeps it only in the current shell variable and
clears it afterward.

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@target-host <<'ENDSSH'
set -eu
sed -i 's/^DebianBanner yes/DebianBanner no/' /etc/ssh/sshd_config.d/zz-lab-banner.conf
sshd -t
pkill -HUP sshd
ENDSSH
unset LAB_PASSWORD
```

`DebianBanner no` removes only the distribution suffix from the protocol
identification string; OpenSSH must still announce a protocol version to
negotiate a connection, so `SSH-2.0-OpenSSH_<version>` remains, without the
`Debian-<n>` tag. `sshd -t` validates syntax before the running server is
asked to reload; `pkill -HUP sshd` reloads the already-listening master
process. The reload affects only new connections' identification string, not
this already-open session, so the heredoc above completes and returns
normally.

### 2. Minimize the Apache banner, drop the error-page signature, and remove leftover content

Execution context: student workstation, transitioning over SSH to
`root@target-host` for a second session.

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@target-host <<'ENDSSH'
set -eu
sed -i 's/^ServerTokens Full/ServerTokens Prod/' /etc/apache2/conf-enabled/zz-lab-security.conf
sed -i 's/^ServerSignature On/ServerSignature Off/' /etc/apache2/conf-enabled/zz-lab-security.conf
cat > /var/www/html/index.html <<'HTMLEOF'
<!DOCTYPE html>
<html>
<head><title>Ops Console</title></head>
<body><h1>Internal Ops Console</h1><p>Service is operating normally.</p></body>
</html>
HTMLEOF
rm -f /var/www/html/internal-status.html
apache2ctl configtest
apache2ctl graceful
ENDSSH
unset LAB_PASSWORD
```

`ServerTokens Prod` reduces the `Server` header to the bare product name and
also controls how verbose any remaining signature line would be if one were
shown; `ServerSignature Off` removes that signature line entirely from
generated error and listing pages, rather than merely trimming the version out
of it - `ServerTokens Prod` alone still leaves an `<address>` line naming the
host. Replacing `index.html` retires the stock installer page in
favor of reviewed content, and removing `internal-status.html` takes the
diagnostic page out of the document root entirely rather than merely hiding
a link to it. `apache2ctl configtest` fails loudly on a syntax mistake before
`apache2ctl graceful` reloads the already-running server without dropping
in-flight connections.

## Verification

Run every command in this section from the student workstation, after the
SSH sessions above have ended.

```bash
banner=$(nc -w 2 target-host 22 </dev/null 2>/dev/null | head -c 200)
if printf '%s' "$banner" | grep -qi debian; then
  echo 'ERROR: SSH banner still discloses the distribution'
  exit 1
fi
echo 'SSH identification string no longer discloses the OS'
```

```bash
header=$(curl -fsSI http://target-host/ | tr -d '\r' | awk -F': ' 'tolower($1)=="server"{print $2}')
test "$header" = Apache
echo 'Apache Server header is minimal'
```

```bash
body=$(curl -fsS http://target-host/checker-probe-missing-path || true)
if printf '%s' "$body" | grep -qi '<address>'; then
  echo 'ERROR: error-page footer still discloses a signature line'
  exit 1
fi
echo 'Error-page signature is suppressed'
```

```bash
body=$(curl -fsS http://target-host/)
if printf '%s' "$body" | grep -q 'Debian Default Page'; then
  echo 'ERROR: default installer page is still being served'
  exit 1
fi
echo 'Default installer page has been replaced'
```

```bash
code=$(curl -fsS -o /dev/null -w '%{http_code}' http://target-host/internal-status.html)
test "$code" = 404
echo 'Internal diagnostic page is no longer served'
```

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@target-host true
unset LAB_PASSWORD
echo 'Administrator SSH access still works after the banner change'
```

Finally, click **Run Check** in the portal. Every objective and guardrail
should report `fixed`.

## Design Rationale

This lab deliberately models four independent leaks rather than one, because
that is how information disclosure actually accumulates in production: a
transport-layer identification string (SSH), an application-layer response
header (Apache), a server-generated error page footer, and an orphaned debug
artifact are four different code paths, each configured or left in place
separately, and none of them is fixed by touching the others. Suppressing
just the SSH banner while leaving `ServerTokens Full` in place - or vice
versa - would still hand an attacker most of what they need. The guardrails
(administrator SSH access, site reachability) exist to make explicit that
"minimal disclosure" is not the same as "service disabled": every fix here
is a configuration change to what a service announces about itself, not a
change to whether it works.
