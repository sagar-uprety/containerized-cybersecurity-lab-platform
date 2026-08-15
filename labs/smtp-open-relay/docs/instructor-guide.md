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

## Safety and Scope Boundaries

-   **Contained blast radius:** The Postfix relay and workstation run in a per-student isolated Podman network. The relay cannot deliver to any real external mail server; all traffic stays in the lab.
-   **Synthetic data only:** Test mail uses lab-only sender and recipient addresses. No real email addresses are involved and nothing leaves the lab network.
-   **Intentional risks:** A broad trusted-client setting (`mynetworks = 0.0.0.0/0`) that makes the relay open is the deliberate weakness (`intentional-risk-allowlist.yaml`). Safe because the relay has no outbound path beyond the isolated lab.
-   **Student boundaries:** Students send test mail only through the lab relay using lab-only addresses; they must not introduce real recipients or attempt delivery to external hosts.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable configuration. A student who wedges Postfix should End Lab and Start again.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Orient      | Student reads the guide's environment section and understands the mail relay context                                          |
| Investigate | Student discovers SMTP port 25 is open, tests relay with swaks from arbitrary sender                                          |
| Investigate | Student inspects main.cf and explains why broad client trust bypasses the existing fallback rejection rule                    |
| Remediate   | Student edits main.cf via shared volume at /lab/postfix/main.cf: restricts mynetworks and preserves reject_unauth_destination |
| Remediate   | Student reloads Postfix via SSH + sudo                                                                                        |
| Verify      | Student re-tests with swaks and confirms relay is rejected; runs portal check                                                 |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock.

| Trigger                                                                 | Instructor Response                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Student asks for help before testing the relay from an untrusted source | Redirect to the investigation questions; do not name the trusted-network setting.                                    |
| Student sees the relay accept spoofed mail but cannot explain why       | Ask which clients the relay currently treats as trusted, and which should be.                                        |
| Student narrowed trust but broke legitimate mail flow                   | Ask which authorized clients still need to relay, and whether the fallback rejection is intact.                      |
| Student stuck after all three written hints                             | Point at the trusted-network section of the Postfix Standard Configuration README; do not give the setting or value. |

**Do not reveal:** the exact `mynetworks` value or the relay-restriction directives. If a student cannot reach these, record it as guide-design evidence.

## Common Mistakes

-   Student removes `reject_unauth_destination` while restricting mynetworks - How to address: Ask what rule rejects an untrusted client's relay attempt after it fails the trusted-network test.
-   Student moves the rejection rule into `smtpd_recipient_restrictions` - How to address: Explain that this lab preserves the existing modern Postfix 2.10+ relay-policy location and changes only the overbroad trust boundary.
-   Student edits a configuration copy outside the shared volume - How to address: Point them to the path in the guide's Your Lab Environment section and ask which file is mounted as the active Postfix configuration.

## Checker States

| State        | Condition                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `vulnerable` | swaks accepts relay from an untrusted client because mynetworks trusts every IPv4 address                          |
| `fixed`      | swaks relay rejected with 554/5.7.1; mynetworks restricted to localhost; reject_unauth_destination remains present |
| Guardrails   | reject_unauth_destination remains configured and the SMTP service returns a banner                                 |

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   A prior-vs-post confidence gap on "restrict by default" indicates whether the transferable principle - define who may relay and refuse the rest - landed beyond this one Postfix setting.
-   Low clarity scores usually point at the distinction between the trusted-client boundary and the fallback rejection: students who narrowed one but not the other need that separation stated more plainly.
-   Stuck-point free text mentioning "still relays" or "broke sending" reveals whether a student widened trust by mistake or narrowed it past the legitimate clients.
-   Confusion about where Postfix tools live (relay host, not workstation) is guide-design signal: strengthen that line in "Your Lab Environment".

## Teaching Notes

-   Emphasize that `mynetworks` is not authentication - it is IP-based trust. In a real environment, always combine with SASL authentication.
-   The lab intentionally disables TLS and SASL to focus on relay restrictions. Mention that production Postfix should also enforce `smtpd_tls_security_level` and SASL.
-   Real-world reference: Pletinckx (NDSS 2025) found 373 SMTP servers turned into open relays via PROXY protocol header injection - showing that relay abuse is a current real-world problem.
-   Postfix's `smtpd_relay_restrictions` is the modern Postfix 2.10+ relay-policy location and is required by this lab's checker. Do not present moving the rule to `smtpd_recipient_restrictions` as an equivalent lab solution, even though older production configurations may enforce relay policy there.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
