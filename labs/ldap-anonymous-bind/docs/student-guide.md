# LDAP Directory Exposure with Anonymous Bind

You've been brought in as a security auditor. A directory service is running
on the internal network, but nobody has assessed its security posture. Your
job is to determine whether organizational data is exposed to unauthenticated
users, demonstrate the risk, and harden the service.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Prerequisites

Before starting this lab, you should be familiar with:

-   What a directory service (LDAP) is and how organizations use it to store user and group information
-   Basic Linux command-line tools for querying network services
-   The difference between anonymous access and authenticated access, and why identity verification matters for data protection

If you need to review these topics, see:

-   OpenLDAP Administrator's Guide - Getting Started: <https://www.openldap.org/doc/admin26/guide.html>
-   LDAP basics and directory structure: <https://www.openldap.org/doc/admin26/intro.html>
-   Access control concepts: <https://csrc.nist.gov/glossary/term/access_control>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation and the target directory service
on an isolated lab network. Use the portal to **Start Lab**, **Run Check**,
**Reset**, or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem
is real.

**Guiding questions:**

-   What services are running and reachable on the lab network?
-   Does the directory service require authentication before responding to queries?
-   What kind of organizational data can you extract without providing credentials?
-   What does the directory structure reveal about the organization?
-   Does an accepted anonymous bind mean the same thing as permission to read or search directory entries?

LDAP client tools and network scanners are available on the workstation.

Run investigation commands from the student workstation. The lab-local access
file supplies credentials needed later without exposing operator tooling:

```bash
# Context: student workstation
cat /lab/access/credentials.txt
ldapwhoami -x -H ldap://ldap-host
LDAP_BASE=dc=lab,dc=local
ldapsearch -x -H ldap://ldap-host -b "$LDAP_BASE" "(objectClass=posixAccount)" cn mail telephoneNumber uid uidNumber gidNumber homeDirectory userPassword
ldapsearch -x -H ldap://ldap-host -b "ou=groups,$LDAP_BASE" "(objectClass=posixGroup)" cn gidNumber memberUid
```

An anonymous bind can remain available for authentication workflows while ACLs
deny anonymous read/search access. Treat returned entries and attributes, not
bind acceptance alone, as evidence of exposure.

**Proving impact:** Once you've identified the issue, demonstrate that it has
real consequences. Show what an attacker could learn about the organization
from the exposed directory. Use only what the lab environment provides - do
not introduce real credentials or external resources.

## Remediate

Now fix the issue.

**Goal:** Restrict directory access so that only authenticated users can read
entries, and encrypt connections with TLS.

**Constraints:** Authenticated queries must still work after your changes.
Changes must survive a service restart.

**Where to work:** The directory's runtime configuration backend isn't
reachable from your workstation over the network - you'll need to connect
to the directory server itself as its administrative account (`root`).
Read `/lab/access/credentials.txt` from the workstation for SSH and directory
bind credentials, then use SSH from that workstation. Do not use platform
operator commands.
Note that the portal's **Reset** action restores the vulnerable baseline,
so it isn't the right tool for reloading a fix.

**References:**

-   Official documentation: <https://www.openldap.org/doc/admin26/access-control.html>
-   TLS configuration: <https://www.openldap.org/doc/admin26/tls.html>
-   Local: `man ldapsearch`, `man slapd-config`, `man ldapmodify`

**Need a hint?**

-   What principle requires verifying identity before granting access to data?
-   Look for the access control configuration in the directory's runtime config backend. Changes are applied using the LDAP protocol itself - not by editing traditional text files.
-   The OpenLDAP Administrator's Guide has a section on ACLs and the `olcAccess` attribute.
-   Pre-generated TLS certificates are already available on the directory server. Look for how to configure the directory to use them for encrypted connections.

## Verify

After applying your fix, confirm:

1. Anonymous read/search is denied, even though anonymous bind may still be accepted
2. Authenticated plaintext LDAP is rejected
3. The same authenticated query succeeds with required StartTLS

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific scenario._
