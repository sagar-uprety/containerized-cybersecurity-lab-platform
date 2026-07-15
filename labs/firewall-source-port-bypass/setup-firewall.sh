#!/bin/sh
set -u

mkdir -p /etc/iptables /var/log /lab/config /var/lib/firewall

if [ ! -f /etc/iptables/rules.v4 ]; then
    cp /opt/lab/baseline/rules.v4 /etc/iptables/rules.v4
fi

sudo iptables-restore < /etc/iptables/rules.v4

if [ "${1:-}" = "reload" ]; then
    echo "Reloaded /etc/iptables/rules.v4"
    exit 0
fi

sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

WORKSTATION_IP=""
INTERNAL_SERVER_IP=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
    WORKSTATION_IP=$(getent hosts workstation 2>/dev/null | awk 'NR == 1 {print $1}')
    INTERNAL_SERVER_IP=$(getent hosts internal-server 2>/dev/null | awk '{print $1}' | head -1)
    if [ -n "$WORKSTATION_IP" ] && [ -n "$INTERNAL_SERVER_IP" ]; then break; fi
    sleep 1
done

FW_EXTERNAL_IP=""
if [ -n "$WORKSTATION_IP" ]; then
    FW_EXTERNAL_IP=$(ip route get "$WORKSTATION_IP" 2>/dev/null |
        awk 'NR == 1 {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')
fi

if [ -n "$INTERNAL_SERVER_IP" ] && [ -n "$FW_EXTERNAL_IP" ]; then
    sudo iptables -t nat -C PREROUTING -p tcp --dport 8080 \
        -j DNAT --to-destination "${INTERNAL_SERVER_IP}:8080" 2>/dev/null ||
        sudo iptables -t nat -A PREROUTING -p tcp --dport 8080 \
            -j DNAT --to-destination "${INTERNAL_SERVER_IP}:8080"
    sudo iptables -t nat -C POSTROUTING -j MASQUERADE 2>/dev/null ||
        sudo iptables -t nat -A POSTROUTING -j MASQUERADE

    echo "$FW_EXTERNAL_IP" > /lab/config/fw_external_ip.txt
    echo "Firewall started. External IP: $FW_EXTERNAL_IP"
    echo "NAT: ${FW_EXTERNAL_IP}:8080 -> ${INTERNAL_SERVER_IP}:8080"
else
    echo "$FW_EXTERNAL_IP" > /lab/config/fw_external_ip.txt
    echo "Firewall started without a complete forwarding path"
fi

echo "Rules loaded from /etc/iptables/rules.v4"
echo "Reload with: sudo /opt/lab/start-firewall.sh reload"

touch /var/log/firewall.log
tail -f /var/log/firewall.log
