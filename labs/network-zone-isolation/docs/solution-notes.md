# Solution Notes: Flat Cross-Zone Forwarding at the Network Gateway

## Root Cause

`firewall-host` is the only host that bridges the external, DMZ, and internal
Podman networks. It fronts the public web application (port 80, forwarded to
`web-server`) but its `FORWARD` chain has an unconditional `ACCEPT` policy
with no rules distinguishing that one legitimate cross-zone path from any
other. The same gateway that legitimately forwards port 80 to the DMZ also
forwards port 3306 to the internal database and port 445 to the internal file
share, with nothing to tell the two apart. Anyone who can reach the gateway
from the DMZ vantage point can reach every backend zone behind it.

## Impact Demonstration

Run this block on the **student workstation**:

```bash
nmap -Pn -p 80,3306,445 firewall-host
```

All three ports report `open`. Port 80 is expected - that is the public web
path. Ports 3306 and 445 should not be reachable from here at all.

Still on the **student workstation**, confirm both are more than just open
ports - they are live, functioning backend services reachable straight
through the gateway:

```bash
mysqladmin -h firewall-host -P 3306 -u probe ping
```

No valid database credential is used or needed here. The connection
completes at the TCP and MySQL-protocol level, and MariaDB returns a
host-based access rejection (`Host '<address>' is not allowed to connect to
this MariaDB server`) rather than a connection timeout or refusal - that
specific error is only produced by a real MariaDB server on the internal
network that received and evaluated the request against its host access
rules. A closed or genuinely unreachable port would simply fail to connect
at all, with no MariaDB error text.

```bash
smbclient //firewall-host/shared -N -c 'get internal_memo.txt -'
```

This retrieves the internal memo anonymously through the same gateway - a
complete, functioning file read, not just an open port. Between the two
probes, both independent internal services are demonstrably reachable from a
host that should only ever be able to reach the public web application.

## Canonical Remediation

### 1. Reach the gateway host

Run this on the **student workstation**. Enter the student's lab password
when SSH prompts for it:

```bash
ssh -o StrictHostKeyChecking=accept-new firewall@firewall-host
```

The remaining commands through `exit` run in the **firewall-host** SSH
session.

### 2. Replace the forward policy with a default-deny, explicit-allow ruleset

```bash
cat > /tmp/rules.v4-fixed << 'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A FORWARD -p tcp --dport 80 -j ACCEPT
COMMIT
EOF

sudo cp /tmp/rules.v4-fixed /etc/iptables/rules.v4
sudo /opt/lab/start-firewall.sh reload
```

Key properties of this ruleset:

-   Default `FORWARD` policy is `DROP` - nothing crosses a zone boundary
    unless a rule explicitly allows it.
-   Return traffic for connections already permitted (the web path) is
    allowed via `conntrack --ctstate ESTABLISHED,RELATED`.
-   Exactly one new-connection path is allowed: destination port 80, which is
    the DNAT target for the public web application. Ports 3306 and 445 have
    no matching rule, so the default `DROP` policy catches them.
-   Both the live ruleset and `/etc/iptables/rules.v4` receive the change, so
    it survives a firewall restart.

### 3. Confirm the policy and internal service health from the gateway

Still on **firewall-host**:

```bash
sudo iptables -L FORWARD -n -v
cat /etc/iptables/rules.v4
curl -fsS http://web-server/ >/dev/null && echo WEB_HEALTHY
exit
```

`iptables -L FORWARD` and the file contents should both show the `DROP`
default policy with only the port-80 and established/related rules. The curl
should print `WEB_HEALTHY` - the internal `web-server` container itself was
never touched. After `exit`, the prompt is back on the **workstation**.

## Verification

Run this on the **student workstation**:

```bash
nc -z -w3 firewall-host 3306 && echo REACHABLE || echo BLOCKED
nc -z -w3 firewall-host 445 && echo REACHABLE || echo BLOCKED
curl -s -o /dev/null -w '%{http_code}\n' --connect-timeout 5 http://firewall-host/
```

Both `nc` checks should print `BLOCKED`, and the curl should print `200`. The
portal checker verifies the same three outcomes plus the gateway's forwarding
path health (IPv4 forwarding, DNAT, and masquerade), the persisted ruleset,
and the web application's continued availability, so breaking the forwarding
path or the web service cannot produce a false `fixed` result.

## Design Rationale

This remediation demonstrates zone-based least privilege at the network
layer:

1. **Default deny** - a `FORWARD DROP` policy means every new cross-zone
   path must be justified by an explicit rule, not assumed safe by omission.
2. **Explicit allow-list, scoped to the one legitimate path** - only the
   public web port is admitted as a new connection; the database and file
   share are never exposed to the DMZ vantage point at all, regardless of
   whether a client happens to know their ports.
3. **Service continuity as a first-class requirement** - the fix is only
   correct if the web application keeps working. A ruleset that blocks
   everything, including the legitimate path, is not a valid remediation.

This maps directly to CIS Controls v8 Control 12 (Network Infrastructure
Management), NIST SP 800-53 SC-7 (Boundary Protection), CWE-1189 (Improper
Isolation of Shared Resources), and the lateral-movement techniques in MITRE
ATT&CK T1018 (Remote System Discovery) and T1046 (Network Service
Discovery).
