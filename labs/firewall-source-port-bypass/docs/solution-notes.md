# Solution Notes: Firewall Rule Misconfiguration - Source-Port Bypass

## Root Cause

The firewall uses stateless rules that match on source port numbers. The rules
intended to allow return HTTP and DNS traffic (`--sport 80`, `--sport 53`)
actually permit any inbound connection that originates from those source ports -
not just replies to outbound requests. Additionally, the IPv6 firewall
(ip6tables) has no rules at all, leaving the dual-stack completely unprotected.

## Impact Demonstration

```bash
# Get the firewall's internal IP
FW_IP=$(cat /lab/config/fw_internal_ip.txt)

# Direct connection from random high port - blocked by default DROP policy
curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 http://$FW_IP:8080/

# Connection from source port 80  - bypasses the firewall!
curl --local-port 80 -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://$FW_IP:8080/

# IPv6  - completely open, no firewall rules at all
curl -6 -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://[::1]:8080/ 2>&1 || true
```

The first curl should fail (blocked by default DROP). The second should return
200 (bypass via source port 80). This demonstrates that the "return traffic"
rules are actually open-door policies for any attacker who spoofs source port 80.

## POC Fix

### 1. Fix IPv4 rules - replace stateless with stateful

The student must write proper iptables-restore rules using conntrack:

```bash verifier
cat > /tmp/rules.v4-fixed << 'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

# Stateful rule: allow return traffic for established connections
-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow outbound HTTP to external servers
-A FORWARD -p tcp --dport 80 -j ACCEPT

# Allow outbound DNS queries
-A FORWARD -p udp --dport 53 -j ACCEPT

COMMIT
EOF

sudo iptables-restore < /tmp/rules.v4-fixed
sudo cp /tmp/rules.v4-fixed /etc/iptables/rules.v4
```

Key changes:

-   The conntrack rule replaces BOTH `--sport 80` and `--sport 53` rules
-   The conntrack rule MUST come first (before the dport rules)
-   The `--sport` rules are removed entirely
-   Default policy stays DROP

### 2. Fix IPv6 rules - write from scratch

The student must create equivalent IPv6 rules (currently there are none):

```bash verifier
cat > /tmp/rules.v6-fixed << 'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

# Stateful rule: allow return traffic for established connections
-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow outbound HTTP to external servers
-A FORWARD -p tcp --dport 80 -j ACCEPT

# Allow outbound DNS queries
-A FORWARD -p udp --dport 53 -j ACCEPT

COMMIT
EOF

sudo ip6tables-restore < /tmp/rules.v6-fixed
sudo cp /tmp/rules.v6-fixed /etc/iptables/rules.v6
```

### 3. Verify rules are loaded

```bash
sudo iptables -L FORWARD -n -v
sudo ip6tables -L FORWARD -n -v
```

The IPv4 FORWARD chain should show the conntrack rule and the two dport rules.
The IPv6 FORWARD chain should show the same. Neither should have `--sport` rules.

## Expected Verification

```bash
FW_IP=$(cat /lab/config/fw_internal_ip.txt)

# Source-port bypass should no longer work
curl --local-port 80 -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://$FW_IP:8080/

# Direct high-port connection still blocked
curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 http://$FW_IP:8080/

# Outbound HTTP still works
curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://example.com/

# Rules are correct
sudo iptables -L FORWARD -n
```

Both curl commands to the internal server should fail (connection refused or
timeout). Outbound HTTP should still return 200. The iptables listing should
show conntrack + dport rules only - no sport rules.

## Final-Lab Improvement

For production:

-   Add explicit logging rules before DROP for troubleshooting
-   Consider nftables instead of iptables for modern RHEL
-   Implement egress filtering (not just ingress)
-   Add rate limiting to prevent DDoS amplification
-   Use network zones / zones-based firewalld for managed environments
