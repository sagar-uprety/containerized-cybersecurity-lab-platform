# Open Door Policy

You've been called in as an incident responder. A server was flagged after
suspicious SSH login activity appeared in the authentication logs. The previous
administrator may have left weak configurations in place, and there are signs
that someone may have already gained access. Your job is to audit the SSH
service, demonstrate the risk, and harden the server.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation and the target SSH server on an
isolated lab network. Use the portal to **Start Lab**, **Run Check**, **Reset**,
or **End Lab** as needed.

**SSH access:** Use the lab key to connect to the target server:

```bash
ssh -i /lab/keys/lab_key lab-user@ssh-host
```

When prompted for a password (for `sudo`), use: `demo-ssh-pass`

## Investigation

Before fixing anything, understand the environment and confirm the problem
is real.

**Guiding questions:**

-   What services are running and reachable on the lab network?
-   What authentication methods does the SSH server accept?
-   Are there any user accounts with weak or default passwords?
-   Can you find evidence that someone has already accessed this server?

Use network scanners, SSH clients, brute-force tools, and standard Linux
utilities to explore the environment.

**Proving impact:** Once you've identified the issues, demonstrate that an
attacker could gain unauthorized access. Use only what the lab environment
provides — do not introduce real credentials or external resources.

## Remediate

Now fix the issues.

**Goal:** Harden the SSH server so that only key-based authentication is
accepted, root login is restricted, and brute-force attempts are blocked.

**Constraints:** Your legitimate key-based access must continue to work after
your changes. Changes must survive a service restart.

**References:**

-   Official documentation: <https://man.openbsd.org/sshd_config>
-   Local: `man sshd_config`, `sshd -T | grep -i <setting>`

**Need a hint?**

-   What principle requires verifying identity before granting access to a system?
-   Look for the authentication-related settings in the SSH daemon configuration file.
-   The `sshd_config` man page has a section on authentication — check the default values and what they allow.

## Verify

After applying your fix, confirm that:

1.  The vulnerability is no longer exploitable
2.  Your legitimate access still works
3.  Brute-force protection is active

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned — what surprised you,
what you'd do differently, and how this applies beyond this specific scenario._
