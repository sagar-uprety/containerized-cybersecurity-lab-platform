# The Open File Share

You've been brought in as the junior IT administrator for a small
file server that several teams use for backups and shared documents. A
routine internal network scan flagged the server as reachable on the lab
network, and nobody is sure whether the data it holds is properly
protected. Your job is to find out what is actually accessible, show why
that matters, lock the server down, and confirm legitimate users can
still get to their files.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the provided demo data
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Prerequisites

Before starting this lab, you should be familiar with:

-   What a file-sharing service is and why organizations run shared storage for teams
-   The difference between reaching a service on the network and being authorized to use it
-   Basic Linux command-line tools for inspecting network services and reading configuration files

If you need to review these topics, see:

-   Samba documentation overview: <https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html>
-   Network share and access control basics: <https://www.samba.org/samba/docs/>
-   Access control concepts: <https://csrc.nist.gov/glossary/term/access_control>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation and the target file server on
an isolated lab network. Use the portal to **Start Lab**, **Run Check**,
**Reset**, or **End Lab** as needed.

If you need to administer the file server directly (for example, to
restart its service or set up a user), an admin account is available over
SSH. The credentials you need are published inside the lab at
`/lab/access/credentials.txt`; the SSH password is your own
workstation/lab login password.

## Investigation

Before fixing anything, understand the environment and confirm the
problem is real — and worse than it might first appear.

**Guiding questions:**

-   What services are running and reachable on the lab network?
-   What shares does the file server expose, and does it ask for
    credentials before listing or reading them?
-   Can someone with no account at all browse the share and download its
    contents? How sensitive is the data that is exposed?
-   Is the connection encrypted, or could someone on the path observe the
    transferred files?

SMB client utilities are available on the workstation. For network
scanning, nmap is installed and its scripting engine includes
SMB-specific scripts for share enumeration and OS detection. The
server's configuration is also exposed as a shared file at
`/lab/smb/smb.conf` so you can inspect how it is set up. Use standard
Linux tools to explore.

**Proving impact:** Once you've identified the issue, demonstrate that
this is more than an "open port" — it is sensitive data available to
anyone on the network. Show that an unauthenticated user can enumerate
and download the share's contents. Use only the seeded demo data and do
not introduce real credentials or external resources.

## Remediate

Now fix the issue with layered controls — one layer alone is not enough.

**Goal:** Ensure the file server requires valid credentials, restricts
the share to an authorized group, and encrypts connections so that only
legitimate users can read the data.

**Constraints:** Authorized users must still be able to read the share
after your changes. Changes must survive a service restart.

**Where to work:** The server's configuration file is editable from your
workstation at `/lab/smb/smb.conf`. Creating Samba users and restarting
the service must happen on the file server itself (see Getting Started
for SSH access details). The portal's **Reset** action restores the
vulnerable baseline, so it is not the right tool for reloading a fix.

**References:**

-   Official documentation: <https://www.samba.org/samba/docs/current/man-html/smb.conf.5.html>
-   Samba security and encryption: <https://wiki.samba.org/index.php/SMB3_Encryption>
-   Local: `man smb.conf`, `man smbpasswd`, `smbclient --help`

**Need a hint?**

-   Think about what principle requires verifying identity before granting access to data, and why a share that maps missing identities to a guest account defeats that principle.
-   Look for the configuration directives that control guest mapping, per-share guest access, the list of users allowed to connect, and whether encryption is required.
-   Check the `smb.conf` man page for the guest, access-control, and encryption directives, and the `smbpasswd` man page for how Samba user accounts are created separately from Unix accounts. A pre-created Unix account and an authorized group already exist on the server.

## Verify

After applying your fix, confirm:

1. An anonymous user can no longer list or read the share
2. An authorized user can still read the share over an encrypted connection
3. The hardened settings are active after the service restart

Use the same tools from your investigation to re-check each layer. When
satisfied, click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the
feedback form. Take a moment to reflect on what you learned — what
surprised you, what you'd do differently, and how this applies beyond
this specific scenario._
