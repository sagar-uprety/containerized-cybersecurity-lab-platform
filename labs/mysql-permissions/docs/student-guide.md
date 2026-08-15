# Database Access Control and Least Privilege

A colleague mentioned they were able to reach the order database from their
own laptop during a routine check last week - something that should not have
been possible from outside the application stack. Nobody on the team
remembers formally hardening this database server after it was first stood
up. You have been asked to audit exactly what it exposes, to whom, and with
what level of access, and bring it in line with how a production database
should actually be run.

## Why This Matters

Databases are the part of the stack every application ultimately depends on,
which makes their access control worth getting right the first time. An
Internet-wide measurement study found 19,456 MySQL services reachable only
because of misconfigured firewall rules, more than half of them running
end-of-life software their operators had stopped patching (Deng et al., IEEE
S&P 2025). Separately, when researchers asked operators directly what goes
wrong in practice, faulty assignment of access privileges came back as the
third most common self-reported cause of security incidents (Dietrich et
al., ACM CCS 2018) - not exotic exploits, but accounts that were simply
allowed to do more than their job required.

## Objectives

By the end of this lab you should be able to:

-   Assess whether a database's authentication is meaningful or merely
    nominal, and enumerate which accounts a server actually trusts
-   Demonstrate what an unauthenticated or under-authenticated client can
    reach, using only the synthetic data already present in this lab
-   Distinguish "reachable from a given network" from "requires a real
    credential" as two separate risks that need two separate fixes
-   Read a service account's privileges and judge whether they match what
    its application genuinely needs
-   Apply least-privilege access control so a service account can no longer
    read or write data outside its own application
-   Restrict a database service's network reachability to the interface it
    actually needs, and enable logging appropriate for audit

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic relational database concepts: databases, tables, and how a client
    connects to a server process over a network
-   Using a command-line SQL client to run simple queries against a remote
    server
-   The general idea of user accounts and privileges in a database engine -
    that an account can be scoped to less than "everything"

If you need to review these topics, see:

-   MariaDB Knowledge Base, [Connecting to MariaDB](https://mariadb.com/kb/en/connecting-to-mariadb/)
-   MariaDB Knowledge Base, [Introduction to the mariadb Client](https://mariadb.com/kb/en/mariadb-command-line-client/)
-   OWASP, [Access Control Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Access_Control_Cheat_Sheet.html) (for the general principle of least privilege)

## Your Lab Environment

Your browser terminal opens on a workstation container. From there you can
reach two other hosts on this lab's private networks: `db-host`, running the
database service, and `demo-app`, a small order application that depends on
it. Your workstation shares a network with both of them; `db-host` and
`demo-app` also share a second, separate internal network between
themselves that your workstation is not part of.

Paths and access you will need:

-   `/lab/access/credentials.txt` - administrative SSH access to `db-host`.
    The account is `root`; the password is the same one you use to log in to
    your own workstation.
-   `/lab/demo-app/app-config.env` - the order application's own database
    credential, exactly as the application itself uses it to connect.

The database currently holds two databases: `app_db`, which is what the
order application is meant to read and write, and `hr_db`, an unrelated
database that happens to live on the same server. The order application has
no legitimate reason to ever touch `hr_db`.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at
any time. **Reset** restores the original vulnerable baseline, so it is not
a way to reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown
on the portal's Workstation Access page.

## Your Mission

1. Establish which accounts this database server will accept a connection
   from, and with what credential each one actually requires.
2. Demonstrate, using only the synthetic data seeded in this lab, what an
   under-authenticated client can read - and how far that reach extends
   beyond the order application's own data.
3. Bring every account's privileges down to only what it needs, remove any
   account that grants access without a real credential, and restrict the
   database's network reachability to the interface it actually requires.
4. Confirm the order application keeps working throughout, and that query
   activity is being logged.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before changing anything, understand the environment and confirm the
problem is real.

**Guiding questions:**

-   Which accounts does this database server currently accept a connection
    from, and does each one require a credential you were actually given?
-   Once connected, what can each account see - does its reach stop at the
    application's own data, or extend further?
-   Is the database reachable from a network it has no legitimate reason to
    be reachable from?

A port scanner and a SQL client are both available on your workstation.
Start broad, then narrow in on what each account is actually permitted to
do once connected:

```bash
nmap -sV <target-host>
mysql -h <target-host> -u <username>
```

**Proving impact:** don't stop at "a connection was accepted." Show
specifically what data an under-authenticated client can read, and whether
any account's privileges reach beyond the one database the order
application is supposed to use. Use only the synthetic data already seeded
in this lab - do not introduce real credentials or external resources.

## Remediate

Now put it right.

**Goal:** No client can authenticate to this database without presenting a
real, non-empty credential. No account holds privileges beyond the one
database it is meant to serve. The database is no longer reachable from the
network your workstation sits on, but the order application - on the
internal network - keeps working exactly as before. Query activity is being
logged. All of this survives a restart of the database service.

**Constraints:** The order application must keep reading and writing its
own data throughout your changes. If it stops working, you have gone
further than the fix requires.

**Where to work:** You have administrative access to the database host
itself over SSH (see Your Lab Environment for how to reach it). Everything
below happens there: at the database engine's own local administrative
connection, and in its configuration.

**References:**

-   Official documentation: MariaDB Knowledge Base, [Securing MariaDB: mariadb-secure-installation](https://mariadb.com/kb/en/mysql_secure_installation/)
-   Official documentation: MariaDB Knowledge Base, [GRANT](https://mariadb.com/kb/en/grant/) and [REVOKE](https://mariadb.com/kb/en/revoke/)
-   Official documentation: MariaDB Knowledge Base, [Server System Variables - bind_address](https://mariadb.com/kb/en/server-system-variables/#bind_address) and [general_log](https://mariadb.com/kb/en/server-system-variables/#general_log)
-   Local: `man mysql`, `mysql --help`, and `SHOW GRANTS;` from inside the client

**If you're stuck:**

-   An account that requires no real credential provides no meaningful
    authentication, no matter which network the connection arrived from.
-   Look at what accounts exist and exactly what each one is allowed to do,
    not just whether the service accepts a connection - and treat "which
    network can reach it" and "does it require a password" as two
    independent properties you may need to change separately.
-   MariaDB's knowledge base has a dedicated page on securing a fresh
    installation, plus separate reference pages for account/grant
    management and for controlling which network interface the server
    listens on - start there.

## Verify

After applying your fix, confirm:

1. No account on this database accepts a connection with an empty
   credential.
2. Every remaining account's privileges are scoped to only the database(s)
   it needs - nothing reaches data outside its own application.
3. The database is unreachable from your workstation's network, while the
   order application still works.
4. Query activity is being logged, and all of the above survives a restart
   of the database service.

Use the same tools from your investigation to re-check. When satisfied,
click **Run Check** in the portal.

## Real-World Context

The gap this lab models - a database that is "on the internal network" but
not actually access-controlled - is not a hypothetical. Deng et al. scanned
the entire IPv4 address space and found 19,456 MySQL services reachable only
because of misconfigured firewall rules meant to keep them internal; more
than half were running database software their operators had already
stopped patching, meaning nobody was watching either the network boundary
or the software itself (Deng et al., IEEE S&P 2025).

The account-privilege half of this lab is just as well documented from the
operator's own side. When Dietrich et al. surveyed system administrators
directly about the misconfigurations they had personally caused or
encountered, faulty assignment of access privileges ranked third overall -
behind only default credentials and missing patches - and operators
described it not as a rare mistake but as a routine one: an account created
quickly during setup, granted more than it needed "to make it work," and
never revisited (Dietrich et al., ACM CCS 2018).

The operational practice that catches both halves of this before production
is the same one: treat "internal network" and "authenticated" as two
separate boxes that both have to be checked, and review account privileges
against what each service actually calls - not what would be convenient to
grant once - on a recurring schedule, not only when a database is first
built.

**Sources:**

-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE S&P 2025.
-   Dietrich, C., Krombholz, K., Borgolte, K., & Fiebig, T. (2018). Investigating System Operators' Perspective on Security Misconfigurations. ACM CCS 2018. <https://doi.org/10.1145/3243734.3243794>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you,
what you'd do differently, and how this applies beyond this specific
scenario._
