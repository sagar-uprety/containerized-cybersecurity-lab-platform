# Open SMB Share with Sensitive Data Exposure - Instructor Guide

## Lab Overview

Students discover a Samba file server exposing a `backup` share to anyone on the network without credentials, enumerate seeded sensitive files, then harden the service by disabling guest access, restricting the share to an authorized group, creating a Samba user, enabling SMB encryption, and restarting `smbd`.

## Learning Objectives

| #   | Objective                                           | Assessment Criteria                                                            |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Identify an exposed file share                      | Student enumerates SMB shares/services and confirms anonymous read access      |
| 2   | Demonstrate data exposure                           | Student downloads and inspects seeded sensitive files without credentials      |
| 3   | Disable guest access                                | `guest ok = no` and `map to guest = Never` in effective config                 |
| 4   | Restrict share to an authorized group               | `valid users = @allowed` present and a Samba user in `allowed` can read        |
| 5   | Enforce real authentication (disable guest mapping) | Wrong password rejected; `map to guest = Never` active                         |
| 6   | Enable SMB encryption                               | `smb encrypt = required` in effective config; unencrypted sessions rejected    |
| 7   | Preserve authenticated access (service continuity)  | Restricted user can still read the share after restart                         |
| 8   | Verify restart persistence                          | Hardened config is active after `smbd` restart; portal checker reports `fixed` |

## Safety and Scope Boundaries

-   **Contained blast radius:** The Samba server and workstation run in a per-student isolated Podman network. No share is reachable outside the lab.
-   **Synthetic data only:** The share holds fabricated backup and credential files (`demo-backup-pass-2024`, `demo-api-key-DEADBEEF2024`, and similar). No real files or secrets are present.
-   **Intentional risks:** Guest mapping and an unauthenticated, unencrypted share are the deliberate weaknesses (`intentional-risk-allowlist.yaml`). Safe because the server is disposable, isolated, and synthetically seeded.
-   **Student boundaries:** Students stay on the lab network, use only seeded data, and administer the server through the `sambaadmin` SSH account - not platform operator commands.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable baseline and discards a student's fix. A pre-created Unix account and `allowed` group exist for the intended solution; if a student wedges Samba, End Lab and Start again.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Scenario    | Student explains in their own words why an unauthenticated file share is a data-exposure risk                 |
| Investigate | `nmap -p 445` / `smbclient -N -L` reveal the share; `smbclient -N //…/backup -c ls` lists sensitive files     |
| Impact      | Student downloads `passwords.txt` / `app-production.conf` and shows contents readable without credentials     |
| Remediate   | Student edits `smb.conf` (guest ok no, map to guest Never, valid users, smb encrypt required)                 |
| Remediate   | Student creates the Samba user (`smbpasswd -a shareuser`) and restarts `smbd`                                 |
| Verify      | Anonymous access denied; authenticated user reads share; unencrypted session rejected; portal checker `fixed` |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them, and note that hints 2 and 3 in the earlier version named the exact directives - the intervention policy below stays above that line. Escalate on the student's state, not the clock.

| Trigger                                                          | Instructor Response                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student asks for help before enumerating shares anonymously      | Redirect to the investigation questions; do not name the guest-mapping directive.                                                                |
| Student required a password but the share still opens for guests | Ask what happens to an unknown user the server maps onto a guest identity.                                                                       |
| Student fixed authentication but left the transport unencrypted  | Ask whether "only authorized users can read it" also covers someone watching the network path.                                                   |
| Student created a Unix user but cannot connect                   | Ask how a Samba account differs from the underlying Unix account.                                                                                |
| Student stuck after all three written hints                      | Point at the `smb.conf` and `smbpasswd` man pages, and note that an authorized group and account already exist - without listing the directives. |

**Do not reveal:** the specific guest, access-control, and encryption directives, or the exact `smbpasswd` invocation. If a student cannot reach these, record it as guide-design evidence.

## Common Mistakes

-   Students set `guest ok = no` but leave `map to guest = Bad User` - How to address: ask what happens to clients that send no username when that policy is still active.
-   Students add `valid users = @allowed` but forget to create a Samba password for `shareuser` - How to address: ask how Samba authenticates a user that has no entry in its passdb.
-   Students edit `smb.conf` but do not restart `smbd` - How to address: ask when Samba re-reads its configuration file.
-   Students set `smb encrypt = required` but the workstation `smbclient` connection then fails - How to address: confirm the client negotiated SMB 3; modern `smbclient` does this automatically when the server requires it.
-   Students run `smbpasswd -a shareuser` from the workstation instead of the file server - How to address: the passdb and `smbd` run on the server; SSH in as the lab admin account.

## Checker States

| State        | Condition                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Anonymous `smbclient` reads the share; wrong password accepted (guest-mapped); `smb encrypt` not required; guest ok enabled                                                                                         |
| `fixed`      | Anonymous read denied; wrong password rejected; `shareuser%smb-demo-password` reads the share; `smb encrypt = required` in config; guest ok disabled, `map to guest = Never`, `valid users` set; port 445 listening |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain around access control and transport encryption.
-   Clarity scores below 3 suggest the guide needs stronger hints on where config lives or how Samba user creation differs from Unix user creation.
-   Stuck-point free text mentioning "restart" or "password not working" reveals whether students confuse Unix passwords with Samba passdb entries.

## Teaching Notes

-   Emphasize the distinction between **network reachability** and **authorization**: the port being open is expected for a file server; the problem is that no identity check gates access.
-   Walk through the layered defense: disable guest → restrict to group → require encryption. Each layer addresses a different failure (anonymous access, over-broad access, sniffing).
-   Real-world reference: Deng (IEEE S&P 2025) found 19,419 SMB services behind misconfigured firewalls and 202 explicitly unprotected file shares; Dietrich (CCS 2018) reports operators stumbling onto unprotected shares by chance.
-   Note that `map to guest = Never` is the Samba default, so the vulnerable `Bad User` is an explicit (and common) misconfiguration, not an accident of defaults.
-   Maps to CIS Control 13 (Data Protection), CWE-200 / CWE-276, MITRE ATT&CK T1039 (Data from Network Shared Drive), NIST SP 800-53 AC-3 / AC-6.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
