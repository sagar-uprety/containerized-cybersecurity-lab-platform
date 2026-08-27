#!/bin/sh
set -eu

# Regenerate keys per instance and publish the trust anchor through shared storage.

KEYDIR=/etc/bind/keys
ZONEDIR=/etc/bind/zones
SHARED=/etc/bind/dnssec-shared
ORIGIN=lab.internal

mkdir -p "$SHARED"

# Sign as root to avoid libuv failure under su, then return artifacts to bind.
KEYBASENAME=$(cd "$KEYDIR" && dnssec-keygen -a ECDSAP256SHA256 -f KSK -n ZONE "${ORIGIN}.")

cp "$ZONEDIR/db.lab.internal.unsigned" "$ZONEDIR/db.lab.internal"

# Use one combined KSK/ZSK and let smart signing discover it.
(cd "$ZONEDIR" && dnssec-signzone -S -z -o "${ORIGIN}." -K "$KEYDIR" -N INCREMENT -e +2592000 -f db.lab.internal.signed db.lab.internal) >/dev/null

# Strip the target RRSIG to create an unsigned record inside a signed zone.
# Track owners because wrapped RRSIG records omit repeated owner names.
awk '
    /^[^[:space:]]/ { owner = $1 }
    skip {
        if ($0 ~ /\)/) skip = 0
        next
    }
    owner == "poisoned.lab.internal." && $0 ~ /RRSIG[[:space:]]+A[[:space:]]/ {
        if ($0 !~ /\)/) skip = 1
        next
    }
    { print }
' "$ZONEDIR/db.lab.internal.signed" > "$ZONEDIR/db.lab.internal.signed.tmp"
mv "$ZONEDIR/db.lab.internal.signed.tmp" "$ZONEDIR/db.lab.internal.signed"

# Rejoin wrapped DNSKEY data for named.conf trust-anchor syntax.
DNSKEY_RDATA=$(grep 'IN DNSKEY' "$KEYDIR/${KEYBASENAME}.key" | sed -E 's/^.*IN[[:space:]]+DNSKEY[[:space:]]+//')
DNSKEY_FLAGS=$(printf '%s' "$DNSKEY_RDATA" | awk '{print $1}')
DNSKEY_PROTO=$(printf '%s' "$DNSKEY_RDATA" | awk '{print $2}')
DNSKEY_ALG=$(printf '%s' "$DNSKEY_RDATA" | awk '{print $3}')
DNSKEY_DATA=$(printf '%s' "$DNSKEY_RDATA" | awk '{for (i = 4; i <= NF; i++) printf "%s", $i}')

cat > "$SHARED/dnssec-trust-anchor.conf" << EOF
trust-anchors {
    ${ORIGIN}. static-key ${DNSKEY_FLAGS} ${DNSKEY_PROTO} ${DNSKEY_ALG} "${DNSKEY_DATA}";
};
EOF
chmod 0644 "$SHARED/dnssec-trust-anchor.conf"

chown -R bind:bind "$KEYDIR" "$ZONEDIR"
