# LDAP Directory Access Control

You've been brought in as a security auditor. A directory service is running on
the internal network, but nobody has ever formally assessed its security
posture. Your job is to determine whether organizational data is exposed to
users who have not proven who they are, demonstrate the risk, and harden the
service.

## Why This Matters

A directory service is the organizational memory of a company - who works there,
what they can access, how the teams are structured. The first Internet-scale
study of LDAP scanned the entire routable address space and found that of 82,129
responding servers, 14.83% returned personal data to completely unauthenticated
queries, and 2.21% leaked password material - 3.9 million credentials in total
(Kaspereit et al., USENIX Security 2024). LDAP underpins Active Directory and
most centralized authentication, so a single access-control mistake does not
expose one record; it exposes the map of the entire organization.

The dangerous misconception this lab corrects is "nobody knows our directory is
there, so it is safe". Internet scanners know it is there.

## Objectives

By the end of this lab you should be able to:

-   Read a directory's structure (its entries, attributes, and organizational layout) well enough to judge what an outsider could learn from it
-   Demonstrate that unauthenticated queries return organizational data, and quantify what is exposed
-   Explain why a directory accepting an anonymous bind is not the same as a directory permitting anonymous reads
-   Restrict directory reads to authenticated identities while preserving the anonymous bind that legitimate authentication workflows rely on
-   Enforce encrypted transport so that credentials and query results are not exposed on the wire

## Prerequisites

Before starting this lab, you should be familiar with:

-   What a directory service (LDAP) is and how organizations use it to store user and group information
-   Basic Linux command-line tools for querying network services
-   The difference between anonymous access and authenticated access, and why identity verification matters for data protection

If you need to review these topics, see:

-   OpenLDAP Administrator's Guide - Getting Started: <https://www.openldap.org/doc/admin26/guide.html>
-   LDAP basics and directory structure: <https://www.openldap.org/doc/admin26/intro.html>
-   Access control concepts: <https://csrc.nist.gov/glossary/term/access_control>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **target directory
service** runs on a separate host on the same isolated lab network.

Paths and access you will need:

-   `/lab/access/credentials.txt` - a lab-local access file holding the SSH and directory-bind credentials you will need for the remediation phase. Reading it now is fine; hold off on using those credentials until you reach Remediate.
-   The directory's runtime configuration is not reachable from the workstation over the network. When you reach the remediation phase you will connect to the directory host itself as its administrative account (`root`) over SSH, using the credentials in that access file.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any
time. **Reset** restores the original vulnerable baseline, so it is not a way to
reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on
the portal's Workstation Access page.

## Your Mission

1. Identify the directory service on the network and determine its type.
2. Establish whether unauthenticated queries return organizational data, and enumerate what an outsider could learn - accounts, email addresses, group memberships.
3. Demonstrate the impact of that exposure.
4. Bring the directory to a state where only authenticated users can read it and connections are encrypted, without breaking legitimate authenticated queries.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What services answer on the lab network, and which one is the directory?
-   Does the directory require anything of a client before it responds to queries?
-   What organizational data can you extract without presenting credentials?
-   What does the directory's structure reveal about the organization as a whole?
-   Does the server accepting an anonymous bind necessarily mean it will let you read or search its entries?

LDAP client tools (including `ldapwhoami` and `ldapsearch`) and network scanners
are installed on the workstation. Command shapes to start from:

```bash
nmap -sV -p- <target-host>
ldapwhoami -x -H ldap://<target-host>
ldapsearch -x -H ldap://<target-host> -b "<base-dn>"
```

A subtle point worth pinning down during investigation: an anonymous bind can
remain available for authentication workflows even while access-control rules
deny anonymous reads. Treat _returned entries and attributes_ as your evidence
of exposure, not the mere fact that a bind was accepted.

**Proving impact:** Show what an attacker would actually learn about the
organization from the exposed directory - not that a port is open, but what
walks out the door when nobody is asked to authenticate. Use only the lab
environment; do not introduce real credentials or external resources.

## Remediate

Now fix the issue.

**Goal:** When you are done: an unauthenticated client can no longer read or
search the directory's entries, even though an anonymous bind may still be
accepted for authentication; plaintext connections are rejected; and the same
query that an authorized user runs succeeds only over an encrypted channel.
Authenticated access must still work, and your changes must survive a service
restart.

**Constraints:** Authenticated queries must still succeed after your changes.
Changes must survive a service restart.

**Where to work:** The directory's runtime configuration backend is not
reachable from your workstation over the network. Connect to the directory host
itself as its administrative account (`root`) over SSH - the SSH and bind
credentials are in `/lab/access/credentials.txt`. Do not use platform operator
commands. The portal's **Reset** action restores the vulnerable baseline, so it
is not the right tool for reloading a fix.

**References:**

-   Official documentation: <https://www.openldap.org/doc/admin26/access-control.html>
-   TLS configuration: <https://www.openldap.org/doc/admin26/tls.html>
-   Local: `man ldapsearch`, `man slapd-config`, `man ldapmodify`

**If you're stuck:**

-   The principle at stake is that reading organizational data should require a verified identity. Which of the things this server currently allows - binding, reading, searching - actually needs an identity, and which is handed out for free?
-   The access rules live in the directory's own runtime configuration backend, and are changed through the LDAP protocol itself rather than by editing a traditional text file. Transport encryption is a separate concern from access control - both need to be addressed.
-   The OpenLDAP Administrator's Guide has a section on access control and the relevant configuration attribute, and a separate section on TLS. Pre-generated certificates already exist on the directory host; the TLS section explains how to point the server at them.

## Verify

After applying your fix, confirm each of the following:

1. Anonymous read and search are denied, even though an anonymous bind may still be accepted
2. Authenticated queries over plaintext LDAP are rejected
3. The same authenticated query succeeds over an encrypted (StartTLS) connection

Use the same tools from your investigation to re-check. When satisfied, click
**Run Check** in the portal.

## Real-World Context

The exposure you just closed was measured at Internet scale for the first time
in 2024. Kaspereit et al. built a scanner called LanDscAPe and swept the entire
routable IPv4 space on the LDAP ports. Of 82,129 servers that answered, 12,179
(14.83%) returned personal data to anonymous queries, 9,731 leaked sensitive
internal information such as user-management structure and password policies, and
1,817 exposed password attributes outright. Only 11.4% of the personal-data-
exposing servers used a recommended TLS configuration - meaning most of the rest
leaked in cleartext, readable by anyone on the network path.

The reason this happens is baked into the protocol: RFC 4513 makes anonymous
bind a mandatory part of LDAP, so an administrator has to _explicitly_ restrict
anonymous reads. Many never do, because the server "works" - authentication
succeeds, applications connect - and the silent gap is that the same anonymity
that lets an app bind also lets an attacker enumerate. That is exactly the
distinction between bind acceptance and read permission that this lab is built
around.

What would catch it earlier in production: treating any directory that returns
entries to an unauthenticated query as a finding during internal scanning;
enforcing TLS at the configuration level rather than hoping clients opt in; and
reviewing access-control rules whenever the directory is exposed to a new
network.

**Sources:**

-   Kaspereit, J., Öndarö, G., Luvizotto Cesar, G., et al. (2024). LanDscAPe: Exploring LDAP Weaknesses and Data Leaks at Internet Scale. USENIX Security 2024. <https://www.usenix.org/conference/usenixsecurity24/presentation/kaspereit>
-   RFC 4513: Lightweight Directory Access Protocol (LDAP): Authentication Methods and Security Mechanisms. <https://datatracker.ietf.org/doc/html/rfc4513>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific scenario._
