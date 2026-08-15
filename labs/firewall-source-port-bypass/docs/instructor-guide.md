# Firewall Rule Misconfiguration - Source-Port Bypass - Instructor Guide

## Lab Overview

Students investigate an IPv4 firewall protecting an internal web server. They
discover that a source-port-based reply rule admits a new connection
from source port 80. They replace that shortcut with a persistent conntrack rule
and use a lab-local health path to distinguish hardening from service breakage.

## Learning Objectives

| #   | Objective                                       | Assessment Criteria                                                                   |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Understand stateless vs stateful firewall rules | Student explains why `--sport 80` matches any inbound connection, not just replies    |
| 2   | Identify source-port bypass vulnerabilities     | Student demonstrates a new connection through DNAT using local source port 80         |
| 3   | Write stateful iptables rules using conntrack   | Student creates a valid `iptables-restore` rule with `ESTABLISHED,RELATED`            |
| 4   | Keep active and persistent policy aligned       | Student saves the rule file and applies it with the accessible reload helper          |
| 5   | Test firewall configuration systematically      | Student verifies bypass blocked while the internal service and DNAT path stay healthy |

## Safety and Scope Boundaries

-   **Contained blast radius:** The external workstation, firewall host, and internal web server run across two per-student Podman networks (`external`, `internal`). The internal server is reachable only through the firewall; nothing routes outside the lab.
-   **Synthetic data only:** The internal web server serves placeholder content and a health path. There is no real data behind the firewall.
-   **Intentional risks:** A stateless `--sport 80` rule that admits new connections from source port 80 is the deliberate weakness (`intentional-risk-allowlist.yaml`). Safe because the topology is isolated and the "external" network is a lab-only segment.
-   **Student boundaries:** Students probe only lab hosts and edit rules only on the firewall host via the `firewall` SSH account and its limited `sudo` helper - not platform operator commands.
-   **Instructor recovery:** Portal **Reset** restores the vulnerable rules. A student who breaks connectivity should End Lab and Start again; the reload helper keeps active and persistent rules aligned when used correctly.

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Discover  | Student compares an ordinary new connection with one bound to source port 80                                   |
| Impact    | Student retrieves the internal page through the firewall's DNAT path using source port 80                      |
| Remediate | Student replaces the source-port rule, updates `/etc/iptables/rules.v4`, and reloads it                        |
| Verify    | Portal checker reports `fixed`; bypass is blocked, stateful policy persists, and service/DNAT health is intact |

## Reveal Policy and Intervention

The student guide already contains three written hints. Do not restate them. Escalate on the student's state, not the clock.

| Trigger                                                                    | Instructor Response                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Student asks for help before probing from a controlled source port         | Redirect to the investigation questions; do not name the source-port trick.                                        |
| Student sees the bypass but cannot explain it                              | Ask what the rule actually matches on, and whether a source port is something the sender chooses.                  |
| Student fixed the active rules but not the persistent file (or vice versa) | Ask whether the running policy and `/etc/iptables/rules.v4` currently agree, and how they would after a reload.    |
| Student blocked the bypass but also broke the internal service             | Ask them to check the internal health path from the firewall's inside interface.                                   |
| Student stuck after all three written hints                                | Point at the conntrack section of `iptables-extensions` and the `iptables-restore` man page; do not give the rule. |

**Do not reveal:** the exact conntrack rule syntax or the states to match. If a student cannot reach it, record it as guide-design evidence.

## Common Mistakes

-   Students add conntrack rule but forget to remove the `--sport` rules - How to address: Ask what happens when both rules exist - the sport rule still matches first.
-   Students forget to set default policy to DROP - How to address: Ask what happens to traffic that doesn't match any rule.
-   Students change only the active rules - How to address: Ask which file the startup path restores and have them use the reload helper.
-   Students stop nginx or remove DNAT to make the attack time out - How to address: Explain that the checker independently validates both paths.

## Checker States

| Check                | Kind      | `vulnerable`                                     | `fixed`                                                 |
| -------------------- | --------- | ------------------------------------------------ | ------------------------------------------------------- |
| `fw_path_ready`      | guardrail | Service, DNAT, forwarding, and masquerade ready  | Same; counters reset before the behavioral probe        |
| `fw_sourceport80`    | objective | New source-port 80 connection returns the page   | The same new connection is blocked                      |
| `fw_stateful_rules`  | objective | Active or persistent policy retains the shortcut | Both policies contain conntrack and omit source port 80 |
| `fw_forwarding_path` | guardrail | Fresh workstation probe increments DNAT          | Same; prevents an untraversed DNAT path from passing    |

Overall state is driven by behavior plus the active and persistent policy. The
first guardrail checks nginx from the firewall's internal side, validates the
forwarding configuration, and resets DNAT counters. The final guardrail then
requires the intervening workstation probe to increment the correct rule.

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain on stateful vs stateless concepts.
-   Clarity scores below 3 suggest the iptables syntax guidance needs improvement.
-   Stuck-point free text reveals whether students struggle with shell context, conntrack syntax, or persistence.

## Teaching Notes

-   Emphasize that "allowing return traffic by source port" is a common real-world mistake - Deng et al. (2025) found 2.4M services behind this exact misconfiguration
-   Connect to Dietrich (2018): faulty firewall rules are among the top self-reported misconfiguration types
-   This lab requires NET_ADMIN capability on the firewall container (documented in scenario.yaml)

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
