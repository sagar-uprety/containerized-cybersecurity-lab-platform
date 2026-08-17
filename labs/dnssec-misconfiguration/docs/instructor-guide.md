# Open Recursive Resolver and Missing DNSSEC Validation - Instructor Guide

## Lab Overview

The environment contains a recursive DNS resolver (`dns-resolver`) configured
as an open resolver (`allow-recursion { any; }`) with DNSSEC validation
disabled and no response-size control, plus a controlled authoritative host
(`dns-auth`) serving a small signed zone, `lab.internal`, that includes one
record with a deliberately missing signature. Students are expected to
discover, from the workstation and from an SSH session on the authoritative
host (an untrusted vantage point relative to the resolver's intended client
base), that the resolver answers recursive queries from outside its client
network, hands back an unsigned record without complaint, and returns an
oversized answer for a wildcard-style (`ANY`) query. A complete remediation
restricts `allow-recursion` to the client network's own address range,
enables `dnssec-validation` with the authoritative host's published trust
anchor, and sets `max-udp-size 512` - while a trusted client's ordinary
lookups keep working throughout.

## Learning Objectives

| #   | Objective                                                                                                                            | Assessment Criteria                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trace how a recursive resolver answers a client query and where a forwarded or cached answer actually originates.                    | Student can explain, in their own words, why querying the resolver from two different network vantage points gives different evidence about "is this open" than querying it from one place.                   |
| 2   | Demonstrate that a resolver without answer validation cannot distinguish a legitimate record from one lacking proof of authenticity. | Student produces the `poisoned.lab.internal` answer and can state what is missing from it that a validating resolver would check for.                                                                         |
| 3   | Configure DNSSEC validation against a zone's published trust anchor and verify the result with the `ad` flag.                        | Student's fixed resolver returns `ad` for `www.lab.internal` and `SERVFAIL` for `poisoned.lab.internal`, and can explain the difference between the two outcomes.                                             |
| 4   | Scope recursive service to a specific trusted network without breaking legitimate clients.                                           | Student's `allow-recursion` value is derived from the workstation's own address, not copied from documentation, and trusted lookups still succeed after the change.                                           |
| 5   | Recognize and reduce a DNS amplification factor without deleting legitimate zone data.                                               | Student can state the `ANSWER:` count and response size before and after capping `max-udp-size`, using `+notcp +ignore` to see the raw UDP behavior, and explain why the underlying records were not removed. |

## Safety and Scope Boundaries

-   **Contained blast radius:** `dns-resolver` only ever forwards to
    `dns-auth`, its own Podman network is marked `internal: true`, and no
    root hints are configured, so there is no path by which a query - even
    an `ANY` query against an open resolver - reaches a real DNS server or a
    third party outside this lab's two containers. Nothing in this lab can
    be used to amplify traffic against a real target.
-   **Synthetic data only:** the `lab.internal` zone contains only invented
    hostnames and RFC 5737/private-style addresses; no real domain,
    organization, or credential appears anywhere in the zone or the
    resolver's configuration.
-   **Intentional risks:** `allow-recursion { any; }` and
    `dnssec-validation no;` in `config.vulnerable` are the isolated teaching
    vulnerabilities; they exist only
    inside this lab's isolated network and are never reachable from outside
    the two lab containers.
-   **Student boundaries:** students must not attempt to reach hosts outside
    the lab's own containers, must not introduce real domain names or
    credentials into the zone or configuration, and have no path to
    operator-level `labctl` commands - the portal's Start/Reset/Check/End
    controls are the only lifecycle actions available to them.
-   **Instructor recovery:** **Reset** destroys and recreates every
    container, network, and volume for the instance, which regenerates a
    fresh DNSSEC key pair on `dns-auth` and restores `dns-resolver`'s
    `named.conf` to the vulnerable baseline - it is the correct recovery for
    a student who has broken the resolver's config beyond repair (for
    example, a syntax error that prevents `named` from starting after
    `restart-bind9`). A student who only needs their edits reverted without
    losing lab progress narrative can instead be walked back through Step 1
    of Remediate manually; there is no partial-config recovery command.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orient      | Student can state that a recursive resolver's trustworthiness has two separate dimensions - who may use it, and whether its answers can be verified - and that this lab investigates both.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Investigate | Student produces a recursive answer from the workstation (expected) _and_ from the authoritative host's own vantage point (the actual finding), a `NOERROR` answer for the unsigned `poisoned` record, and an oversized `ANY` response - three separate pieces of evidence, not just "the port is open".                                                                                                                                                                                                                                                                                                   |
| Remediate   | Student can explain why the client CIDR should come from inspecting the workstation's own address rather than being assumed, why a trust anchor is needed at all for a domain with no real parent delegation, and why capping `max-udp-size` reduces exposure without deleting zone data, and why it works here when `minimal-any` would not (this resolver only relays `lab.internal` through a `forward only` zone, so BIND's own per-response minimization logic never runs on it - `max-udp-size` is a wire-level cap on the resolver's own socket, applied regardless of where the answer came from). |
| Verify      | Checker reports `fixed`; student can independently reproduce `REFUSED` from the authoritative host's vantage point, `SERVFAIL` for the poisoned name, `ad` for the legitimate name, and a reduced `ANY` answer count, without relying on the checker's own wording.                                                                                                                                                                                                                                                                                                                                        |

## Reveal Policy and Intervention

| Trigger                                                                                                | Instructor Response                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student asks for help before investigating                                                             | Redirect to the investigation questions; do not confirm or deny findings.                                                                                                                                                   |
| Student has proven the resolver answers from the workstation but has not queried it from anywhere else | Ask what a query from the workstation alone can and cannot prove about who else can use the resolver.                                                                                                                       |
| Student has fixed `allow-recursion` and believes they are done                                         | Ask them to reproduce the `poisoned.lab.internal` result again and explain, without looking at the checker, whether it should still succeed.                                                                                |
| Student cannot find where the resolver's trust anchor comes from                                       | Point them at the "Your Lab Environment" paths for both hosts; do not name the file or its exact content.                                                                                                                   |
| Student stuck after all three written hints                                                            | Tell them, specifically, that BIND has separate named settings for "who may recurse", "whether to validate", and "how much to answer for a wildcard query" - three settings, three fixes - without naming any of the three. |

**Do not reveal:** the exact `named.conf` directive names (`allow-recursion`,
`dnssec-validation`, `max-udp-size`, `trust-anchors`), the shared trust-anchor
file's path, or the `restart-bind9` command, no matter how long a student
struggles. If a student genuinely cannot get there after the full hint
ladder, record it as guide-design evidence rather than handing over the
directive names directly.

## Common Mistakes

-   **Testing openness only from the workstation**: students often conclude
    "not open" because their own trusted-network query behaves normally,
    without realizing the workstation _is_ the trusted network the resolver
    is supposed to serve. How to address: ask what a second vantage point
    outside that network would show, without naming which host to use for
    it.
-   **Hardcoding a guessed subnet for `allow-recursion`**: students who skip
    inspecting the workstation's actual network configuration sometimes type
    in a subnet that looks plausible but does not match the container's real
    network, which fails the checker
    and silently blocks the trusted client too. How to address: ask them to
    show the exact command they used to determine the network, not the
    value itself.
-   **Believing the poisoned record is simply "blocked" rather than
    understanding why**: students who fix `allow-recursion` first sometimes
    see `poisoned.lab.internal` still resolve and assume the checker is
    wrong, without realizing DNSSEC validation is a separate, unaddressed
    setting. How to address: ask what specifically about that one record
    differs from `www.lab.internal`.
-   **Deleting or shrinking zone records to "fix" amplification**: a student
    who does not find `max-udp-size` may try to reduce the `ANY` response by
    editing the authoritative zone data. That host is not writable from the
    student's environment by design; if raised, explain that the fix
    belongs on the resolver, not the zone.

## Checker States

| State        | Condition                                                                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | All three objective checks read baseline values: recursion answered from outside the client network, the unsigned record accepted, and the oversized `ANY` answer returned.                                                                                                                    |
| `fixed`      | All three objective checks read remediated values: recursion refused from outside the client network, the unsigned record rejected with `SERVFAIL`, and a reduced `ANY` answer - with both guardrails (trusted-client resolution, resolver process health) still healthy.                      |
| `partial`    | Any one or two of the three objectives fixed while the others remain vulnerable - most commonly `allow-recursion` fixed but `dnssec-validation` or `max-udp-size` still baseline, since students tend to complete the three steps in sequence and may stop or get interrupted partway through. |

## Interpreting Feedback

-   A large prior/post confidence gap specifically on "how DNS resolution
    works" indicates the Investigation phase's two-vantage-point structure
    is landing - this lab's core insight (trust boundary and answer
    integrity are separate properties) is easy to state abstractly but hard
    to internalize without seeing it fail from an external vantage point
    first.
-   A low clarity score paired with free-text mentioning "which host do I
    SSH into" or "which account" points at the Your Lab Environment section
    under-specifying the authoritative host's access path - check whether
    the account name and its use as an investigation vantage point (not just
    "the authoritative server") come through clearly.
-   Free text mentioning "I didn't know DNSSEC needed a separate key thing"
    or confusion about why a private-zone trust anchor is needed at all
    (as opposed to `dnssec-validation auto` working automatically) signals
    the guide should make clearer, before Remediate, that a domain with no
    real parent delegation cannot use the automatic root trust chain -
    without stating the fix's mechanism.
-   Free text describing the amplification step as "the easy one" or
    skipped entirely suggests students are treating it as optional busywork
    after the recursion/DNSSEC fixes feel like "the real vulnerability" -
    worth an explicit debrief point that all three checks are independently
    graded and independently real.

## Teaching Notes

-   Emphasize in debrief that "is my resolver open" is not answerable by
    querying it from the network it is meant to serve - the entire
    investigation design forces students to physically query from a second
    vantage point, which is the same reason real open-resolver scans are run
    from outside the target's own network.
-   Research grounding: Deng (IEEE S&P 2025) measured 334,358 DNS services
    behind misconfigured firewalls, with 212,886 (63.67%) permitting `ANY`
    queries exploitable for reflection amplification; ENISA's Threat
    Landscape 2024 separately ranks DNS-based attacks as the most common
    DDoS category observed in late 2023 quarters. Both figures belong in the
    student guide's Real-World Context, not in Remediate.
-   This lab sits in the FEDS "human risk and effectiveness" evaluation
    episode: the two-vantage-point investigation design is itself a guide
    hypothesis under test (does forcing an external query correct the "my
    client can reach it, so it must be fine" misconception faster than
    describing the concept), not just a delivery mechanism for the fix.
-   The trust-boundary / integrity / amplification-surface distinction this
    lab teaches for DNS recurs almost identically in NTP, SNMP, CLDAP, and
    mDNS reflection classes - all share the same three-part shape (who may
    ask, can the answer be trusted, how large is the answer) even though the
    specific protocol directives differ.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full
remediation walkthrough, refer to `solution-notes.md` directly. The
instructor guide focuses on assessment, safety, intervention, and feedback
interpretation.
