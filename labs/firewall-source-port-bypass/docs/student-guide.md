# Stateful Firewall Configuration

## Situation

**Role:** Network security auditor

The organization's perimeter firewall was set up by a previous administrator
and has never been independently tested. Management wants you to verify that an
internal web service is genuinely protected from new connections arriving from
the external network.

## Why This Matters

A firewall is the most basic network control there is, which is exactly why a
flawed rule is so dangerous: it provides a false sense of security while quietly
admitting traffic. The first Internet-wide study of this class of mistake found
2,488,958 services on 2.1 million hosts that were reachable only because of
misconfigured firewalls, spread across 15,837 networks in 221 countries (Deng et
al., IEEE S&P 2025). The authors put it plainly - "firewall rules are subtle and
error-prone", and a single flawed rule can compromise the whole boundary.

The specific misconception this lab targets is the belief that a packet arriving
from a service's port must be a legitimate reply. It need not be. Recognizing a
reply and trusting any packet that claims to be one are very different things.

## Objectives

By the end of this lab you should be able to:

-   Explain the difference between stateless packet filtering and stateful connection tracking
-   Probe a firewall from an unexpected angle - controlling your own source port - to test what it really matches
-   Identify a rule that trusts a packet's source port and explain why that creates a bypass
-   Replace a source-port shortcut with connection-state tracking so replies are recognized without admitting new connections
-   Confirm a firewall change from more than one vantage point, including that the protected service still works

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic TCP/IP networking (IP addresses, ports, source vs. destination, and the OSI/TCP layers)
-   What a firewall is and the difference between stateful and stateless packet filtering
-   Basic Linux networking tools (`ping`, `curl`, `ncat`, and `nmap` concepts)

If you need to review these topics, see:

-   iptables/netfilter concepts (stateful connection tracking): <https://wiki.debian.org/iptables>
-   TCP/IP networking basics: <https://datatracker.ietf.org/doc/html/rfc1180>
-   Firewall fundamentals: <https://csrc.nist.gov/glossary/term/firewall>

## Your Lab Environment

Your browser terminal starts on the **workstation**, which sits on the
**external** network. A **firewall host** separates the external network from an
**internal** network, and an **internal web server** sits behind the firewall on
that internal side. Keep track of which host each shell prompt belongs to - it
matters here.

Paths and access you will need:

-   `/lab/config/fw_external_ip.txt` - on the workstation; holds the firewall's external address, which you will need to aim your probes at.
-   The IPv4 rule file, `/etc/iptables/rules.v4`, lives on the **firewall host**, not the workstation. Connect there over SSH as the `firewall` account, using your own lab password. That account can inspect, save, restore, and reload the IPv4 rules through a limited passwordless `sudo` helper.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   Which hosts are reachable from the workstation on the lab network?
-   Does the internal web server respond when you connect from an ordinary high source port?
-   Does anything change when a new connection is made from a particular source port?
-   Which packets does the firewall rule actually match, regardless of whether a connection already existed?
-   What is the real difference between recognizing a reply to an established connection and trusting any packet that carries a service port number?

The workstation has `nmap`, `curl`, and `ncat`, and can read the firewall's
iptables rules once you are on the firewall host. Command shapes to start from -
note that some tools let you dictate your own source port:

```bash
nmap -sV <internal-server>
curl --local-port <port> http://<internal-server>:<port>/
ncat -p <source-port> <internal-server> <port>
```

**Proving impact:** Demonstrate that the firewall admits traffic it should
block - that a new connection, made under the right conditions, reaches a server
that is supposed to be protected. Showing the difference between a blocked
attempt and a successful one is the proof; a single successful request on its own
does not explain _why_. Use only what the lab environment provides.

## Remediate

Now fix the policy.

**Goal:** When you are done: reply traffic to connections that were legitimately
established from inside is still recognized and allowed; a new connection
arriving from the external network can no longer reach the internal web server,
regardless of which source port it uses; the running rules and the persistent
rule file agree after you reload through the firewall's helper; and the internal
web service is still healthy from the firewall's internal side.

**Constraints:** The active rules and `/etc/iptables/rules.v4` must match after
you use the firewall's reload helper. The internal web service must remain
reachable and healthy from the firewall's internal side.

**Where to work:** The IPv4 rules are in `/etc/iptables/rules.v4` on the firewall
host; edit them there and reload with the account's `sudo` helper. The portal's
**Reset** action restores the vulnerable baseline, so it is not the right tool
for reloading a fix.

**References:**

-   Official documentation: <https://manpages.debian.org/bookworm/iptables/iptables-extensions.8.en.html> (conntrack section)
-   Local: `man iptables-extensions`, `man iptables-restore`, `iptables -m conntrack --help`

**If you're stuck:**

-   The whole problem comes down to how a firewall decides that a packet belongs to a conversation. A source-port number is a claim the sender makes; a firewall that can track connection _state_ does not have to take that claim on trust. Which of those is this firewall doing?
-   Look at the connection-tracking match module rather than at port numbers. The goal is to admit packets that belong to an established or related connection, and nothing else, on the path into the internal network.
-   The conntrack section of the iptables-extensions documentation describes the states you can match on, and the `iptables-restore` man page describes the rules-file format so your persistent change reloads cleanly.

## Verify

After applying your fix, confirm each of the following:

1. The source-port bypass no longer reaches the internal server, from any source port
2. The active and persistent rules both express connection state rather than a trusted source port
3. The internal web service still responds from the firewall's internal side

Use the same tools from your investigation to re-test each one. When satisfied,
click **Run Check** in the portal.

## Real-World Context

The bypass you just closed is not a textbook curiosity - it is one of the most
widespread firewall mistakes on the Internet. Deng et al. conducted the first
comprehensive study of hosts hidden behind misconfigured firewalls, scanning the
entire IPv4 space, and found nearly 2.5 million services made reachable this way
across 15,837 networks. Italy (303,000 hosts), the United States (290,000), and
China (216,000) topped the list, and well-known enterprises had thousands of
affected hosts each. A four-month honeypot showed the abuse potential was real
even though no mass campaign was exploiting it yet - which is the good time to
fix a thing, before it is being used.

The root cause is conceptual, not technical. A stateless rule that permits any
packet with source port 80 was written to mean "let replies from web servers back
in", but a firewall reading only the port field cannot tell a genuine reply from
an attacker who simply set their source port to 80. Connection-state tracking
closes the gap by remembering which connections were actually established from
inside, so a reply is recognized by its place in a real conversation rather than
by a number anyone can forge.

A related lesson worth carrying away: administrators who carefully configure IPv4
rules frequently leave the IPv6 firewall empty or permissive, opening a second
door on the same host. Whenever you harden one address family, check the other.

**Sources:**

-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE S&P 2025. <https://doi.org/10.1109/SP61157.2025.00164>
-   netfilter/iptables conntrack documentation. <https://manpages.debian.org/bookworm/iptables/iptables-extensions.8.en.html>

---

_When you're done, end the lab through the portal and complete the feedback
form. Take a moment to reflect on what you learned - what surprised you, what
you'd do differently, and how this applies beyond this specific scenario._
