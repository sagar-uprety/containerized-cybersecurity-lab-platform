# Unexpected Mail Traffic

Your team manages a small internal mail relay that handles outgoing mail for several applications. Network monitoring recently flagged a spike in outbound SMTP traffic from the relay — traffic that does not appear to originate from any of your known mail clients. Someone or something is using the relay to send mail, and the relay may not be checking who is asking.

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic SMTP protocol concepts (EHLO, MAIL FROM, RCPT TO, DATA commands)
-   How SMTP relays process envelope senders and recipients
-   Network service configuration on Linux (editing config files, restarting services)

If you need to review these topics, see:

-   Postfix Standard Configuration: <https://www.postfix.org/STANDARD_CONFIGURATION_README.html>
-   Postfix SMTP access controls: <https://www.postfix.org/SMTPD_ACCESS_README.html>
-   SMTP protocol overview: <https://datatracker.ietf.org/doc/html/rfc5321>

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes a workstation and the mail relay server on an isolated lab network. Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem is real.

**Guiding questions:**

-   What services are running and reachable on the lab network?
-   Can the mail relay accept and queue mail from any source, or does it check who is sending?
-   What happens when you try to send mail through the relay using an address you do not own?

Use SMTP clients and standard networking tools to explore the relay's behavior.

**Proving impact:** Once you've identified the issue, demonstrate that the relay accepts and queues mail from an arbitrary sender address. Submit a test message using a sender address you do not control, and show that the relay queues it. Use only the lab environment — do not introduce real email addresses or external resources.

## Remediate

Now fix the issue.

**Goal:** Configure the relay to reject mail forwarding from untrusted sources so that only authorized clients can send mail through it.

**Constraints:** Changes must survive a service restart.

**References:**

-   Official documentation: <https://www.postfix.org/STANDARD_CONFIGURATION_README.html>
-   SMTP access controls: <https://www.postfix.org/SMTPD_ACCESS_README.html>
-   On the mail-relay host: `postconf --help`, `man postconf` (Postfix tools are not installed on the workstation)

**Hints if you're stuck:**

-   Apply restrict-by-default thinking: only clients with a legitimate operational need should receive relay permission.
-   Compare the configured trusted-client network boundary with the clients that should actually be authorized.
-   See the trusted-network guidance in the Postfix Standard Configuration README and preserve the existing fallback rejection policy.

## Verify

After applying your fix, confirm:

1. The vulnerability is no longer exploitable
2. The service is functioning correctly

Use the same tools from your investigation to re-check. When satisfied, click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback form. Take a moment to reflect on what you learned — what surprised you, what you'd do differently, and how this applies beyond this specific scenario._

---

**Note:** This file lives at `labs/smtp-open-relay/docs/student-guide.md`. The MkDocs include at `docs/labs/smtp-open-relay.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
