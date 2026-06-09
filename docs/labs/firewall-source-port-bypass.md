# The Return Path

<!--8<-- START labs/firewall-source-port-bypass/docs/student-guide.md 8<-->

The organization's perimeter firewall was configured by a previous administrator
to allow outbound web and DNS traffic. Management wants you to verify that
internal services are properly protected from external access. The firewall sits
between the external network and an internal web server that should not be
reachable from outside.

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

Your lab environment includes a workstation on the external network, a firewall
that separates the external and internal networks, and an internal web server
behind the firewall. Use the portal to **Start Lab**, **Run Check**, **Reset**,
or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What hosts are reachable from the workstation on the lab network?
-   Does the internal web server respond when you connect from a random high port?
-   What happens when you connect from a specific source port like 80 or 53?
-   Are the firewall rules the same for IPv4 and IPv6?
-   What is the difference between allowing "return traffic" and allowing "any traffic from a port"?

Use network scanners, HTTP clients, and standard Linux utilities to explore the
environment. The workstation has `nmap`, `curl`, `ncat`, and access to the
firewall's iptables rules.

**Proving impact:** Once you've identified the issue, demonstrate that the
firewall's rules allow traffic that should be blocked. Use only what the lab
environment provides — do not introduce real credentials or external resources.

## Remediate

Now fix the issue.

**Goal:** Replace the flawed firewall rules with proper stateful connection
tracking so that only legitimate return traffic is allowed, and apply the same
protection to both IPv4 and IPv6.

**Constraints:** Changes must survive a service restart. Outbound web browsing
and DNS resolution must continue to work after your changes.

**References:**

-   Official documentation: <https://manpages.debian.org/bookworm/iptables/iptables-extensions.8.en.html> (conntrack section)
-   Local: `man iptables-extensions`, `man iptables-restore`, `iptables -m conntrack --help`

**Need a hint?**

-   Think about what "stateful" means — can a firewall track whether a connection was initiated from inside?
-   Look at the `conntrack` match module in the iptables extensions documentation.
-   The `iptables-restore` man page explains the rules file format used in `/etc/iptables/`.

## Verify

After applying your fix, confirm:

1.  The source-port bypass no longer works
2.  Outbound web browsing and DNS still function
3.  Both IPv4 and IPv6 are protected

Use the same tools from your investigation to re-test. When satisfied, click
**Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned — what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._

<!--8<-- END labs/firewall-source-port-bypass/docs/student-guide.md 8<-->
