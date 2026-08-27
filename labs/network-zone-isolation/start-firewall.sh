#!/bin/sh
set -u

mkdir -p /etc/iptables /var/log /var/lib/firewall

if [ ! -f /etc/iptables/rules.v4 ]; then
    cp /opt/lab/baseline/rules.v4 /etc/iptables/rules.v4
fi

sudo iptables-restore < /etc/iptables/rules.v4

if [ "${1:-}" = "reload" ]; then
    echo "Reloaded /etc/iptables/rules.v4"
    exit 0
fi

sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

WEB_IP=""
DB_IP=""
FS_IP=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
    WEB_IP=$(getent hosts web-server 2>/dev/null | awk 'NR == 1 {print $1}')
    DB_IP=$(getent hosts database 2>/dev/null | awk 'NR == 1 {print $1}')
    FS_IP=$(getent hosts file-server 2>/dev/null | awk 'NR == 1 {print $1}')
    if [ -n "$WEB_IP" ] && [ -n "$DB_IP" ] && [ -n "$FS_IP" ]; then break; fi
    sleep 1
done

# NAT exposes backend zones; FORWARD rules enforce isolation.
if [ -n "$WEB_IP" ]; then
    sudo iptables -t nat -C PREROUTING -p tcp --dport 80 \
        -j DNAT --to-destination "${WEB_IP}:80" 2>/dev/null ||
        sudo iptables -t nat -A PREROUTING -p tcp --dport 80 \
            -j DNAT --to-destination "${WEB_IP}:80"
fi
if [ -n "$DB_IP" ]; then
    sudo iptables -t nat -C PREROUTING -p tcp --dport 3306 \
        -j DNAT --to-destination "${DB_IP}:3306" 2>/dev/null ||
        sudo iptables -t nat -A PREROUTING -p tcp --dport 3306 \
            -j DNAT --to-destination "${DB_IP}:3306"
fi
if [ -n "$FS_IP" ]; then
    sudo iptables -t nat -C PREROUTING -p tcp --dport 445 \
        -j DNAT --to-destination "${FS_IP}:445" 2>/dev/null ||
        sudo iptables -t nat -A PREROUTING -p tcp --dport 445 \
            -j DNAT --to-destination "${FS_IP}:445"
fi
sudo iptables -t nat -C POSTROUTING -j MASQUERADE 2>/dev/null ||
    sudo iptables -t nat -A POSTROUTING -j MASQUERADE

echo "Rules loaded from /etc/iptables/rules.v4"
echo "NAT: :80 -> ${WEB_IP:-unresolved}:80, :3306 -> ${DB_IP:-unresolved}:3306, :445 -> ${FS_IP:-unresolved}:445"
echo "Reload with: sudo /opt/lab/start-firewall.sh reload"

touch /var/log/firewall.log
tail -f /var/log/firewall.log
