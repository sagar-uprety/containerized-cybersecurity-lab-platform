#!/bin/sh
set -u

mkdir -p /etc/iptables /var/log /lab/config /var/lib/firewall

# Copy baseline rules if not already present
if [ ! -f /etc/iptables/rules.v4 ]; then
    cp /opt/lab/baseline/rules.v4 /etc/iptables/rules.v4
fi
if [ ! -f /etc/iptables/rules.v6 ]; then
    cp /opt/lab/baseline/rules.v6 /etc/iptables/rules.v6
fi

# Load iptables rules (via sudo — user has NOPASSWD for iptables-restore)
sudo iptables-restore < /etc/iptables/rules.v4
sudo ip6tables-restore < /etc/iptables/rules.v6

# Enable IP forwarding (may already be on; ignore failures)
sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
sudo sysctl -w net.ipv6.conf.all.forwarding=1 >/dev/null 2>&1 || true

# Discover firewall's external IP (first non-loopback interface)
FW_EXTERNAL_IP=""
for iface in $(ip -o -4 addr show | awk '{print $2}' | sort -u); do
    ip_addr=$(ip -4 addr show "$iface" | awk '/inet /{print $2}' | cut -d/ -f1 | head -1)
    if [ "$iface" = "lo" ]; then continue; fi
    FW_EXTERNAL_IP="$ip_addr"
    break
done

# Resolve internal-server IP via Podman DNS (with retry — DNS may not be ready yet)
INTERNAL_SERVER_IP=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
    INTERNAL_SERVER_IP=$(getent hosts internal-server 2>/dev/null | awk '{print $1}' | head -1)
    if [ -n "$INTERNAL_SERVER_IP" ]; then break; fi
    sleep 1
done

if [ -n "$INTERNAL_SERVER_IP" ] && [ -n "$FW_EXTERNAL_IP" ]; then
    # DNAT: workstation connects to firewall:8080, firewall forwards to internal-server:8080
    # This makes traffic traverse the FORWARD chain (where the iptables rules live)
    sudo iptables -t nat -A PREROUTING -p tcp --dport 8080 -j DNAT --to-destination "${INTERNAL_SERVER_IP}:8080"
    sudo iptables -t nat -A POSTROUTING -j MASQUERADE

    echo "$FW_EXTERNAL_IP" > /lab/config/fw_internal_ip.txt
    echo "Firewall started. External IP: $FW_EXTERNAL_IP"
    echo "NAT: ${FW_EXTERNAL_IP}:8080 → ${INTERNAL_SERVER_IP}:8080"
else
    echo "$FW_EXTERNAL_IP" > /lab/config/fw_internal_ip.txt
    echo "Firewall started. External IP: $FW_EXTERNAL_IP (WARNING: internal-server not resolved)"
fi

echo "Rules loaded from /etc/iptables/rules.v4 and /etc/iptables/rules.v6"
echo "Edit rules files and reload with: sudo iptables-restore < /etc/iptables/rules.v4"

# Hold foreground
touch /var/log/firewall.log
tail -f /var/log/firewall.log
