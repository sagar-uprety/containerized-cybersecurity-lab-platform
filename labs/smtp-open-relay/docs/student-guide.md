# Unexpected Mail Traffic

Your team manages a small internal mail relay that handles outgoing mail for
several applications. Network monitoring recently flagged a spike in outbound
SMTP traffic from the relay - traffic that does not appear to originate from any
of your known mail clients. Something is using the relay to send mail, and the
relay may not be checking who is asking.

## Why This Matters

A mail relay that forwards messages for anyone is an open relay, and open relays
are among the oldest misconfigurations still in circulation. A 2025 measurement
study of the PROXY protocol found 373 servers turned into working open relays,
and noted they are "persistent because current scanners don't include PROXY
headers" - in other words, they stay open precisely because they are hard to
notice (Pletinckx et al., NDSS 2025). An open relay lets an outsider send mail
that appears to come from your organization: spoofed invoices, credential-
phishing from a domain recipients trust, spam that gets your address blocklisted.

The principle this lab teaches is "restrict by default, allow by exception".
A relay should forward mail for the clients you name, and refuse everyone else -
not the other way around.

## Objectives

By the end of this lab you should be able to:

-   Explain how an SMTP relay decides whether to forward a message, based on the envelope sender and recipient
-   Demonstrate relay abuse by sending mail through the relay from a sender address you do not control
-   Identify the configuration that authorizes forwarding, and compare it against the clients that should actually be trusted
-   Apply restrict-by-default thinking so the relay forwards only for authorized clients and refuses the rest
-   Confirm that legitimate mail flow still works after the restriction

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic SMTP protocol concepts (EHLO, MAIL FROM, RCPT TO, DATA commands)
-   How SMTP relays process envelope senders and recipients
-   Network service configuration on Linux (editing config files, restarting services)

If you need to review these topics, see:

-   Postfix Standard Configuration: <https://www.postfix.org/STANDARD_CONFIGURATION_README.html>
-   Postfix SMTP access controls: <https://www.postfix.org/SMTPD_ACCESS_README.html>
-   SMTP protocol overview: <https://datatracker.ietf.org/doc/html/rfc5321>

## Your Lab Environment

Your browser terminal starts on the **workstation**. The **mail relay server**
sits on the same isolated lab network.

Paths and access you will need:

-   `/lab/postfix` - the mail relay's configuration directory, mounted so you can inspect and edit it from the workstation. Its main configuration file is `main.cf`.
-   Postfix's own command-line tools are installed on the **mail-relay host**, not the workstation. When you need them (for example, to check effective settings or restart the service), work on the relay host itself.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any
time. **Reset** restores the original vulnerable baseline, so it is not a way to
reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on
the portal's Workstation Access page.

## Your Mission

1. Inspect the mail relay and establish how it decides whether to forward a message.
2. Determine whether it accepts and queues mail from arbitrary senders for non-local destinations.
3. Demonstrate the impact by sending test mail through the relay using a sender address you do not control.
4. Bring the relay to a state where it forwards only for authorized clients and rejects mail from untrusted sources, without breaking legitimate mail flow.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before fixing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What services answer on the lab network, and which is the mail relay?
-   Does the relay accept and queue mail from any source, or does it check who is sending?
-   What happens when you submit a message through the relay using an address you do not own, addressed to a destination the relay does not host?

SMTP clients and standard networking tools are installed on the workstation.
Command shapes to start from - an SMTP conversation can be driven by hand:

```bash
nmap -sV -p <port> <target-host>
swaks --server <target-host> --from <sender> --to <recipient>
telnet <target-host> <port>
```

**Proving impact:** Demonstrate that the relay accepts and queues mail from an
arbitrary sender address for a destination it has no reason to serve. Submit a
test message using a sender address you do not control and show that the relay
queues it. Use only the lab environment - do not introduce real email addresses
or external resources.

## Remediate

Now fix the issue.

**Goal:** When you are done: the relay refuses to forward mail submitted by
clients outside its trusted set, while continuing to accept mail from the clients
that legitimately use it. Your changes must survive a service restart.

**Constraints:** Changes must survive a service restart. Legitimate mail flow
from authorized clients must keep working.

**Where to work:** The relay configuration is at `/lab/postfix/main.cf`, editable
from the workstation. Applying settings and restarting the service happen on the
mail-relay host, where the Postfix tools live. The portal's **Reset** action
restores the vulnerable baseline, so it is not the right tool for reloading a
fix.

**References:**

-   Official documentation: <https://www.postfix.org/STANDARD_CONFIGURATION_README.html>
-   SMTP access controls: <https://www.postfix.org/SMTPD_ACCESS_README.html>
-   On the mail-relay host: `postconf --help`, `man postconf`

**If you're stuck:**

-   Apply restrict-by-default thinking: only clients with a legitimate operational need should be granted relay permission, and everyone else should be refused by default.
-   Compare the client network the relay currently treats as trusted against the clients that should actually be authorized. The gap between those two is the vulnerability.
-   The trusted-network guidance in the Postfix Standard Configuration README explains which setting defines the trusted client set; make sure the relay keeps a fallback that rejects unauthorized destinations.

## Verify

After applying your fix, confirm:

1. The relay no longer forwards mail submitted from an untrusted source
2. Legitimate mail flow from authorized clients still works

Use the same tools from your investigation to re-check. When satisfied, click
**Run Check** in the portal.

## Real-World Context

Open relays predate most of the people who still find them, which is exactly why
they are instructive. Pletinckx et al. measured the modern version of the
problem: among 2,332,377 SMTP hosts that accepted PROXY protocol headers, they
identified 373 that could be driven into open-relay behaviour and 25,366 on-path
proxy bypasses - and their central finding was that these relays persist because
standard scanners do not send the headers that expose them. A misconfiguration
that cannot be seen does not get fixed.

The abuse is direct and easy to picture: an attacker sends mail through your
relay with a forged sender, and the message inherits whatever trust your domain
and IP address carry. Recipients see a plausible internal address; your mail
server does the delivering; and when the spam is noticed, it is your
infrastructure that gets blocklisted. The fix is conceptually small - define who
is allowed to relay and refuse everyone else - but the discipline it represents,
restrict by default, is the same one behind every access-control decision in this
course.

What would catch it earlier in production: testing relay behaviour from outside
the trusted network as part of deployment, not just confirming that authorized
clients can send; alerting on outbound volume that does not match known senders;
and reviewing the trusted-client definition whenever the network topology
changes.

**Sources:**

-   Pletinckx, S., Kruegel, C., & Vigna, G. (2025). A Large-scale Measurement Study of the PROXY Protocol and its Security Implications. NDSS 2025. <https://www.ndss-symposium.org/ndss-paper/a-large-scale-measurement-study-of-the-proxy-protocol-and-its-security-implications/>
-   Postfix SMTP access controls (SMTPD_ACCESS_README). <https://www.postfix.org/SMTPD_ACCESS_README.html>

---

_When you're done, end the lab through the portal and complete the feedback form.
Take a moment to reflect on what you learned - what surprised you, what you'd do
differently, and how this applies beyond this specific scenario._
