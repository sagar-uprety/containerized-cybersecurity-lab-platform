# FTP Anonymous Access and Cleartext Credential Exposure - Instructor Guide

## Lab Overview

Students discover an FTP server (vsftpd) that accepts anonymous logins with
upload rights and never encrypts sessions, even for a named account. They
enumerate and write to the anonymous share, capture a named account's
password in cleartext with tcpdump, then harden the service by disabling
anonymous access and enabling FTPS (explicit TLS) so both authentication
and data transfer are encrypted.

## Learning Objectives

| #   | Objective                                                                                                              | Assessment Criteria                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Determine whether the service can be reached without proving identity, and demonstrate what that access permits        | Student enumerates the FTP port, connects anonymously, and shows both reading and writing without credentials            |
| 2   | Capture and interpret a live authentication exchange to establish whether the protocol protects credentials in transit | Student runs a packet capture during a named-user login and extracts the plaintext password from it                      |
| 3   | Remove the credential-free access path from the service                                                                | `anonymous_enable=NO` in the effective config; anonymous login and upload rejected                                       |
| 4   | Require encrypted authentication and file transfer for the accounts that remain                                        | `ssl_enable=YES`, `force_local_logins_ssl=YES`, `force_local_data_ssl=YES` in effective config; plaintext login rejected |
| 5   | Confirm legitimate access still works and that credentials are no longer observable, including after a restart         | The named account authenticates and transfers files over TLS after a service restart; portal checker reports `fixed`     |

## Safety and Scope Boundaries

-   **Contained blast radius:** The FTP server and workstation run in a
    per-student isolated Podman network. Nothing seeded here is reachable
    outside the lab, and the passive-port range (21100-21110) is never
    published to the host - all FTP traffic, including data connections,
    stays on the internal lab network.
-   **Synthetic data only:** The anonymous share holds fabricated files
    (`demo-pipeline-pass-2024`, `demo-monitor-pass-2024`, and similar). No
    real files, credentials, or personal data are present. The named
    account's password (`ftp-demo-password`) is a fixed, dummy, in-lab-only
    credential.
-   **Intentional risks:** Anonymous read/write access and a disabled TLS
    configuration are the deliberate weaknesses this lab teaches against.
    Safe because the server is disposable, isolated, and synthetically
    seeded.
-   **Student boundaries:** Students stay on the lab network, use only
    seeded data and the pre-created `ftpuser`/`ftpadmin` accounts, and
    administer the server through the `ftpadmin` SSH account - not platform
    operator commands.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable
    baseline and discards a student's fix, including any certificate they
    regenerated. If a student wedges vsftpd (for example, a config that
    fails to parse), End Lab and Start again rather than trying to hand-fix
    the running container.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario    | Student explains in their own words why credential-free file transfer access is a risk, independent of what is in the share              |
| Investigate | `nmap -p 21` and an anonymous `curl`/`ftp` session confirm the port is open and accepts a login with no credentials                      |
| Impact      | Student downloads a seeded file and uploads a new one anonymously; student captures and reads a plaintext password from a packet capture |
| Remediate   | Student edits `vsftpd.conf` to disable anonymous access and require TLS for the named account's login and data transfer                  |
| Remediate   | Student restarts vsftpd through the `ftpadmin` account and confirms the new config is active                                             |
| Verify      | Anonymous login rejected; plaintext named-user login rejected; TLS named-user login succeeds; portal checker reports `fixed`             |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate
them here. Escalate on the student's state, not the clock.

| Trigger                                                                     | Instructor Response                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student asks for help before confirming anonymous access themselves         | Redirect to the investigation questions; do not confirm or deny what the service accepts.                                                               |
| Student captured the password but does not see why that matters             | Ask who else could be positioned to see the same traffic on a shared network segment.                                                                   |
| Student disabled anonymous access but the plaintext-login check still fails | Ask whether removing one access path also protects the account that was never anonymous to begin with.                                                  |
| Student enabled TLS but the named account can no longer log in at all       | Ask them to check what the client needs to be told when the server presents a certificate it did not request before                                     |
| Student stuck after all three written hints                                 | Point at the `vsftpd.conf` man page's `SSL/TLS` section, and confirm a certificate already exists for them to reference - without naming the directives |

**Do not reveal:** the specific `anonymous_enable`, `ssl_enable`,
`force_local_logins_ssl`, or `force_local_data_ssl` directives, or the
exact restart command. If a student cannot reach these after all three
hints, record it as guide-design evidence rather than handing over the
answer.

## Common Mistakes

-   Students disable anonymous access but leave `ssl_enable=NO` - How to address: ask whether the capture they made earlier would still be possible against the account that is left.
-   Students set `ssl_enable=YES` but forget `force_local_logins_ssl=YES` - How to address: ask whether a client that chooses not to negotiate TLS should still be allowed to authenticate.
-   Students edit `vsftpd.conf` but do not restart the service - How to address: ask how vsftpd is told to re-read its configuration file, and whether it behaves like a service with a reload signal.
-   Students point `rsa_cert_file`/`rsa_private_key_file` at a path that does not exist - How to address: ask where the lab environment already generated a certificate for this instance.
-   Students test with a plain `ftp://` URL after enabling TLS and conclude the fix failed - How to address: ask what explicitly tells an FTP client to negotiate encryption before it authenticates.

## Checker States

| State        | Condition                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | Anonymous login and anonymous upload succeed; the named account authenticates over plaintext; TLS login is unavailable; effective config has `anonymous_enable=YES`                                      |
| `fixed`      | Anonymous login and upload rejected; plaintext named-user login rejected; the named account authenticates over TLS; effective config disables anonymous access and requires TLS; port 21 still listening |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   A prior-vs-post confidence gap on "protocol security" concepts
    indicates the tcpdump capture step landed - students who saw their own
    plaintext password in a capture typically report the largest shift.
-   Clarity scores below 3 concentrated on the Remediate section usually
    mean students could not find the pre-generated certificate path; check
    whether they are looking on the workstation instead of the shared
    config volume.
-   Stuck-point free text mentioning "certificate" or "TLS failed" points at
    the `-k`/insecure-certificate step being unfamiliar - this is expected
    for students who have not used FTPS before and is worth a debrief note,
    not a guide fix.
-   Free text describing the service as "just an old protocol nobody uses"
    is a signal to reinforce the Real-World Context section in debrief;
    FTP's continued prevalence, not its age, is the point.

## Teaching Notes

-   Emphasize that this lab teaches two independent failures, not one:
    credential-free access (authentication) and unencrypted transport
    (confidentiality). A fix that addresses only one leaves the other
    exploitable.
-   The tcpdump step is the pedagogical core of this lab: it turns "the
    protocol is insecure" from an abstract claim into something the student
    personally observed on the wire.
-   Research grounding: Deng (IEEE S&P 2025) measured 32,172 FTP services
    behind misconfigured firewalls, including instances allowing anonymous
    login. Irvine (ASE 2017) established the Labtainers pattern of
    recovering a cleartext password via tcpdump as an effective teaching
    device, which this lab applies to a still-widely-deployed protocol
    rather than telnet.
-   This lab belongs to the FEDS evaluation episode assessing whether
    guided discovery labs transfer the general lesson "protocol choice
    determines whether authentication is confidential" across services,
    not just within one.
-   Where this concept recurs: any legacy cleartext protocol (HTTP without
    TLS, unencrypted SMTP/IMAP/POP3) fails the same way for the same
    reason.
-   Maps to CIS Control 4 (Secure Configuration), CWE-319 (Cleartext
    Transmission of Sensitive Information), MITRE ATT&CK T1040 (Network
    Sniffing), NIST SP 800-53 SC-8 (Transmission Confidentiality and
    Integrity).

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full
remediation walkthrough, refer to `solution-notes.md` directly. The
instructor guide focuses on assessment, safety, intervention, and feedback
interpretation.
