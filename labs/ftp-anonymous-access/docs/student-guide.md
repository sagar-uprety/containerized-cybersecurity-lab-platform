# FTP File Transfer Access Control

## Situation

**Role:** IT support technician

A file transfer server used for distributing deployment packages between teams
was flagged during a routine network review. Nobody has verified how the
service authenticates clients or how data moves between them. Assess how the
file transfer service is configured and secure it.

## Why This Matters

File-transfer services move exactly the kind of data an attacker wants:
deployment artifacts, service credentials, internal notes. FTP is decades old,
but it has never gone away - an Internet-wide study of hosts sitting behind
misconfigured firewalls found 32,172 FTP services still reachable this way, some
explicitly accepting logins with no credentials at all (Deng et al., IEEE S&P
2025). A separate, well-established teaching pattern shows that even when a
service does ask for a username and password, that exchange is worthless as a
protection if the protocol itself never encrypts it (Irvine et al., ASE 2017).

The assumption worth unlearning here is that "the server asked for a password"
means the connection is secure. Asking for a credential and protecting that
credential are two different guarantees, and an old protocol can quietly fail to
provide the second one even when it provides the first.

## Objectives

By the end of this lab you should be able to:

-   Determine whether a file-transfer service can be reached without proving
    identity, and demonstrate what that level of access actually permits
-   Capture and interpret a live authentication exchange to establish whether a
    protocol protects credentials in transit
-   Remove a credential-free access path from a file-transfer service
-   Require encrypted authentication and file transfer for the accounts that
    remain
-   Confirm that legitimate access still works and that credentials are no
    longer observable on the network

## Prerequisites

Before starting this lab, you should be familiar with:

-   How FTP separates a control connection (commands, login) from a data
    connection (the actual file transfer)
-   What it means for a protocol to be encrypted in transit, and why a login
    prompt does not by itself guarantee that
-   Reading a packet capture well enough to recognize plaintext protocol
    commands inside it

If you need to review these topics, see:

-   RFC 959, File Transfer Protocol: <https://www.rfc-editor.org/rfc/rfc959>
-   RFC 4217, Securing FTP with TLS: <https://www.rfc-editor.org/rfc/rfc4217>
-   Wireshark's introduction to packet capture: <https://www.wireshark.org/docs/wsug_html_chunked/ChapterIntroduction.html>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **target file-transfer
server** sits on the same isolated lab network.

Paths and access you will need:

-   `/lab/ftp/vsftpd.conf` - the file-transfer service's configuration, exposed
    as a shared file so you can inspect and edit how the server is set up from
    the workstation
-   `/lab/access/credentials.txt` - a lab-local access file with the account
    names and passwords you need, including your own SSH login for the server
-   **File-transfer server admin account** - to administer the server directly
    (restart the service), log in over SSH as the `ftpadmin` account. The SSH
    password is your own workstation/lab login password from the portal's
    Workstation Access page.

## Your Mission

1. Determine whether the file-transfer service can be reached without
   credentials, and establish what that access actually permits.
2. Demonstrate that a real account's credentials are observable to anything
   positioned to watch the network path during login.
3. Remove the credential-free access path from the service.
4. Require encrypted authentication and file transfer for the account that
   remains, without losing the ability to log in.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   Can you reach the file-transfer service without supplying any identity at
    all, and if so, what does that access let you do beyond just looking?
-   If you connect with a real username and password instead, is any part of
    that exchange visible to something else observing the same network path?
-   What would distinguish "the port is open" from actual proof that data or
    credentials are exposed?

File-transfer and network-scanning clients are installed on the workstation, and
a packet-capture tool is available for observing traffic directly. Command
shapes to start from:

```bash
nmap -sV -p- <target-host>
curl ftp://<target-host>/
```

```bash
tcpdump -i <interface> -w <capture-file> port <ftp-port>
```

**Proving impact:** Establish that this is more than an open port. Show what an
unauthenticated session can read and write, and separately show that a real
account's credentials can be recovered from a capture of its own login. Use only
the seeded demo data and the pre-created accounts; do not introduce real
credentials or external resources.

## Remediate

Now fix the issue with layered controls - closing one gap while leaving the
other open still leaves credentials exposed.

**Goal:** When you are done: a connection with no credentials at all is
rejected; the account you captured earlier can still log in and transfer files,
but only over an encrypted session, and a plaintext attempt with the same
credentials is rejected; and all of this survives a service restart.

**Constraints:** The account that worked before must still be able to log in
and transfer files afterward - you are closing an access path and closing a
confidentiality gap, not disabling the service. Changes must survive a service
restart.

**Where to work:** The configuration file is editable from your workstation at
`/lab/ftp/vsftpd.conf`. Restarting the service must happen on the file-transfer
server itself over SSH - see Your Lab Environment. A certificate the server
needs for encrypted sessions has already been generated for this instance; you
do not need to create one. The portal's **Reset** action restores the vulnerable
baseline, so it is not the right tool for reloading a fix.

**References:**

-   Official documentation: <https://security.appspot.com/vsftpd/vsftpd_conf.html>
-   RFC 4217, Securing FTP with TLS: <https://www.rfc-editor.org/rfc/rfc4217>
-   Local: `man vsftpd.conf`, `curl --manual` (search for `ftp-ssl`)

**If you're stuck:**

-   A service that accepts a connection with no identity at all has no
    authentication to bypass in the first place - that path has to be closed
    before anything else you do matters.
-   Two separate settings govern encryption for a session: whether the service
    is willing to negotiate TLS at all, and whether it insists on TLS before
    accepting a login and before moving data. Look for both, not just one.
-   The vsftpd configuration reference documents its SSL/TLS directives in one
    section; a certificate and private key path are required inputs to that
    section, and this instance already has one generated for it.

## Verify

After applying your fix, confirm each of the following:

1. A connection with no credentials is rejected
2. The same account you captured earlier still logs in and transfers files,
   but only over an encrypted session - the identical plaintext attempt is now
   rejected
3. The hardened settings are active after the service restarts

Use the same tools from your investigation to re-check each layer. When
satisfied, click **Run Check** in the portal.

## Real-World Context

The exposure you just closed persists specifically because FTP refuses to go
away: Deng et al.'s Internet-wide scan behind misconfigured firewalls turned up
32,172 FTP services still running, 1,833 of them on outdated software, and a
subset explicitly accepting logins with no credentials. Every one of those is a
service where the same anonymous-read-and-write access you just demonstrated is
sitting on the open network, not a lab network.

The credential-capture step models a much older, well-documented lesson: the
Labtainers teaching platform uses the same technique - recovering a plaintext
password from a packet capture - to teach that a login prompt is not the same
thing as a protected login (Irvine et al., ASE 2017). That lesson was built
around Telnet, a protocol most organizations have retired; this lab shows the
identical failure is alive today in a protocol that has not been retired.

What would catch this earlier in production: treating "accepts anonymous login"
and "does not encrypt sessions" as two separate findings in any service
inventory, not one; disabling anonymous access as a default policy rather than a
per-server decision; and preferring SFTP (which reuses SSH's already-hardened
transport) over FTP/FTPS for any new deployment.

**Sources:**

-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond
    the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls.
    IEEE S&P 2025. <https://doi.org/10.1109/SP61157.2025.00164>
-   Irvine, C. E., Thompson, M. F., McCarrin, M., & Khosalim, J. (2017).
    Labtainers: A Docker-based Framework for Cybersecurity Labs. USENIX
    Workshop on Advances in Security Education (ASE) 2017.
    <https://www.usenix.org/system/files/conference/ase17/ase17_paper_irvine.pdf>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
