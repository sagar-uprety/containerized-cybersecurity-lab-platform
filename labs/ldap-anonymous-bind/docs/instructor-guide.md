# LDAP Directory Exposure with Anonymous Bind - Instructor Guide

## Lab Overview

Students investigate an OpenLDAP directory server on the internal network. They distinguish anonymous bind from anonymous read/search, enumerate exposed organizational data, then harden the service with ACLs and mandatory TLS. Lab-local credentials are discoverable at `/lab/access/credentials.txt` from the student workstation; no operator lifecycle tooling is part of the student flow.

## Learning Objectives

| #   | Objective                                     | Assessment Criteria                                                                          |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Understand LDAP directory structure           | Student explains DIT, DN, OU, DC concepts and queries the directory correctly                |
| 2   | Detect anonymous bind vulnerability           | Student performs unauthenticated ldapsearch and retrieves user entries                       |
| 3   | Demonstrate data exposure impact              | Student extracts names, IDs, home directories, phone/email data, groups, and password hashes |
| 4   | Configure OpenLDAP access control             | Student modifies olcAccess ACL to restrict anonymous read access                             |
| 5   | Enforce TLS for LDAP connections              | Student configures the certificate/key and rejects authenticated plaintext LDAP              |
| 6   | Verify remediation with authenticated queries | Student confirms anonymous search fails and authenticated StartTLS search works              |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Discover  | Student identifies LDAP on port 389, runs anonymous ldapsearch, finds user entries returned                          |
| Impact    | Student extracts `cn`, `uid`, numeric IDs, home directory, mail, phone, group membership, and password hashes        |
| Remediate | Student modifies `olcAccess`, configures TLS certificates and `olcSecurity`, then restarts slapd                     |
| Verify    | Portal checker reports `fixed`; anonymous search is denied, plaintext auth is rejected, authenticated StartTLS works |

## Hint Ladder and Reveal Policy

| Level | When to Reveal                | Content                                                                                                                   |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help         | Think about what it means when a service responds to requests without requiring identity                                  |
| 2     | Student stuck > 10 min        | Look for the access control configuration in the directory's cn=config database                                           |
| 3     | Student stuck > 20 min        | The OpenLDAP Administrator's Guide has a section on ACLs - check olcAccess syntax                                         |
| 4     | Student fixed ACL but not TLS | Pre-generated TLS certificates already exist on the directory server - look for how to point the directory config at them |

## Common Mistakes

-   Student sets ACL to deny all access including authenticated users - How to address: Remind them authenticated users still need read access.
-   Student enables StartTLS but leaves plaintext operations allowed - How to address: Ask whether TLS availability and TLS enforcement are equivalent.
-   Student clicks the portal's **Reset** action expecting it to reload slapd with their new config - How to address: Reset restores the vulnerable baseline and discards the fix; slapd must be restarted manually from the SSH session (`pkill slapd` + start a new `slapd` process) instead.
-   Student modifies slapd.conf instead of cn=config - How to address: Explain that this installation uses the OLC (cn=config) runtime configuration backend.
-   Student generates new certificates but doesn't update permissions - How to address: Check file ownership with `ls -la /etc/ldap/tls/`.

## Checker States

| State        | Condition                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Anonymous search returns entries and authenticated plaintext LDAP remains allowed                                    |
| `fixed`      | Anonymous StartTLS search is denied, authenticated plaintext is rejected, and authenticated StartTLS search succeeds |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that LDAP is the backbone of enterprise identity - Active Directory, OpenLDAP, and 389 Directory Server all use it
-   Connect to Kaspereit et al. (USENIX Security 2024): 82,129 LDAP servers on the public Internet, 14.83% leak personal data, 2.21% leak passwords
-   Stress that anonymous bind acceptance is not anonymous directory disclosure: ACL read/search permission is the exposure being remediated
-   Connect to MITRE ATT&CK T1087 (Account Discovery) and T1018 (Remote System Discovery)
-   Discuss defense in depth: ACLs + TLS + monitoring + network segmentation

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
