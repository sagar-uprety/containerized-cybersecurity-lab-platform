# SMTP Open Relay and Spoofing - Instructor Guide

## Lab Overview

Students investigate a Postfix mail relay that accepts and queues mail from any source for any destination. They demonstrate spoofed-sender relay abuse, then restrict relay access by tightening `mynetworks` while preserving Postfix's relay rejection rule.

## Learning Objectives

| #   | Objective                    | Assessment Criteria                                                  |
| --- | ---------------------------- | -------------------------------------------------------------------- |
| 1   | Understand SMTP relay logic  | Student explains what an open relay is and why it is dangerous       |
| 2   | Demonstrate open relay abuse | Student submits a spoofed envelope and records the queued response   |
| 3   | Configure relay restrictions | Student restricts mynetworks and preserves reject_unauth_destination |
| 4   | Verify relay hardening       | Student confirms relay is rejected from untrusted sources            |

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Scenario    | Student reads SITREP and understands the mail relay context                                                                   |
| Investigate | Student discovers SMTP port 25 is open, tests relay with swaks from arbitrary sender                                          |
| Investigate | Student inspects main.cf and explains why broad client trust bypasses the existing fallback rejection rule                    |
| Remediate   | Student edits main.cf via shared volume at /lab/postfix/main.cf: restricts mynetworks and preserves reject_unauth_destination |
| Remediate   | Student reloads Postfix via SSH + sudo                                                                                        |
| Verify      | Student re-tests with swaks and confirms relay is rejected; runs portal check                                                 |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                 |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | Apply restrict-by-default thinking to which clients receive relay permission.                           |
| 2     | Student stuck > 10 min | Compare the trusted-client network boundary with the clients that should be authorized.                 |
| 3     | Student stuck > 20 min | See the trusted-network guidance in Postfix STANDARD_CONFIGURATION_README; preserve fallback rejection. |

## Common Mistakes

-   Student removes `reject_unauth_destination` while restricting mynetworks - How to address: Ask what rule rejects an untrusted client's relay attempt after it fails the trusted-network test.
-   Student moves the rejection rule into `smtpd_recipient_restrictions` - How to address: Explain that this lab preserves the existing modern Postfix 2.10+ relay-policy location and changes only the overbroad trust boundary.
-   Student edits a configuration copy outside the shared volume - How to address: Direct them to the useful path in SITREP and ask which file is mounted as the active Postfix configuration.

## Checker States

| State        | Condition                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `vulnerable` | swaks accepts relay from an untrusted client because mynetworks trusts every IPv4 address                          |
| `fixed`      | swaks relay rejected with 554/5.7.1; mynetworks restricted to localhost; reject_unauth_destination remains present |
| Guardrails   | reject_unauth_destination remains configured and the SMTP service returns a banner                                 |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that `mynetworks` is not authentication — it is IP-based trust. In a real environment, always combine with SASL authentication.
-   The lab intentionally disables TLS and SASL to focus on relay restrictions. Mention that production Postfix should also enforce `smtpd_tls_security_level` and SASL.
-   Real-world reference: Pletinckx (NDSS 2025) found 373 SMTP servers turned into open relays via PROXY protocol header injection — showing that relay abuse is a current real-world problem.
-   Postfix's `smtpd_relay_restrictions` is the modern Postfix 2.10+ relay-policy location and is required by this lab's checker. Do not present moving the rule to `smtpd_recipient_restrictions` as an equivalent lab solution, even though older production configurations may enforce relay policy there.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
