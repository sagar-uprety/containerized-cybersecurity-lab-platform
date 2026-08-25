# SMB File Share Access Control

## Situation

**Role:** Junior IT administrator

A file server used by several teams for backups and shared documents was
flagged during a routine internal network scan. Nobody is sure whether the data
it holds is properly protected. Find out what is actually accessible, then
harden the service.

## Why This Matters

File shares are where an organization's working data actually lives - backups,
configuration templates, the spreadsheet someone should not have saved there.
When a share is reachable without credentials, all of it is one connection away.
The first Internet-wide study of hosts behind misconfigured firewalls identified
19,419 exposed SMB services, 202 of them explicitly unprotected file shares
open to anyone who could reach them (Deng et al., IEEE S&P 2025). Operators in a
separate study described the failure mode from the inside: "if you are searching
for something on a file share and suddenly stumble onto something that should not
be there" (Dietrich et al., ACM CCS 2018).

The operative assumption to unlearn is that a share nobody advertises is a share
nobody finds. If it is accessible, assume someone will find it.

## Objectives

By the end of this lab you should be able to:

-   Enumerate the shares a file server exposes and determine whether it demands credentials before granting access
-   Demonstrate that an unauthenticated user can browse and download a share, and judge how sensitive the exposed data is
-   Require valid credentials and restrict a share to an authorized group, distinguishing a Samba account from the underlying Unix account
-   Enforce encrypted transport so that file contents are not observable on the network path
-   Confirm that authorized access still works after the share is locked down

## Prerequisites

Before starting this lab, you should be familiar with:

-   What a file-sharing service is and why organizations run shared storage for teams
-   The difference between reaching a service on the network and being authorized to use it
-   Basic Linux command-line tools for inspecting network services and reading configuration files

If you need to review these topics, see:

-   Samba smb.conf documentation: <https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html>
-   Samba documentation overview: <https://www.samba.org/samba/docs/>
-   Access control concepts: <https://csrc.nist.gov/glossary/term/access_control>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **target file server**
sits on the same isolated lab network.

Paths and access you will need:

-   `/lab/smb/smb.conf` - the file server's configuration, exposed as a shared file so you can inspect and edit how the server is set up from the workstation
-   `/lab/access/credentials.txt` - a lab-local access file with the details you need to administer the server
-   **File-server admin account** - to administer the server directly (restart the service, create a share user), log in over SSH as the `sambaadmin` account. The SSH password is your own workstation/lab login password from the portal's Workstation Access page.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real - and worse than it might first appear.

**Guiding questions:**

-   What services answer on the lab network, and which is the file server?
-   What shares does the server expose, and does it ask for credentials before listing or reading them?
-   Can someone with no account at all browse a share and download its contents? How sensitive is what comes out?
-   Is the connection encrypted, or could someone on the network path observe the files as they transfer?

SMB client utilities are installed on the workstation, and `nmap` ships with
scripting-engine scripts for SMB share enumeration and OS detection. The server's
configuration is also readable at `/lab/smb/smb.conf`. Command shapes to start
from:

```bash
nmap -sV --script smb-enum-shares -p <ports> <target-host>
smbclient -L //<target-host> -N
smbclient //<target-host>/<share> -N
```

**Proving impact:** Establish that this is more than an open port - that
sensitive data is available to anyone on the network. Show that an
unauthenticated user can both enumerate the shares and download their contents.
Use only the seeded demo data; do not introduce real credentials or external
resources.

## Remediate

Now fix the issue with layered controls - one layer alone is not enough.

**Goal:** When you are done: an anonymous user can no longer list or read the
share; access is limited to an authorized group whose members must present valid
credentials; connections to the share are encrypted; and an authorized user can
still read the data. Your changes must survive a service restart.

**Constraints:** Authorized users must still be able to read the share after your
changes. Changes must survive a service restart. A share that maps unknown
identities to a guest account defeats the point of requiring credentials - account
for that.

**Where to work:** The configuration file is editable from your workstation at
`/lab/smb/smb.conf`. Creating share users and restarting the service must happen
on the file server itself over SSH - see Your Lab Environment. A pre-created Unix
account and an authorized group already exist on the server. The portal's
**Reset** action restores the vulnerable baseline, so it is not the right tool
for reloading a fix.

**References:**

-   Official documentation: <https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html>
-   Samba encryption: <https://wiki.samba.org/index.php/SMB3_Encryption>
-   Local: `man smb.conf`, `man smbpasswd`, `smbclient --help`

**If you're stuck:**

-   Access control only works if the server insists on knowing who is connecting. A configuration that silently maps an unknown user onto a guest identity is answering "who are you?" with "it does not matter" - which is the opposite of what you want.
-   Several directives interact here: whether guests are mapped in at all, which users are permitted per share, and whether the transport is encrypted. Look at the guest-handling, access-control, and encryption directives together rather than one at a time.
-   The `smb.conf` man page documents the guest, access-control, and encryption directives, and the `smbpasswd` man page explains how a Samba account is created separately from a Unix account. Both matter - a Unix user without a Samba entry cannot connect, and vice versa.

## Verify

After applying your fix, confirm each of the following:

1. An anonymous user can no longer list or read the share
2. An authorized user can still read the share, over an encrypted connection
3. The hardened settings are active after the service restarts

Use the same tools from your investigation to re-check each layer. When
satisfied, click **Run Check** in the portal.

## Real-World Context

The exposure you just closed is common precisely because SMB is everywhere -
it is the default file-sharing protocol across enterprise Windows environments
and ubiquitous on Linux through Samba. Deng et al. found 19,419 SMB services
reachable through firewall misconfigurations alone, and noted that 63.44% of the
exposed Windows hosts were running end-of-life versions - exposure compounding
obsolescence. Their scan turned up file shares open on non-standard devices such
as routers, showing how far the protocol has spread beyond the file servers
people remember to secure.

What makes open shares so persistent is the failure mode Dietrich's operator
interviews captured: nobody decides to expose a share; it happens because a
default maps unknown users to a guest account, the share "works" for the people
who need it, and the accidental access goes unnoticed until someone stumbles onto
data that should not be reachable. Requiring authentication, scoping the share to
a named group, and encrypting the transport turns "works for everyone" back into
"works for the right people".

What would catch it earlier in production: internal scans that flag any share
listable or readable without credentials; disabling guest mapping as a baseline
policy rather than per share; and reviewing which groups can reach each share
whenever the data on it changes sensitivity.

**Sources:**

-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE S&P 2025. <https://doi.org/10.1109/SP61157.2025.00164>
-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
