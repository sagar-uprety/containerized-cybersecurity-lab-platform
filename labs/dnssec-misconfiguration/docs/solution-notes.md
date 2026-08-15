# Solution Notes: Open Recursive Resolver and Missing DNSSEC Validation

## Root Cause

Three independent failures combine on `dns-resolver`:

1. `allow-recursion { any; };` lets any host that can reach the resolver -
   not just the trusted client network - use it to perform full recursive
   lookups. This is the open-resolver condition that makes a server usable
   for reflection/amplification abuse against third parties.
2. `dnssec-validation no;` means the resolver accepts whatever answer it
   receives and hands it straight to the client, even if the answer's
   cryptographic signature is missing or does not match a domain the
   resolver could otherwise verify. This is exactly the gap a cache-poisoning
   or on-path forgery attack needs: nothing on the resolver ever checks
   authenticity.
3. No UDP response-size cap means a single `ANY` query against a signed
   name with several record types returns everything at once - every record
   type plus its `RRSIG` and the name's `NSEC`/`RRSIG(NSEC)` pair - over a
   single UDP datagram. A small forged query turns into a large flood
   directed at whatever address the attacker claimed to be, which is exactly
   the amplification behavior attackers abuse in reflection DDoS.

## Investigation

```bash
# student workstation
dig +short www.lab.internal @dns-resolver
dig www.lab.internal @dns-resolver
```

The trusted client network gets a normal, recursive answer (`status:
NOERROR`, `flags: qr rd ra`). That alone does not prove the resolver is
_open_ - only that it works for the network it is supposed to serve. To test
whether it also answers a source outside that trusted network, use the
authoritative host as a vantage point: it sits on a separate network segment
from the workstation and only exists to serve `lab.internal`, so any answer
it can get out of the resolver for a name it did not ask about itself proves
the resolver is doing full recursion for an untrusted source. The
workstation has no direct network path to that host - the resolver is the
only host with a foot on both networks - so reach it by hopping through the
resolver's own administrative account first:

```bash
# student workstation
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new dnsresolveradmin@dns-resolver \
  "sshpass -p '$LAB_PASSWORD' ssh -o StrictHostKeyChecking=accept-new dnsauthadmin@dns-auth \
  'dig +time=3 +tries=1 www.lab.internal @dns-resolver'"
unset LAB_PASSWORD
```

Both hops use the same lab password. The `dig` runs on the authoritative
host, so the query's actual source address is that host's - the SSH path
used to get a shell there does not change which network the DNS query
itself comes from.

The status is `NOERROR` with `ra` set in the flags line - the resolver
performed recursion for a source that has no business using it as a
resolver at all.

Next, check whether the resolver can be made to hand back data it has no way
to vouch for:

```bash
# student workstation
dig poisoned.lab.internal @dns-resolver
```

This returns `status: NOERROR` with an answer, even though (as covered in
Remediation) that particular record in the authoritative zone is missing its
signature - the resolver never asked whether it should trust it.

Finally, check the amplification angle:

```bash
# student workstation
dig ANY bigtarget.lab.internal @dns-resolver
```

The `;; ANSWER:` count in the response is 9 (two `A` records, one `TXT`, one
`MX`, each with its own `RRSIG`, plus the name's `NSEC` and that record's
`RRSIG` too) for a single small query - a large amplification factor handed
to whoever sent the request, at whatever address they claimed to be.

## Remediation

### Step 1: Restrict Recursion to the Trusted Client Network

```bash
# student workstation
CLIENT_CIDR=$(ip -o -4 route show scope link | awk '{print $1}' | head -n1)
echo "Client network: $CLIENT_CIDR"
sed -i "s#allow-recursion { any; };#allow-recursion { ${CLIENT_CIDR}; };#" /lab/dns-resolver/named.conf
```

`ip -o -4 route show scope link` reads the kernel's connected-route entry
for the workstation's own network, which is already expressed as a network
address plus prefix length, so the ACL is derived from the environment
rather than a hardcoded guess. BIND's address-match-list parser requires the
network form specifically - an address with nonzero host bits (such as the
workstation's own `10.x.x.3/24`) is rejected outright as an
"address/prefix length mismatch" rather than silently masked, so the host
address itself is not usable here even though it identifies the same
network.

### Step 2: Enable DNSSEC Validation

The authoritative host publishes a trust anchor for `lab.internal` to a
volume shared only between the two service containers, at a fixed path
inside the resolver's own filesystem, regenerated on every start so no key
material is ever committed anywhere:

```bash
# student workstation
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new dnsresolveradmin@dns-resolver \
  'test -s /etc/bind/dnssec-shared/dnssec-trust-anchor.conf && echo trust_anchor_present'
unset LAB_PASSWORD
```

Expect `trust_anchor_present`. Now turn validation on and load that trust
anchor:

```bash
# student workstation
sed -i 's/dnssec-validation no;/dnssec-validation yes;/' /lab/dns-resolver/named.conf
printf '\ninclude "/etc/bind/dnssec-shared/dnssec-trust-anchor.conf";\n' >> /lab/dns-resolver/named.conf
```

### Step 3: Reduce Amplification Exposure

```bash
# student workstation
sed -i 's/allow-transfer { none; };/allow-transfer { none; };\n    max-udp-size 512;/' /lab/dns-resolver/named.conf
```

`max-udp-size` caps how large a UDP response this resolver will send before
truncating it (setting the `TC` bit and returning an empty answer instead)
rather than exceeding that size. A well-behaved client such as `dig` follows
a truncated UDP response with an ordinary TCP retry and gets the full
answer, which is why the client this resolver is meant to serve is
unaffected - but an attacker spoofing a victim's IP address to trigger
reflection cannot complete a TCP handshake for a connection it will never
see the response to, so it never gets to retry over TCP at all. This closes
the same amplification path a smaller `ANY` response would, without
requiring the underlying zone data to change. (`minimal-any yes;` looks like
the more targeted fix for `ANY`-specific amplification and is documented for
authoritative servers, but it has no effect here: this resolver only ever
relays `lab.internal` answers through a `forward only` zone rather than
constructing them itself, and BIND's own response-minimization logic does
not run on a purely relayed answer. `max-udp-size` is a wire-level cap on
what this resolver's own listening socket will emit, so it applies
regardless of where the answer came from.)

### Step 4: Restart BIND

The `dnsresolveradmin` account uses your workstation/lab password. Enter it
at the hidden prompt; the command keeps it only in the current shell
variable and clears that variable afterward:

```bash
# student workstation
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new dnsresolveradmin@dns-resolver 'sudo /usr/local/sbin/restart-bind9'
unset LAB_PASSWORD
```

## Verification

### Recursion Refused From Outside the Trusted Network

```bash
# student workstation
read -rsp 'Lab password: ' LAB_PASSWORD; echo
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new dnsresolveradmin@dns-resolver \
  "sshpass -p '$LAB_PASSWORD' ssh -o StrictHostKeyChecking=accept-new dnsauthadmin@dns-auth \
  'dig +time=3 +tries=1 www.lab.internal @dns-resolver'" | grep -q 'status: REFUSED'
unset LAB_PASSWORD
```

### Unsigned/Forged Answer Rejected

```bash
# student workstation
dig +time=3 +tries=1 poisoned.lab.internal @dns-resolver | grep -q 'status: SERVFAIL'
```

### Validation Is Genuinely Active, Not Coincidental

```bash
# student workstation
dig +dnssec www.lab.internal @dns-resolver | grep -qi 'flags:.*\bad\b'
```

The correctly-signed `www.lab.internal` record now comes back with the `ad`
(Authenticated Data) flag set, proving the resolver checked the signature
and it passed - the `poisoned` record above was rejected because it failed
that same check, not because it was blocked for some unrelated reason.

### Amplification Reduced

```bash
# student workstation
dig +time=3 +tries=1 +notcp +ignore ANY bigtarget.lab.internal @dns-resolver
```

`+notcp` disables `dig`'s automatic TCP retry and `+ignore` displays a
truncated UDP response instead of discarding it, so this shows exactly what
an attacker relying on spoofed UDP would get: `flags: qr tc ...` with the
`tc` (truncated) bit set and `ANSWER: 0` - a 79-or-so-byte response instead
of the 666-byte flood from the Investigation phase, roughly an order of
magnitude smaller than the query that produced it rather than several times
larger.

### Trusted Clients Still Resolve

```bash
# student workstation
dig +short www.lab.internal @dns-resolver
```

Still returns `10.50.0.10` - the fix narrowed who may use the resolver and
what it hands back, but did not break the client it exists to serve.

## Design Rationale

This remediation teaches three layered controls that map to three different
failure modes of an open, non-validating resolver:

1. **Network trust boundary** (`allow-recursion`) - only clients on the
   network the resolver is meant to serve may use it for recursion at all.
   This alone stops the resolver being abused as a reflector by arbitrary
   internet hosts, but says nothing about whether the answers it gives are
   trustworthy.
2. **Cryptographic integrity** (`dnssec-validation` plus a trust anchor) -
   even a client that is allowed to query the resolver should not have to
   blindly trust every answer. Validation catches injected, stripped, or
   stale signatures regardless of how the bad data arrived - spoofing,
   cache poisoning, or a compromised upstream all look the same to a
   validator: unverifiable, and therefore refused.
3. **Reduced amplification surface** (`max-udp-size`) - even a correctly
   scoped, validating resolver can still be leveraged for a larger response
   than a query deserves. Capping the UDP response size closes that
   multiplier for spoofed-source (UDP-only) abuse specifically, without
   requiring every zone record to be redesigned, while leaving the resolver
   fully usable for real clients that can complete a TCP retry.

None of these three controls substitutes for the others: a resolver that is
network-restricted but non-validating is still vulnerable to poisoning by an
attacker who _is_ inside the trusted network (or upstream of it); a
validating resolver that is still open can still be abused for reflection
even though the reflected answers happen to be trustworthy.
