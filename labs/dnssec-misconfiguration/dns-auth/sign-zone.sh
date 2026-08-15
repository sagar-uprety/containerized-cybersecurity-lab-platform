#!/bin/sh
set -eu

# Every start/reset regenerates a fresh DNSSEC key pair and re-signs the
# zone from its static, unsigned source - no private key material is ever
# committed to the repository. The resulting public key is published to a
# volume shared with the resolver host so a hardened resolver configuration
# can reference it as a trust anchor without hardcoding a value that changes
# on every instance.

KEYDIR=/etc/bind/keys
ZONEDIR=/etc/bind/zones
SHARED=/etc/bind/dnssec-shared
ORIGIN=lab.internal

mkdir -p "$SHARED"

# Run key generation and signing as root, not as the unprivileged 'bind'
# user: dnssec-signzone initializes the same networking event loop 'named'
# uses, and doing that under 'su bind' in this container's user/session
# context reliably aborts with a libuv "too many open files" error even
# though ulimits are generous - a 'su' session-setup quirk, not a real
# resource shortage (running the identical command as root does not
# reproduce it). named itself never runs as root - only this one-shot
# offline signing step does, and every artifact it produces is handed back
# to 'bind' below before named starts.
KEYBASENAME=$(cd "$KEYDIR" && dnssec-keygen -a ECDSAP256SHA256 -f KSK -n ZONE "${ORIGIN}.")

cp "$ZONEDIR/db.lab.internal.unsigned" "$ZONEDIR/db.lab.internal"

# -S (smart signing) auto-discovers the key(s) in -K's directory; -z allows
# the single KSK-flagged key to also sign the zone data itself (a combined
# signing key), since this lab intentionally uses one key pair rather than
# a separate KSK/ZSK split.
(cd "$ZONEDIR" && dnssec-signzone -S -z -o "${ORIGIN}." -K "$KEYDIR" -N INCREMENT -e +2592000 -f db.lab.internal.signed db.lab.internal) >/dev/null

# Simulate an injected/forged record: strip only the RRSIG covering the
# 'poisoned' host's address after signing. The A record itself is untouched
# and still looks like ordinary zone data, but it no longer carries proof of
# authenticity. A validating resolver must treat an unsigned answer inside an
# otherwise-signed zone as bogus and refuse it; a non-validating resolver has
# no way to tell the difference and hands it to the client unchanged.
#
# dnssec-signzone writes RRSIGs in wrapped, multi-line "( ... )" form and
# (per standard master-file convention) omits the owner name on every line
# after the first for a given name, so a single-line pattern anchored on the
# owner name never matches the RRSIG line itself. Track the most recently
# seen owner name across lines instead, and once the target RRSIG's opening
# line is found, drop every line through its closing ")".
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

# The .key file's DNSKEY rdata is "<flags> <protocol> <algorithm> <base64
# key data...>", and the base64 key data itself is conventionally printed
# with internal spaces splitting it into readable chunks (still one logical
# field, per RFC 1035 master-file convention) - not a line wrap. named.conf's
# trust-anchors grammar needs that key data as a single quoted string with
# no embedded whitespace, so the chunks must be rejoined before quoting.
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
