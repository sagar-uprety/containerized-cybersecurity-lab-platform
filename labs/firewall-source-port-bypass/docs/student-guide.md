# Firewall Rule Misconfiguration - Source-Port Bypass

You are auditing a firewall whose previous administrator used packet port
numbers to identify reply traffic. Management wants you to determine whether a
new connection from the external network can reach an internal web server, fix
the policy, and verify that the protected service remains healthy.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic TCP/IP networking (IP addresses, ports, source vs. destination, and the OSI/TCP layers)
-   What a firewall is and the difference between stateful and stateless packet filtering
-   Basic Linux networking tools (`ping`, `curl`, `ncat`, and `nmap` concepts)

If you need to review these topics, see:

-   iptables/netfilter concepts (stateful connection tracking): <https://wiki.debian.org/iptables>
-   TCP/IP networking basics: <https://datatracker.ietf.org/doc/html/rfc1180>
-   Firewall fundamentals: <https://csrc.nist.gov/glossary/term/firewall>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation on the external network, a firewall
that separates the external and internal networks, and an internal web server
behind the firewall. Use the portal to **Start Lab**, **Run Check**, **Reset**,
or **End Lab** as needed.

The browser terminal starts on the external workstation. The firewall's rule
file lives on `firewall-host`; connect there as user `firewall` with your lab
password when you need to inspect or change it. Keep track of which host each
shell prompt belongs to. The firewall account can inspect, save, restore, and
reload the IPv4 rules through its limited passwordless `sudo` permissions.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What hosts are reachable from the workstation on the lab network?
-   Does the internal web server respond when you connect from a random high port?
-   What changes when a new connection uses source port 80?
-   Which packets does the firewall rule actually match, regardless of connection history?
-   What is the difference between recognizing a reply and trusting any packet from a service port?

Use network scanners, HTTP clients, and standard Linux utilities to explore the
environment. The workstation has `nmap`, `curl`, `ncat`, and access to the
firewall's iptables rules.

**Proving impact:** Once you've identified the issue, demonstrate that the
firewall's rules allow traffic that should be blocked. Use only what the lab
environment provides - do not introduce real credentials or external resources.

## Remediate

Now fix the issue.

**Goal:** Replace the source-port shortcut with IPv4 connection-state tracking
so that reply traffic can be identified without admitting a new connection.

**Constraints:** The active rules and `/etc/iptables/rules.v4` must agree after
using the firewall's reload helper. The internal web service must remain healthy
from the firewall's internal side.

**References:**

-   Official documentation: <https://manpages.debian.org/bookworm/iptables/iptables-extensions.8.en.html> (conntrack section)
-   Local: `man iptables-extensions`, `man iptables-restore`, `iptables -m conntrack --help`

**Need a hint?**

-   Think about what "stateful" means - can a firewall track whether a connection was initiated from inside?
-   Look at the `conntrack` match module in the iptables extensions documentation.
-   The `iptables-restore` man page explains the rules file format used in `/etc/iptables/`.

## Verify

After applying your fix, confirm:

1. The source-port bypass no longer works
2. The active and persistent rules use connection state rather than source port 80
3. The internal web service still responds from the firewall's internal side

Use the same tools from your investigation to re-test. When satisfied, click
**Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
