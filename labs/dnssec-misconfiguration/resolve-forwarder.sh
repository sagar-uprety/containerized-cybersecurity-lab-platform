#!/bin/sh
set -eu

# The authoritative host's container IP is assigned dynamically by Podman at
# instance start, so it cannot be baked into the image. Resolve it once,
# before named starts, and rewrite the placeholder left in the runtime
# config. This runs on every start/reset, so a fresh instance always gets a
# correct forwarder address even if the upstream network's addressing
# changes between runs.
# dns-auth is declared as a container dependency so it is created first, but
# that does not guarantee its network-name registration has propagated by
# the moment this script runs, so retry briefly instead of failing on the
# first miss.
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

# Idempotent: matches the whole forwarders clause (placeholder on first
# boot, or a previous run's now-stale address after a plain stop/start
# recreated the containers with new addresses), never just the placeholder
# literal, so a stale IP can never survive a restart.
sed -i -E "s/forwarders \{ [^}]*; \};/forwarders { ${FORWARDER_IP}; };/" /etc/bind/named.conf
