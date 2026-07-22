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

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Scenario    | Student explains in their own words why an unauthenticated file share is a data-exposure risk                 |
| Investigate | `nmap -p 445` / `smbclient -N -L` reveal the share; `smbclient -N //…/backup -c ls` lists sensitive files     |
| Impact      | Student downloads `passwords.txt` / `app-production.conf` and shows contents readable without credentials     |
| Remediate   | Student edits `smb.conf` (guest ok no, map to guest Never, valid users, smb encrypt required)                 |
| Remediate   | Student creates the Samba user (`smbpasswd -a shareuser`) and restarts `smbd`                                 |
| Verify      | Anonymous access denied; authenticated user reads share; unencrypted session rejected; portal checker `fixed` |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                                                                             |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | A share that lets anyone connect without credentials is the issue — what Samba parameter controls guest mapping?                                                    |
| 2     | Student stuck > 10 min | The config lives at `/lab/smb/smb.conf` (shared volume). `map to guest`, `guest ok`, `valid users`, and `smb encrypt` are the relevant directives.                  |
| 3     | Student stuck > 20 min | See the Samba `smb.conf` man page and the `smbpasswd` man page. The `allowed` group and `shareuser` account already exist; set a Samba password and restart `smbd`. |

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
