# Weak SSH Configuration and Brute-Force Vulnerability - Instructor Guide

## Lab Overview

Students investigate an SSH server flagged for suspicious login activity. They discover weak password authentication, demonstrate brute-force access, find unauthorized keys indicating prior compromise, then harden the SSH configuration, remove persistence mechanisms, and enable fail2ban.

## Learning Objectives

| #   | Objective                                      | Assessment Criteria                                                           |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Identify weak SSH authentication configuration | Student lists sshd_config findings: PermitRootLogin, PasswordAuthentication   |
| 2   | Demonstrate brute-force vulnerability          | Student shows successful password login or hydra output                       |
| 3   | Detect prior compromise via unauthorized keys  | Student identifies extra keys in authorized_keys and explains their purpose   |
| 4   | Harden SSH daemon configuration                | Student edits sshd_config to disable password auth, restrict root, set limits |
| 5   | Remove attacker persistence                    | Student removes unauthorized keys from root and user authorized_keys          |
| 6   | Configure fail2ban for rate limiting           | Student enables fail2ban sshd jail and verifies it is active                  |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                   |
| --------- | ------------------------------------------------------------------------------------------- |
| Discover  | Student identifies SSH on port 22, finds PermitRootLogin yes, PasswordAuthentication yes    |
| Impact    | Student shows successful password login as root, lists unauthorized keys in authorized_keys |
| Remediate | Student edits sshd_config, removes unauthorized keys, enables fail2ban, restarts sshd       |
| Verify    | Portal checker reports `fixed`; password auth fails, key auth works, fail2ban jail active   |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                        |
| ----- | ---------------------- | ------------------------------------------------------------------------------ |
| 1     | Student asks for help  | Think about what principle requires verifying identity before granting access. |
| 2     | Student stuck > 10 min | Look for the authentication-related settings in the SSH daemon configuration.  |
| 3     | Student stuck > 20 min | The `sshd_config` man page has a section on authentication defaults.           |

## Common Mistakes

-   Students disable PasswordAuthentication before setting up key-based auth - How to address: Remind them to verify key auth works before closing the password path.
-   Students remove ALL authorized_keys entries including the legitimate one - How to address: Ask them to back up the file first and check which keys are legitimate.
-   Students forget to restart sshd after config changes - How to address: Ask what happens when a daemon reads its config.
-   Students enable fail2ban but forget to start the service - How to address: Ask what `enabled = true` does without `systemctl start`.
-   Students change sshd_config but the entrypoint overwrites it on restart - How to address: Explain the volume-backed config pattern.

## Checker States

| State        | Condition                                                                              |
| ------------ | -------------------------------------------------------------------------------------- |
| `vulnerable` | Password auth succeeds for user accounts, fail2ban inactive, unauthorized keys present |
| `fixed`      | Password auth rejected, key auth works, fail2ban sshd jail active                      |

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
