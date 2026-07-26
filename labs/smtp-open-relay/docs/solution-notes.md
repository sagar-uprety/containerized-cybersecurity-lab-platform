# Solution Notes: SMTP Open Relay and Spoofing

## Root Cause

Postfix is configured as an open relay:

1. `mynetworks = 0.0.0.0/0` tells Postfix to trust every IP address on the
   network for relay purposes.
2. `smtpd_relay_restrictions` checks `permit_mynetworks` before
   `reject_unauth_destination`, so every IPv4 client is permitted before the
   rejection rule can run.

This means any machine on the `mail-net` network can submit and queue relay
mail using any sender address, including addresses the sender does not own.

## Investigation

From the workstation:

```bash
swaks --to recipient@test.local --from spoofed@external.com --server postfix-host --port 25
```

The server responds with `250 2.0.0 Ok: queued` — the message is accepted
and queued for delivery, even though the sender address is spoofed and the
client is not authenticated.

Inspect the current relay configuration through the shared volume:

```bash
grep -E '^(mynetworks|smtpd_relay_restrictions) =' /lab/postfix/main.cf
```

The output shows `mynetworks = 0.0.0.0/0`. Although
`reject_unauth_destination` is present, every IPv4 client matches the earlier
`permit_mynetworks` rule and bypasses it.

## Remediation

### Step 1: Restrict mynetworks

Edit the Postfix configuration via the shared volume:

```bash
sed -i 's/^mynetworks = 0.0.0.0\/0/mynetworks = 127.0.0.0\/8/' /lab/postfix/main.cf
```

This limits relay authorization to local connections only. In a real
environment you would add the specific internal subnet that trusted clients
belong to.

### Step 2: Reload Postfix

The `postfixadmin` account uses your workstation/lab password. Enter it at
the hidden prompt:

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new postfixadmin@postfix-host 'sudo /usr/local/sbin/restart-postfix'
unset LAB_PASSWORD
```

## Verification

### Relay Rejected from Untrusted Source

From the workstation:

```bash
swaks --to recipient@test.local --from spoofed@external.com --server postfix-host --port 25 2>&1 | grep -qiE '554|5\.7\.1|relaying denied|rejected|not permitted|access denied'
```

Expected: the command exits 0 (grep match found) — relay is rejected.

### mynetworks Is Restricted

```bash
grep '^mynetworks = ' /lab/postfix/main.cf | grep -qx 'mynetworks = 127.0.0.0/8'
```

Expected: exit 0 — mynetworks includes localhost and excludes broad subnets.

### Relay Safety Restriction Active

```bash
grep '^smtpd_relay_restrictions = ' /lab/postfix/main.cf | grep -q 'reject_unauth_destination'
```

Expected: exit 0 — the rejection clause is present.

## Design Rationale

This remediation teaches the layered relay control model:

1. **mynetworks** — defines which client IP addresses are trusted. Never
   use `0.0.0.0/0` unless the server is intended as a public relay.
2. **smtpd_relay_restrictions** — the gatekeeper. `permit_mynetworks`
   allows trusted clients, while `reject_unauth_destination` blocks relay to
   non-local domains for everyone else.
3. **Rule order** — a broad permit match bypasses later rejection. Keeping the
   rejection rule is necessary, but it cannot compensate for trusting every
   client address.
