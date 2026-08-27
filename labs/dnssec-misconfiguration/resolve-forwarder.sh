#!/bin/sh
set -eu

# Resolve the dynamic authoritative-container address before named starts.
# Retry while container DNS registration propagates.
FORWARDER_IP=""
i=0
while [ "$i" -lt 15 ]; do
    FORWARDER_IP=$(getent hosts dns-auth 2>/dev/null | awk '{print $1}' | head -n1)
    [ -n "$FORWARDER_IP" ] && break
    i=$((i + 1))
    sleep 1
done
if [ -z "${FORWARDER_IP:-}" ]; then
    echo "pre-start: could not resolve dns-auth address" >&2
    exit 1
fi

# Replace the entire clause so stale container addresses cannot survive restart.
sed -i -E "s/forwarders \{ [^}]*; \};/forwarders { ${FORWARDER_IP}; };/" /etc/bind/named.conf
