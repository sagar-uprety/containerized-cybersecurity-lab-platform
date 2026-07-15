# Weak SSH Configuration and Brute-Force Vulnerability

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

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic SSH concepts (what an SSH server does, the difference between password and key-based authentication)
-   Linux file permissions and basic configuration editing (using a text editor like `nano` or `vim`)
-   What brute-force and dictionary attacks are and why weak passwords are risky

If you need to review these topics, see:

-   OpenSSH official documentation: <https://www.openssh.com/manual.html>
-   SSH key-based authentication basics: <https://man.openbsd.org/ssh.1> (see AUTHENTICATION section)
-   Password security and brute-force concepts: <https://csrc.nist.gov/glossary/term/brute-force_attack>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation and the target SSH server on an
isolated lab network. Use the portal to **Start Lab**, **Run Check**, **Reset**,
or **End Lab** as needed.

The browser terminal opens on the workstation. The target hostname and
legitimate lab key are available in the lab environment; use standard SSH
client help to determine how to connect.

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
provides - do not introduce real credentials or external resources.

## Remediate

Now fix the issues.

**Goal:** Harden the SSH server so that only the intended key remains usable,
direct root login and weak-password access are removed, authentication attempts
are limited, and repeated failures are blocked from the SSH authentication log.

**Constraints:** Your legitimate key-based access must continue to work after
your changes. Changes must survive a service restart.

**References:**

-   Official documentation: <https://man.openbsd.org/sshd_config>
-   Local: `man sshd_config`, `sshd -T`, `man fail2ban`, `man jail.conf`

**Hints if you're stuck:**

-   What principle requires verifying identity before granting access to a system?
-   Review both account/key state and the authentication and logging areas of the SSH daemon and intrusion-prevention configuration.
-   Use the authentication sections of `sshd_config(5)` and the SSH jail, log-source, and action sections of `jail.conf(5)` to identify what must change and how to prove it works.

## Verify

After applying your fix, confirm that:

1. The vulnerability is no longer exploitable
2. Your legitimate access still works
3. Brute-force protection consumes SSH events and can impose a ban

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific scenario._
