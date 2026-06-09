#!/bin/sh
# Wait for the firewall to write its IP, then add a route for the external network.
# This ensures response traffic goes through the firewall (not directly via the bridge).
for _ in $(seq 1 20); do
    if [ -f /lab/config/fw_internal_ip.txt ]; then break; fi
    sleep 1
done
if [ -f /lab/config/fw_internal_ip.txt ]; then
    ip route add 10.89.0.0/24 via 10.89.1.2 2>/dev/null || true
fi
