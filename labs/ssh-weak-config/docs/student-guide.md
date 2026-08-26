# SSH Authentication Hardening

## Scenario

**Role:** Incident responder

A server was flagged after suspicious SSH login activity appeared in the
authentication logs, and there are signs someone may already have gained
access. Audit the SSH service, establish how an intruder could get in, and
harden the server.

## Why This Matters

SSH is the front door to almost every Linux server, and attackers know it. A
2025 Internet-scale study identified 21,700 already-compromised SSH hosts across
144 countries by fingerprinting the keys that intruders had installed for
persistence - in some cases after overwriting every legitimate key on the host
(Munteanu et al., USENIX Security 2025). The 2025 Verizon DBIR puts credential
abuse as the number-one way attackers first get in, and reports that guessed
credentials have overtaken exploitation in web-facing attacks.

Brute-force against SSH is not an event you wait for; it is constant background
noise on any reachable server. The question a good administrator answers is not
"will they try" but "what happens when they do".

## Objectives

By the end of this lab you should be able to:

-   Explain the difference between password and public-key authentication, and why one resists guessing and the other does not
-   Audit a running SSH daemon's effective configuration rather than trusting the file on disk
-   Demonstrate a controlled password-guessing attack against a weak account and explain what made it succeed
-   Detect prior compromise by auditing authorized keys and account state for entries that should not be there
-   Reduce the server's exposure so that guessing is no longer viable and repeated failures are actively blocked

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic SSH concepts (what an SSH server does, and the difference between password and key-based authentication)
-   Linux file permissions and basic configuration editing (using a text editor like `nano` or `vim`)
-   What brute-force and dictionary attacks are and why weak passwords are risky

If you need to review these topics, see:

-   OpenSSH official documentation: <https://www.openssh.com/manual.html>
-   SSH key-based authentication basics: <https://man.openbsd.org/ssh.1> (see the AUTHENTICATION section)
-   Password security and brute-force concepts: <https://csrc.nist.gov/glossary/term/brute-force_attack>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **target SSH server**
sits on the same isolated lab network. The server has several local user
accounts, and a legitimate key-based login already exists for routine access.

Paths and access you will need:

-   `/lab/keys` - contains the legitimate lab key for connecting to the target, along with related material for your assessment
-   `/lab/keys/weak-passwords.txt` - a short candidate password list authorized for the weak-password assessment. Determine which candidate succeeds rather than assuming it.
-   For the authorized password assessment, use the `lab-user` account on the target. The target hostname and the legitimate key are both in the lab environment; use standard SSH client help to work out how to connect.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What services answer on the lab network, and what does the SSH server report about itself?
-   Which authentication methods does the SSH server actually accept?
-   Are any of the local accounts protected only by a weak or guessable password?
-   Is there evidence in the account and key state that someone has already been here?

SSH clients, network scanners, brute-force tooling, and standard Linux utilities
are installed on the workstation. Command shapes to start from:

```bash
nmap -sV -p- <target-host>
ssh -i <key-path> <user>@<target-host>
hydra -l <user> -P <wordlist> ssh://<target-host>
```

**Proving impact:** Establish that unauthorized access is genuinely achievable -
identify which candidate password opens the `lab-user` account, and separately
account for any signs that a previous intruder established a foothold. Naming the
weakness is not the same as demonstrating it. Use only the lab environment - do
not introduce real credentials or external resources.

## Remediate

Now harden the server.

**Goal:** When you are done: password-based and root logins no longer offer a
way in; the only usable credential is the intended key; any foothold a previous
intruder left behind is gone and weak local accounts can no longer be used;
repeated failed attempts are consumed from the SSH authentication log and can
result in a block; and your own legitimate key-based access still works and
survives a service restart.

**Constraints:** Your legitimate key-based access must continue to work after
your changes. Changes must survive a service restart. Closing one login path
does not remediate a weak credential that another path could still use - account
for every account you found.

**References:**

-   Official documentation: <https://man.openbsd.org/sshd_config>
-   Local: `man sshd_config`, `sshd -T`, `man fail2ban`, `man jail.conf`

**If you're stuck:**

-   The underlying principle is that a system must verify identity before it grants access - and a credential that can be guessed does not verify anything. Which authentication methods on this server can be guessed, and which cannot?
-   Two areas need attention: the SSH daemon's own policy on how clients may authenticate, and a separate layer that watches the authentication log and reacts to repeated failure. Also remember that removing a login method is not the same as neutralising the accounts behind it.
-   Work from the authentication directives in `sshd_config(5)`, and from the jail, log-source, and action sections of `jail.conf(5)`. Both include enough to determine what to change and how to prove it took effect.

## Verify

After applying your fix, confirm each of the following independently:

1. Password and root logins are rejected, while your legitimate key still works
2. The unauthorized foothold and weak-account access paths are closed
3. Repeated failed attempts are consumed from the SSH authentication log and can result in a block
4. Everything above is still true after the SSH service restarts

Use the same tools from your investigation to re-check. When satisfied, click
**Run Check** in the portal.

## Real-World Context

The scenario you just worked through is the everyday reality of an
Internet-facing SSH server. Munteanu et al. fingerprinted 52 known malicious
keys across the routable Internet and found 21,700 compromised hosts in 1,649
networks - and documented that some intruder groups overwrite _all_ existing
authorized keys, which is why auditing that file is part of incident response,
not an afterthought. Deng et al. separately found 234,984 SSH services reachable
only because of firewall misconfigurations, 30% of them still negotiating weak
cryptographic algorithms.

The defensive stack you assembled maps directly onto professional practice:
disable what can be guessed (password and root login), require what cannot
(keys), watch the authentication log and respond automatically to repeated
failure (fail2ban), and audit the trust material - authorized keys and local
accounts - for anything that does not belong. The Verizon DBIR's finding that
credential abuse is the leading initial-access vector is precisely why the first
two of those steps matter more than any single clever control.

What would catch this earlier in production: key-only authentication enforced by
configuration management rather than left to each host; alerting on new entries
in `authorized_keys` files; and periodic review of which accounts can log in at
all.

**Sources:**

-   Munteanu, C., Smaragdakis, G., Feldmann, A., & Fiebig, T. (2025). Catch-22: Uncovering Compromised Hosts Using SSH Public Keys. USENIX Security 2025. <https://www.usenix.org/conference/usenixsecurity25/presentation/munteanu>
-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE S&P 2025. <https://doi.org/10.1109/SP61157.2025.00164>
-   Verizon (2025). 2025 Data Breach Investigations Report. <https://www.verizon.com/business/resources/reports/dbir/>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific scenario._
