# LDAP Directory Exposure with Anonymous Bind - Instructor Guide

## Lab Overview

Students investigate an OpenLDAP directory server on the internal network. They discover anonymous bind is enabled, enumerate organizational data (users, emails, groups, password hashes), demonstrate the impact of exposed directory information, then harden the service by configuring access control lists and enabling TLS.

## Learning Objectives

| #   | Objective                                     | Assessment Criteria                                                           |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Understand LDAP directory structure           | Student explains DIT, DN, OU, DC concepts and queries the directory correctly |
| 2   | Detect anonymous bind vulnerability           | Student performs unauthenticated ldapsearch and retrieves user entries        |
| 3   | Demonstrate data exposure impact              | Student extracts email addresses, group memberships, and password hashes      |
| 4   | Configure OpenLDAP access control             | Student modifies olcAccess ACL to restrict anonymous read access              |
| 5   | Enable TLS for LDAP connections               | Student configures olcTLSCertificateFile/KeyFile and verifies StartTLS works  |
| 6   | Verify remediation with authenticated queries | Student confirms anonymous search fails and authenticated TLS search works    |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                    |
| --------- | -------------------------------------------------------------------------------------------- |
| Discover  | Student identifies LDAP on port 389, runs anonymous ldapsearch, finds user entries returned  |
| Impact    | Student extracts email addresses, group memberships, password hashes from anonymous queries  |
| Remediate | Student modifies olcAccess ACL, configures TLS certificates, restarts slapd                  |
| Verify    | Portal checker reports `fixed`; anonymous search returns Insufficient access, StartTLS works |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                  |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | Think about what it means when a service responds to requests without requiring identity |
| 2     | Student stuck > 10 min | Look for the access control configuration in the directory's cn=config database          |
| 3     | Student stuck > 20 min | The OpenLDAP Administrator's Guide has a section on ACLs - check olcAccess syntax        |

## Common Mistakes

-   Student sets ACL to deny all access including authenticated users - How to address: Remind them authenticated users still need read access.
-   Student configures TLS but forgets to add both certificate and key attributes - How to address: Ask what a TLS handshake requires from the server.
-   Student restarts the container instead of just slapd - How to address: Either approach works; container restart is valid but slower.
-   Student modifies slapd.conf instead of cn=config - How to address: Explain that this installation uses the OLC (cn=config) runtime configuration backend.
-   Student generates new certificates but doesn't update permissions - How to address: Check file ownership with `ls -la /etc/ldap/tls/`.

## Checker States

| State        | Condition                                                                  |
| ------------ | -------------------------------------------------------------------------- |
| `vulnerable` | Anonymous ldapsearch returns user entries including cn, mail, userPassword |
| `fixed`      | Anonymous ldapsearch returns Insufficient access; StartTLS query succeeds  |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain.
-   Clarity scores below 3 suggest guide needs revision.
-   Stuck-point free text reveals guide gaps.

## Teaching Notes

-   Emphasize that LDAP is the backbone of enterprise identity - Active Directory, OpenLDAP, and 389 Directory Server all use it
-   Connect to Kaspereit et al. (USENIX Security 2024): 82,129 LDAP servers on the public Internet, 14.83% leak personal data, 2.21% leak passwords
-   Discuss that anonymous bind is part of the LDAP RFC (4513) - administrators must explicitly disable it
-   Connect to MITRE ATT&CK T1087 (Account Discovery) and T1018 (Remote System Discovery)
-   Discuss defense in depth: ACLs + TLS + monitoring + network segmentation

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
