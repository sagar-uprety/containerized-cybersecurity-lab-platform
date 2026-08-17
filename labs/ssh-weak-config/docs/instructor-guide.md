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

## Safety and Scope Boundaries

-   **Contained blast radius:** The SSH target and workstation run in a per-student isolated Podman network. Brute-force tooling (Hydra) is confined to the lab; there is no route to any host outside it.
-   **Synthetic data only:** The planted weak passwords (`demo-ssh-pass` and the candidate list) and the unauthorized keys are obviously fake teaching material. No real credentials exist on the host.
-   **Intentional risks:** Weak account passwords, permitted password/root login, and planted `authorized_keys` entries are the deliberate weaknesses students discover. Safe because the host is disposable and isolated.
-   **Student boundaries:** The password assessment is authorized only against the `lab-user` account using the supplied candidate list; students must not target hosts outside the lab or introduce external wordlists or credentials.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable baseline. A student who locks themselves out of key access should End Lab and Start again rather than expecting Reset to repair a broken `authorized_keys`.

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                        |
| --------- | ------------------------------------------------------------------------------------------------ |
| Discover  | Student identifies SSH, effective weak authentication policy, weak accounts, and planted keys    |
| Impact    | Student shows weak-password access and explains the unauthorized `authorized_keys` entries       |
| Remediate | Student validates SSH config, locks weak accounts, cleans keys, and enables the SSH jail         |
| Verify    | Portal reports `fixed`; password/root access fails, key access works, and a safe test ban occurs |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock.

| Trigger                                                              | Instructor Response                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Student asks for help before auditing config and accounts            | Redirect to the investigation questions; do not name the weak account or the login policy.                         |
| Student hardened `sshd_config` but ignored the planted keys/accounts | Ask whether closing the password path actually neutralises a weak local credential or an attacker's installed key. |
| Student treats an active fail2ban jail as proof                      | Ask for evidence that SSH log events are matched and that a safe non-client address can be banned.                 |
| Student disabled password auth before confirming key access          | Ask them to prove their key still works before closing the only other way in.                                      |
| Student stuck after all three written hints                          | Point at the authentication sections of `sshd_config(5)` and `jail.conf(5)`; do not give directives or values.     |

**Do not reveal:** which candidate password succeeds, the specific directives to change, or the fail2ban jail configuration. If a student cannot get there, record it as guide-design evidence.

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

How to read this lab's combined feedback form responses:

-   A prior-vs-post confidence gap on "password vs key authentication" indicates whether the central lesson - that a guessable credential verifies nothing - actually landed.
-   Low clarity scores usually point at the multi-part remediation: students who fixed the daemon but not the accounts/keys, or vice versa, often report the Goal as "too many things at once" - a signal to check whether the four Verify conditions are sequenced clearly.
-   Stuck-point free text mentioning "locked out" or "key not working" reveals students who closed the password path before confirming key access - a common and recoverable error worth flagging in debrief.
-   Free text about fail2ban ("is it working?") is guide-design signal that the difference between an active jail and a proven ban needs more emphasis.

## Teaching Notes

-   Emphasize that SSH is only as secure as its configuration - the protocol itself is not the weakness
-   Connect to Munteanu et al. (2025): 21,700 compromised SSH hosts found via attacker-installed keys
-   Connect to Verizon DBIR 2025: credential abuse is the #1 initial-access vector (~22%)
-   Discuss defense in depth: password auth + fail2ban + key rotation + monitoring

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
