# The Return Path — Instructor Guide

## Lab Overview

Students investigate a stateless firewall that protects an internal web server. They discover that source-port-based "return traffic" rules allow inbound connections from ports 80 and 53, and that the IPv6 firewall is completely open. They remediate by replacing stateless rules with stateful conntrack rules for both IPv4 and IPv6.

## Learning Objectives

| #   | Objective                                       | Assessment Criteria                                                                 |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Understand stateless vs stateful firewall rules | Student explains why `--sport 80` matches any inbound connection, not just replies  |
| 2   | Identify source-port bypass vulnerabilities     | Student demonstrates bypass using `curl --local-port 80` or `ncat --source-port 80` |
| 3   | Discover dual-stack firewall gaps               | Student finds that ip6tables has no rules and IPv6 traffic passes freely            |
| 4   | Write stateful iptables rules using conntrack   | Student creates correct `iptables-restore` rules with `ESTABLISHED,RELATED`         |
| 5   | Apply equivalent rules to both IPv4 and IPv6    | Student writes matching ip6tables rules from scratch                                |
| 6   | Test firewall configuration systematically      | Student verifies bypass blocked, outbound works, and both protocols protected       |

## Reveal Boundary

| Content                 | Student Guide            | Solution Notes       | This Guide        |
| ----------------------- | ------------------------ | -------------------- | ----------------- |
| Mission/role            | Yes                      | No                   | Summary           |
| Diagnostic commands     | Yes (investigation only) | Yes (full)           | Reference         |
| Impact demonstration    | Yes (what to observe)    | Yes (exact commands) | Expected evidence |
| Remediation objective   | Yes (goal + constraints) | Yes (exact commands) | Rubric            |
| Solution iptables rules | NEVER                    | Yes                  | Reference         |
| Reload command          | NEVER                    | Yes                  | Reference         |
| Hint ladder             | Yes (3 levels)           | No                   | Reveal policy     |
| Official doc links      | Yes                      | Yes                  | Yes               |
| Evidence checklist      | Yes                      | No                   | Expected answers  |

## Expected Evidence by Phase

| Phase     | Expected Student Evidence                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| Discover  | Student scans internal server from workstation, finds connection refused from high port but succeeds from source port 80 |
| Impact    | Student shows `curl --local-port 80` retrieving the internal page, documents false sense of security                     |
| IPv6      | Student discovers ip6tables has no rules, IPv6 traffic passes freely to internal server                                  |
| Remediate | Student writes iptables-restore rules with conntrack, removes sport rules, writes matching ip6tables rules               |
| Verify    | Portal checker reports `fixed`; source-port bypass blocked, outbound HTTP/DNS still work                                 |

## Hint Ladder and Reveal Policy

| Level | When to Reveal         | Content                                                                                                   |
| ----- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| 1     | Student asks for help  | Think about the difference between allowing return traffic and allowing any traffic from a specific port. |
| 2     | Student stuck > 10 min | Look at the iptables `conntrack` module — it can track connection state instead of matching ports.        |
| 3     | Student stuck > 20 min | See `man iptables-extensions` (conntrack section) and the iptables-restore(8) man page.                   |

## Common Mistakes

-   Students add conntrack rule but forget to remove the `--sport` rules — How to address: Ask what happens when both rules exist — the sport rule still matches first.
-   Students put conntrack rule after the dport rules — How to address: Explain iptables rule ordering — first match wins.
-   Students fix IPv4 but forget IPv6 — How to address: Ask "what about the other IP version?"
-   Students write ip6tables rules with wrong syntax — How to address: Suggest testing with `ip6tables -L -n` after loading.
-   Students forget to set default policy to DROP — How to address: Ask what happens to traffic that doesn't match any rule.
-   Students break outbound connectivity by being too restrictive — How to address: Remind them to test `curl example.com` after changes.

## Checker States

| State        | Condition                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------- |
| `vulnerable` | Source-port 80 bypass succeeds (returns 200), direct high-port blocked, outbound HTTP works |
| `fixed`      | Source-port 80 bypass blocked (timeout), direct high-port blocked, outbound HTTP works      |

## Interpreting Feedback

How to use combined feedback form responses for this lab:

-   Prior vs post confidence gap indicates learning gain on stateful vs stateless concepts.
-   Clarity scores below 3 suggest the iptables syntax guidance needs improvement.
-   Stuck-point free text reveals whether students struggle with rule ordering, conntrack syntax, or IPv6.

## Teaching Notes

-   Emphasize that "allowing return traffic by source port" is a common real-world mistake — Deng et al. (2025) found 2.4M services behind this exact misconfiguration
-   The dual-stack lesson is pedagogically valuable: administrators who configure iptables for IPv4 frequently leave ip6tables empty
-   Connect to Dietrich (2018): faulty firewall rules are among the top self-reported misconfiguration types
-   Duration: ~60-90 minutes
-   This lab requires NET_ADMIN capability on the firewall container (documented in scenario.yaml)

---

**Note:** This guide does NOT duplicate `solution-notes.md`. For the full remediation walkthrough, refer to `solution-notes.md` directly. The instructor guide focuses on assessment, intervention, and feedback interpretation.
