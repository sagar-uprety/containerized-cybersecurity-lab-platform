# Weak SSH Configuration and Brute-Force Vulnerability - Instructor Guide

## Lab Overview

Students investigate an SSH server flagged for suspicious login activity. They discover weak password authentication, demonstrate brute-force access, find unauthorized keys indicating prior compromise, then harden the SSH configuration, remove persistence mechanisms, and enable fail2ban.

## Learning Objectives

| #   | Objective                                      | Assessment Criteria                                                                       |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Identify weak SSH authentication configuration | Student lists sshd_config findings: PermitRootLogin, PasswordAuthentication               |
| 2   | Demonstrate brute-force vulnerability          | Student shows successful password login or hydra output                                   |
| 3   | Detect prior compromise via unauthorized keys  | Student identifies extra keys in authorized_keys and explains their purpose               |
| 4   | Harden SSH daemon configuration                | Effective config disables passwords and root login, limits attempts, and passes `sshd -t` |
| 5   | Remove attacker persistence and weak accounts  | Student removes unauthorized keys and locks accounts with planted passwords               |
| 6   | Configure fail2ban for rate limiting           | Student proves the jail consumes the SSH auth log and performs a safe test ban            |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                        |
| --------- | ------------------------------------------------------------------------------------------------ |
| Discover  | Student identifies SSH, effective weak authentication policy, weak accounts, and planted keys    |
| Impact    | Student shows weak-password access and explains the unauthorized `authorized_keys` entries       |
| Remediate | Student validates SSH config, locks weak accounts, cleans keys, and enables the SSH jail         |
| Verify    | Portal reports `fixed`; password/root access fails, key access works, and a safe test ban occurs |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                                                                    |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | Think about what principle requires verifying identity before granting access.                                                                             |
| 2     | Student stuck > 10 min | Review both account/key state and the authentication and logging areas of the SSH daemon and intrusion-prevention configuration.                           |
| 3     | Student stuck > 20 min | Use the authentication sections of `sshd_config(5)` and the SSH jail, log-source, and action sections of `jail.conf(5)` to identify and prove the changes. |

## Common Mistakes

-   Students disable PasswordAuthentication before setting up key-based auth - How to address: Remind them to verify key auth works before closing the password path.
-   Students remove ALL authorized_keys entries including the legitimate one - How to address: Ask them to back up the file first and check which keys are legitimate.
-   Students reload an invalid SSH configuration - How to address: Require `sshd -t` and effective-config inspection before signaling the daemon.
-   Students treat an active fail2ban jail as proof of protection - How to address: Ask for evidence that SSH log events are matched and a safe non-client address is banned.
-   Students forget the planted passwords after disabling SSH password auth - How to address: Ask whether removing one login path remediates weak local account credentials.
-   Students change sshd_config but the entrypoint overwrites it on restart - How to address: Explain the volume-backed config pattern.

## Checker States

| State        | Condition                                                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Weak-password login works; weak/root policy, planted keys, unlocked accounts, or ineffective fail2ban remain                                                     |
| `fixed`      | Config validates and is effective; passwords/root are rejected; accounts and keys are clean; key access and auth logging work; fail2ban performs a safe test ban |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that SSH is only as secure as its configuration - the protocol itself is not the weakness
-   Connect to Munteanu et al. (2025): 21,700 compromised SSH hosts found via attacker-installed keys
-   Connect to Verizon DBIR 2025: credential abuse is the #1 initial-access vector (~22%)
-   Discuss defense in depth: password auth + fail2ban + key rotation + monitoring

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
