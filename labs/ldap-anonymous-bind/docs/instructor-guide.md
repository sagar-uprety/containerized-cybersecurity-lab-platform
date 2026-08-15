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

## Safety and Scope Boundaries

-   **Contained blast radius:** The directory server and workstation run in a per-student isolated Podman network. No directory data leaves the lab.
-   **Synthetic data only:** The directory is seeded with 50+ fabricated employee entries and dummy password material (`dummypassword` and similar). No real personal data or credentials are present.
-   **Intentional risks:** Anonymous read/search is permitted and TLS is not enforced in the baseline (`intentional-risk-allowlist.yaml`). Safe because the directory is disposable, isolated, and synthetically populated.
-   **Student boundaries:** Students stay on the lab network, use only the seeded directory, and administer the server through the `root` SSH account using `/lab/access/credentials.txt` - not platform operator commands.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable baseline and discards the fix; it does not reload slapd with a student's config. A student who wedges slapd should restart it from the SSH session, or End Lab and Start again.

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| Discover  | Student identifies LDAP on port 389, runs anonymous ldapsearch, finds user entries returned                          |
| Impact    | Student extracts `cn`, `uid`, numeric IDs, home directory, mail, phone, group membership, and password hashes        |
| Remediate | Student modifies `olcAccess`, configures TLS certificates and `olcSecurity`, then restarts slapd                     |
| Verify    | Portal checker reports `fixed`; anonymous search is denied, plaintext auth is rejected, authenticated StartTLS works |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock - this lab has two independent objectives (access control and transport) and students routinely finish one and stop.

| Trigger                                                         | Instructor Response                                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student asks for help before enumerating anonymously            | Redirect to the investigation questions; do not confirm what the directory leaks.                                                                                                    |
| Student concludes "anonymous bind is accepted, so it is broken" | Ask whether an accepted bind is the same as permission to read or search - steer them to test what entries actually return.                                                          |
| Student fixed the ACL but left plaintext allowed                | Ask whether making TLS available is the same as enforcing it; point at the separate transport objective.                                                                             |
| Student denied all access including authenticated users         | Ask what an authorized query should still be able to do.                                                                                                                             |
| Student stuck after all three written hints                     | Point at the ACL and TLS sections of the OpenLDAP Administrator's Guide, and note that pre-generated certificates already exist on the server - without naming attributes or syntax. |

**Do not reveal:** the `olcAccess` syntax, the `olcSecurity`/TLS directives, or the certificate paths. If a student cannot reach these, record it as guide-design evidence.

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

How to read this lab's combined feedback form responses:

-   A prior-vs-post confidence gap on the bind-vs-read distinction is the key signal for this lab - it is the single misconception the scenario is built to correct.
-   Low clarity scores typically point at the two-objective Remediate section: students who reported "I thought I was done" usually fixed the ACL and missed TLS enforcement.
-   Stuck-point free text mentioning "cn=config", "slapd.conf", or "Reset didn't work" reveals confusion about the runtime configuration backend and how changes are applied - a guide-clarity issue, not a knowledge gap.
-   Free text about certificates points at the TLS pointer in the guide: if students could not find the pre-generated certs, strengthen that line in "Your Lab Environment".

## Teaching Notes

-   Emphasize that LDAP is the backbone of enterprise identity - Active Directory, OpenLDAP, and 389 Directory Server all use it
-   Connect to Kaspereit et al. (USENIX Security 2024): 82,129 LDAP servers on the public Internet, 14.83% leak personal data, 2.21% leak passwords
-   Stress that anonymous bind acceptance is not anonymous directory disclosure: ACL read/search permission is the exposure being remediated
-   Connect to MITRE ATT&CK T1087 (Account Discovery) and T1018 (Remote System Discovery)
-   Discuss defense in depth: ACLs + TLS + monitoring + network segmentation

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
