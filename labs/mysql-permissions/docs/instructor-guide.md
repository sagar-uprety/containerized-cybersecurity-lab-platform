# Database Access Control and Least Privilege - Instructor Guide

## Lab Overview

The environment ships a MariaDB server (`db-host`) seeded with two
databases: `app_db` (customer/order data the order application legitimately
uses) and `hr_db` (unrelated employee salary data it has no business
touching). The baseline has four stacked weaknesses: a blank-password
network root account, a passwordless anonymous account with read access to
`app_db`, a database bound to every network interface instead of only the
internal one, and an application account holding `GRANT ALL ON *.*` instead
of privileges scoped to `app_db`. A small demo order application
(`demo-app`) depends on the database so students can observe that a
correct fix keeps the application working while a careless one (e.g.
revoking everything) breaks it. A complete remediation drops the two
dangerous accounts, scopes the application account's grants, restricts
`bind-address` to the internal network plus loopback, and turns on
`general_log` for audit.

## Learning Objectives

| #   | Objective                                                                                 | Assessment Criteria                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Assess MariaDB authentication strength from an unauthenticated client's perspective       | Student can show that root and anonymous access succeed with no credential in the vulnerable baseline        |
| 2   | Enumerate database accounts and their grants                                              | Student can read `mysql.user` and interpret `SHOW GRANTS` output to identify over-privileged accounts        |
| 3   | Distinguish network exposure from authentication as separate, independently fixable risks | Student can explain why restricting `bind-address` and removing a weak account are two different mitigations |
| 4   | Apply least-privilege grants scoped to the schema an application actually needs           | Student replaces `GRANT ALL ON *.*` with a scoped grant and demonstrates the application still functions     |
| 5   | Restrict network binding to only the interface a service needs                            | Student determines the internal network address and updates `bind-address` accordingly                       |
| 6   | Enable audit logging for a production-relevant database service                           | Student enables `general_log` and explains what it would surface during an incident review                   |

## Safety and Scope Boundaries

-   **Contained blast radius:** `db-host` and `demo-app` sit on an isolated
    `app-net`; the workstation reaches `db-host` only over a separate
    `client-net`. Neither network reaches any other student's instance or
    the host network. No container runs privileged or with host networking.
-   **Synthetic data only:** `app_db.customers`, `app_db.orders`, and
    `hr_db.employees` are entirely fabricated (fictional names, `example.com`
    email addresses, invented salary figures). No real personal or financial
    data exists anywhere in this lab.
-   **Intentional risks:** the blank-password `root@'%'` account, the
    passwordless anonymous account, `bind-address = 0.0.0.0`, and
    `app_user`'s `GRANT ALL ON *.*` are the four deliberate weaknesses this
    lab teaches. Each exists only
    inside this student's isolated Podman network and only until the
    student remediates it.
-   **Student boundaries:** students must stay inside their own lab
    containers and network. They must not attempt to reach other students'
    instances, the x01/x02 hosts, or any host outside the lab topology, and
    must not introduce real credentials or personal data into the seeded
    tables.
-   **Instructor recovery:** if a student breaks the database beyond
    recovery (for example, drops `app_db` itself, or locks themselves out of
    every account), **Reset** in the portal destroys the data volume and
    reprovisions the vulnerable baseline from scratch on next start. A plain
    **Stop**/**Start** does not reprovision - it preserves whatever state the
    student left behind, including a broken one.

## Expected Evidence by Phase

| Phase       | Expected Student Evidence                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Orient      | Student can state that "internal network" does not mean "authenticated" and that a reachable database is not automatically safe     |
| Investigate | Student demonstrates root and anonymous access with no credential, and reads `app_user`'s grants to show they exceed its needs      |
| Remediate   | Student removes both dangerous accounts, scopes `app_user`'s grants, edits `bind-address`, restarts the server, and enables logging |
| Verify      | Checker reports `fixed`; student can independently show `app_user` still reads/writes `app_db` but is denied on `hr_db`             |

## Reveal Policy and Intervention

| Trigger                                                                                                            | Instructor Response                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Student asks for help before investigating                                                                         | Redirect to the investigation questions; do not confirm or deny findings.                                               |
| Student proved root/anonymous access but cannot find where accounts are managed                                    | Point them at the database host's own admin access (see Your Lab Environment), not at the specific SQL statements.      |
| Student fixed the accounts and grants but the checker still reports the database reachable from the client network | Ask what "internal network interface only" would mean for a service with two network attachments.                       |
| Student revoked all of `app_user`'s privileges and the order application broke                                     | Ask them to re-read the Constraints in the Remediate section - what must still work, and for which database only?       |
| Student stuck after all three written hints                                                                        | Confirm they have looked at `SHOW GRANTS FOR CURRENT_USER` from the application's own connection, not just root's view. |

**Do not reveal:** the specific account names (`root`, the anonymous user),
the exact `DROP USER`/`REVOKE`/`GRANT` statements, the `bind-address` value,
or the config file path. These must come from the student's own
investigation and reading of the official MariaDB documentation linked in
the guide.

## Common Mistakes

-   Setting a strong root password instead of removing network root
    entirely: partially credits the "weak credential" objective but leaves
    root reachable over the network at all, which the official
    `mariadb-secure-installation` guidance explicitly recommends against -
    How to address: ask whether a database administrator should ever need
    `root` reachable from the client network at all, versus administering it
    locally.
-   Revoking all of `app_user`'s privileges without re-granting the ones the
    application needs: breaks the guardrail - How to address: point at the
    Constraints line in Remediate and ask them to check the demo
    application's `/` endpoint after each change.
-   Restricting `bind-address` without ever restarting the server: MariaDB
    does not re-read `bind-address` while running - How to address: ask
    what "the config file says X" versus "the running process is using X"
    means, and how they would find the difference.
-   Editing `bind-address` to a value that also excludes the application's
    own network: breaks the guardrail differently (the demo app stops
    working) - How to address: ask them to determine and use the internal
    network's actual address rather than guessing a value.

## Checker States

| State        | Condition                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerable` | All six objective checks observe the original baseline: blank-password root and anonymous accounts, open binding, unscoped grants, and logging disabled |
| `fixed`      | All six objective checks observe the remediated state, and both guardrails (order app read + health) stay healthy                                       |

Only `vulnerable` and `fixed` are real reported states. If some objective
checks pass and others do not - for example, accounts fixed but
`bind-address` still exposes the client network - the portal reports each
check's individual state rather than a blended "partial" status.

## Interpreting Feedback

How to read this lab's combined feedback form responses:

-   A large prior-vs-post confidence gap on "least privilege" specifically
    (rather than on authentication generally) suggests the GRANT/REVOKE
    mechanics were the sticking point, not the concept of exposure - review
    whether the Remediate section's references to official grant syntax are
    easy to find.
-   A low clarity score paired with stuck-point text mentioning "the app
    broke" almost always means the student over-revoked `app_user` and
    needs a clearer read of what Constraints requires before they touch
    grants.
-   Stuck-point text mentioning "how do I find the address" or "what IP"
    indicates the network-binding step, not the account/grant step, needs a
    clearer hint about using the host's own network resolution.
-   Free text describing confusion between "the database is on the internal
    network" and "the database requires authentication" is exactly the
    misconception this lab exists to correct - a spike in that language
    across a cohort suggests emphasizing the distinction earlier in a
    pre-lab briefing rather than relying on the lab alone.

## Teaching Notes

-   Emphasize that network placement and access control are independent
    controls - a database "on the internal network" is not secured by that
    fact alone, and a well-authenticated database is still exposed if it is
    reachable from an untrusted network.
-   Research grounding: Dietrich (CCS 2018) found faulty privilege
    assignment is the third most commonly self-reported operator
    misconfiguration; Deng (IEEE S&P 2025) measured tens of thousands of
    exposed MySQL instances behind misconfigured firewalls, many running
    end-of-life versions. This lab models both failure modes in one
    environment.
-   This lab belongs to the DSR evaluation episode focused on
    authentication-and-authorization misconfiguration, distinct from the
    "no authentication at all" episode modeled by the NoSQL exposure lab -
    debrief the difference explicitly if students have taken both.
-   This concept recurs anywhere a service account outlives its original
    scope: cloud IAM roles, API keys with wildcard scopes, and CI/CD service
    accounts all fail the same way `app_user` did here.

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full
remediation walkthrough, refer to `solution-notes.md` directly. The
instructor guide focuses on assessment, safety, intervention, and feedback
interpretation.
