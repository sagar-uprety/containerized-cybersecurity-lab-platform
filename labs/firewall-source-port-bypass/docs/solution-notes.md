# Solution Notes: Firewall Rule Misconfiguration - Source-Port Bypass

## Root Cause

The IPv4 firewall treats TCP source port 80 as proof that a packet belongs to
HTTP reply traffic. `--sport 80` does not establish direction or history: it
also matches the first packet of a new connection deliberately bound to source
port 80. Connection tracking is required to distinguish established replies
from new connections.

## Impact Demonstration

Run this block in the **workstation** browser terminal:

```bash
FW_IP=$(cat /lab/config/fw_external_ip.txt)
curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 http://$FW_IP:8080/
curl --local-port 80 -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://$FW_IP:8080/
```

The first curl should fail (blocked by default DROP). The second should return
200 (bypass via source port 80). This demonstrates that the supposed reply rule
admits a new connection whose client binds source port 80.

## POC Fix

### 1. Reach the firewall host

Run this in the **workstation** terminal. Enter the student's lab password when
SSH prompts for it:

```bash
ssh -o StrictHostKeyChecking=accept-new firewall@firewall-host
```

The remaining commands through `exit` run in the **firewall-host** SSH session.

### 2. Persist and load the stateful policy

Create a complete replacement ruleset in a writable temporary file:

```bash
cat > /tmp/rules.v4-fixed << 'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
COMMIT
EOF

sudo cp /tmp/rules.v4-fixed /etc/iptables/rules.v4
sudo /opt/lab/start-firewall.sh reload
```

Key changes:

-   The conntrack rule replaces the `--sport 80` shortcut
-   Both active state and `/etc/iptables/rules.v4` receive the change
-   The firewall's reload helper is available to the student account
-   Default policy stays DROP

### 3. Verify policy and internal service health

Still on **firewall-host**, inspect both policy copies and test nginx from the
internal side:

```bash
sudo iptables -L FORWARD -n -v
cat /etc/iptables/rules.v4
curl -fsS http://internal-server:8080/health
exit
```

The active and persistent rules should contain conntrack, omit `--sport 80`,
and use a default DROP policy. The health request should print `ok`. After
`exit`, the prompt is back on the **workstation**.

## Expected Verification

Run this in the **workstation** terminal:

```bash
FW_IP=$(cat /lab/config/fw_external_ip.txt)
curl --local-port 80 -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://$FW_IP:8080/
```

The request should time out and print `000`. The portal checker also verifies
the active and persistent policy, nginx health from the internal side, IPv4
forwarding and masquerade, and a fresh packet count on the correct DNAT rule.
Breaking nginx or the forwarding path therefore cannot produce a false `fixed`
result.

## Final-Lab Improvement

For production:

-   Add explicit logging rules before DROP for troubleshooting
-   Consider nftables instead of iptables for modern RHEL
-   Implement egress filtering (not just ingress)
-   Add rate limiting to prevent DDoS amplification
-   Use network zones / zones-based firewalld for managed environments
