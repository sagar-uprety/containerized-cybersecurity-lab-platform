# DNS Resolver Trust and Access Control

## Scenario

**Role:** Junior Linux administrator

Monitoring flagged an unusual volume of DNS lookups reaching the internal
recursive resolver from outside the expected client segment, and a routine
spot-check of a recent answer did not match what the domain's own records
should contain. You have been asked to confirm whether the resolver's trust
boundaries are intact before it becomes a bigger problem.

## Why This Matters

DNS sits underneath almost every other service, which is exactly why
misconfigured resolvers are worth so much to whoever finds them. Large-scale
internet measurement has found hundreds of thousands of DNS services sitting
behind misconfigured firewalls, with the large majority of them answering
queries in a way that lets a small request be turned into a much larger
response aimed at whoever the requester claims to be (Deng, IEEE S&P 2025).
Industry threat-landscape reporting separately places DNS-based traffic among
the most common categories of distributed denial-of-service activity observed
in recent years. A resolver that will talk to anyone, and that can't tell a
genuine answer from a forged one, is a liability to more than just the team
that runs it.

## Objectives

By the end of this lab you should be able to:

-   Trace how a recursive resolver produces an answer for a client, and
    explain why testing "can I reach it" from one network tells you less
    than you'd think about who else can reach it.
-   Demonstrate, using a domain you control, that a resolver which does not
    check answer authenticity will accept a record it has no way to vouch
    for.
-   Configure a resolver to cryptographically validate DNS answers against a
    domain's published key material, and verify that validation is actually
    happening rather than assumed.
-   Scope which network sources may use a resolver for recursive lookups,
    and confirm that legitimate clients are unaffected by the change.
-   Recognize when a DNS response is disproportionately large for the query
    that produced it, and reduce that exposure without removing legitimate
    data.

## Prerequisites

Before starting this lab, you should be familiar with:

-   The basic shape of DNS resolution - the difference between a stub
    client, a recursive resolver, and an authoritative server, and roughly
    what each one does with a query.
-   How to read `dig` output: the question, answer, and status sections, and
    common status codes such as `NOERROR`, `NXDOMAIN`, `SERVFAIL`, and
    `REFUSED`.
-   General familiarity with SSH and editing a text file from a terminal.

If you need to review these topics, see:

-   [ISC BIND 9 Administrator Reference Manual - Introduction](https://bind9.readthedocs.io/en/latest/chapter1.html)
-   [dig(1) manual page](https://bind9.readthedocs.io/en/latest/manpages.html#dig-dns-lookup-utility)
-   [Cloudflare Learning Center - What is DNSSEC?](https://www.cloudflare.com/learning/dns/dnssec/how-dnssec-works/)

## Your Lab Environment

Your browser terminal opens on the workstation, which sits on the same
network as the resolver you're investigating, `dns-resolver`. A second host,
`dns-auth`, is the controlled authoritative server for this lab's domain,
`lab.internal`; it lives on a separate network segment that your workstation
has no direct path to, which makes it a useful vantage point for testing
what the resolver looks like from outside its intended client base - but you
can only reach it by hopping through the resolver host first, since that is
the only host with a foot on both networks. Both hosts run BIND and expose
an SSH-accessible administrative account in addition to the DNS service
itself.

Paths and access you will need:

-   `/lab/dns-resolver/named.conf` - the resolver's live configuration,
    mounted so you can edit it directly from the workstation.
-   `dnsresolveradmin@dns-resolver` - administers the resolver host,
    including restarting the service after a config change. Its password is
    your workstation/lab password.
-   `dnsauthadmin@dns-auth` - a plain account on the authoritative host,
    useful as a second vantage point when you need to query the resolver
    from outside your own network segment. Reach it by first connecting to
    `dnsresolveradmin@dns-resolver`, then connecting onward from there - the
    workstation cannot reach it directly. Its password is also your
    workstation/lab password.
-   The authoritative host publishes some DNS-related material to a path
    inside the resolver's own filesystem that is not directly visible from
    your workstation; you will need to reach the resolver host directly to
    inspect it.

## Investigation

Before changing anything, understand what the resolver actually does and
for whom.

**Guiding questions:**

-   If a query from your own workstation succeeds, what does that prove -
    and what does it _not_ prove - about who else can use this resolver?
-   What would it look like, in `dig`'s output, if the resolver were
    checking the authenticity of an answer versus just repeating whatever
    it was told?
-   For a query type that can return everything known about a name at once,
    how would you tell whether the resolver is being economical with its
    answer or generous to a fault?

Start by seeing what a normal, expected query looks like:

```bash
dig www.lab.internal @<resolver-host>
```

Then consider what a query from a different vantage point - one that is not
on your workstation's own network - would tell you that a same-network query
cannot. The authoritative host described in Your Lab Environment is reachable
by SSH and gives you exactly that second vantage point.

To test whether the resolver validates what it hands back, look at a name
under the same domain that the environment description does not otherwise
call out:

```bash
dig <a-name-under-lab.internal> @<resolver-host>
```

To test how the resolver behaves for a broad, wildcard-style query against a
name with several kinds of records, request everything at once:

```bash
dig ANY <a-name-under-lab.internal> @<resolver-host>
```

**Proving impact:** For each of the three questions above, establish a
concrete piece of `dig` evidence - not just "it responded", but the specific
status code, flag, or record count that supports your conclusion. A finding
that only shows the resolver answered at all is not enough; show what the
answer reveals about who it will serve and how much it will trust.

## Remediate

Now put it right.

**Goal:** Only clients on the network the resolver is meant to serve can get
a recursive answer from it at all. Every answer the resolver hands back for
a domain it can verify has actually been checked, not just repeated - so a
record lacking authenticity is refused rather than passed along. A single
broad query against a multi-record name no longer returns everything known
about that name. All of this survives a service restart, and the trusted
client network can still resolve names normally throughout.

**Constraints:** The resolver must remain reachable and answer normal
lookups for your workstation's own network at every stage of the fix - a
configuration change that blocks your own client along with everyone else
is not a fix.

**Where to work:** Edit the resolver's live configuration at
`/lab/dns-resolver/named.conf` from the workstation. Applying the change
requires restarting the service as the resolver's administrative account
described in Your Lab Environment.

**References:**

-   Official documentation:
    [BIND 9 Configuration Reference](https://bind9.readthedocs.io/en/latest/reference.html)
-   Official documentation:
    [BIND 9 DNSSEC Guide](https://bind9.readthedocs.io/en/latest/dnssec-guide.html)
-   Local: `man named.conf`, `dig --help`

**If you're stuck:**

-   Think about a recursive resolver as a service with its own access
    control, separate from whatever access control the records it serves
    might have. "Who may ask" and "what will it tell them" are two different
    questions, and this environment has issues with both.
-   BIND's configuration file has a small number of top-level settings that
    govern exactly these three things: which clients may recurse, whether
    answers are cryptographically checked, and how much detail a broad query
    gets back. Look for the options block that groups server-wide behavior,
    not the block that defines the zone.
-   The BIND 9 Configuration Reference linked above documents the resolver's
    access-control settings, its DNSSEC validation settings, and its
    response-size settings in the same chapter - search that page for the
    section covering server options rather than zone statements.

## Verify

After applying your fix, confirm:

1. A query issued from outside the trusted client network is refused.
2. A record that lacks proof of authenticity is rejected, while a
   legitimately signed record is still accepted and shows evidence that
   validation actually ran.
3. A broad, multi-record query no longer returns everything at once.
4. Your workstation's own network can still resolve names normally.

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

## Real-World Context

Deng's IEEE S&P 2025 internet-scale measurement found 334,358 DNS services
sitting behind misconfigured firewalls, and 212,886 of them - 63.67% -
permitted `ANY`-style queries that make reflection amplification possible.
ENISA's Threat Landscape 2024 report separately places DNS-based attacks as
the most frequently observed category of distributed denial-of-service
activity across the quarters it tracked, with DNS amplification named
alongside NTP amplification as one of the top network-layer DDoS vectors.
Neither figure is about resolvers that were deliberately built to be
dangerous - both describe ordinary infrastructure that was never scoped down
from its defaults.

The two-part failure this lab modeled - an open recursive service, and a
resolver that trusts whatever it is told - is exactly the combination that
made cache-poisoning research like the 2008 Kaminsky attack and later
SAD DNS work practically significant: DNSSEC validation does not stop every
possible attack path into a resolver, but it removes the silent trust
assumption that makes a successful forgery invisible to the client. In
production, the operational check that catches this class of misconfiguration
before it reaches students, customers, or auditors is a periodic external
scan of resolver ACLs and validation status - treating "does our resolver
answer queries from outside our network" as a routine, scheduled question
rather than something discovered only after abuse is reported.

**Sources:**

-   Deng et al. (IEEE S&P 2025): Internet-scale measurement of DNS services
    behind misconfigured firewalls.
-   ENISA Threat Landscape 2024: DNS-based distributed denial-of-service
    trends and amplification vector ranking.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific
scenario._
