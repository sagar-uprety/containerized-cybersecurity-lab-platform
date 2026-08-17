# Live Verification and Release Checklist

_[← Validate, Deploy, and Publish](06-validate-and-deploy.md) · [Guide overview](index.md)_

## Live End-to-End Verification

Static validation proves structure, not behavior. A lab is not done until tested
on x01 through the same path a student uses.

### Pass A: Vulnerable to Fixed

1. Start a fresh instance from the portal.
2. Run checker immediately; all objectives should show vulnerable and all
   guardrails should pass.
3. Execute every solution-notes Bash block exactly from the student workstation.
4. Confirm documented outputs and credentials/paths are discoverable.
5. Run checker; every objective and guardrail should pass, overall `fixed`.

### Pass B: Broken-Service Guardrail

1. From a fixed instance, stop/break only target service through a student-
   reachable lab action.
2. Run checker.
3. Confirm outcome is `unknown` or `error`, never `fixed`.
4. Restore service and confirm fixed state returns.

### Mutation Coverage

For every objective, make one small regression from fixed state. Confirm the
matching criterion fails while unrelated criteria retain honest results. This
catches checkers that only recognize one exact canonical solution or miss a
documented requirement.

### Reset

1. Use portal Reset.
2. Confirm volumes and generated state return to complete vulnerable baseline.
3. Run checker and confirm initial vulnerable state plus healthy guardrails.
4. End the test lab and confirm resources are removed.

### Concurrent Isolation When Capacity Allows

Use two test students when evaluating scale. Confirm unique names, ports,
volumes, and networks; no cross-student connectivity; and independent checker
results. Current deployment admission limits may permit only one concurrent lab,
so coordinate this test only when concurrent capacity is configured.

## Troubleshooting

| Symptom                                             | Likely cause                                                | Fix                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `additional properties are not allowed`             | Field not in schema or wrong nesting                        | Compare exact sample/schema location; do not invent API fields                   |
| Scenario ID mismatch                                | Directory, `id`, docs URLs, or allowlist differ             | Use generator and one lowercase slug everywhere                                  |
| Missing resource error                              | Service has no matching resource entry                      | Add CPU/memory for every service including workstation                           |
| Unknown network/hostname                            | Typo in network, `depends_on`, or `exec_in`                 | Use declared network names and container hostnames exactly                       |
| Missing Dockerfile                                  | Build context plus Dockerfile path resolves incorrectly     | Keep both paths relative and inside lab directory                                |
| Image missing on x01                                | Source deployed without image rebuild or build failed       | Run `lab-source,lab-images`; inspect ppc64le/package failure                     |
| Service never healthy                               | Start command, config, permissions, or health command wrong | Test image logs; use native bounded health probe                                 |
| Shared config is read-only                          | UID/GID or setup permissions differ between containers      | Follow sample UID 1000/shared-volume pattern or use nested SSH                   |
| Nested SSH fails                                    | Admin user/password/helper missing or PTY capability issue  | Check `LAB_ADMIN_USER`, injected password, sudoers helper, `AUDIT_WRITE`         |
| Checker reports `unknown`                           | Output matched neither declared condition                   | Run exact command in `exec_in`, inspect token and client errors                  |
| Checker reports `error`                             | Command exited nonzero                                      | Handle expected failures explicitly; preserve nonzero for real diagnostic errors |
| Checker hangs                                       | Client command has no timeout                               | Add `timeout` or service-specific connect/read timeout                           |
| Fixed achieved by stopping service                  | Missing health/continuity guardrail                         | Add service-health and legitimate-use guardrails                                 |
| Stop/Start loses fix                                | Edited unmounted file or process-only state                 | Move config/data to named volume and test persistence                            |
| Reset remains fixed                                 | Baseline image/config or setup idempotency wrong            | Ensure Reset destroys volume and baseline source is vulnerable                   |
| Student guide validation fails                      | Missing/extra H2, official references, or hint ladder       | Match templates exactly and keep hints inside Remediate                          |
| Student guide leaks answer                          | Exact solution block/value copied                           | Rewrite as outcome, question, tool family, or progressive hint                   |
| MkDocs include missing                              | Generator not used or stub edited                           | Recreate exact one-line files under `docs/labs/`                                 |
| Student docs visible but instructor docs return 401 | Expected protection for student identity                    | Authenticate as instructor; do not weaken Nginx                                  |
| New lab absent from portal                          | x02 scenario source/cache not refreshed                     | Deploy `management.yml --tags docs` and verify scenario validates                |

## Final Release Checklist

### Concept and Safety

-   Scenario is research-grounded or clearly labeled enrichment.
-   Misconfiguration, impact, remediation, and legitimate behavior are precise.
-   No forbidden host/kernel/runtime-socket/privileged requirement exists.
-   All data, accounts, domains, keys, and credentials are synthetic.
-   Target package/image works on RHEL 9.6 `ppc64le`.

### Package

-   `labs/<lab-id>/scenario.yaml` exists and ID matches directory.
-   Sample service names/text/files have been replaced or deliberately retained.
-   Dockerfile extends shared service base where appropriate.
-   Baseline config and setup recreate vulnerable state deterministically.
-   Every service and workstation has explicit limits.
-   Vulnerable ports remain private unless safe publication is justified.

### Checker

-   At least one objective exists.
-   Every command is bounded and emits deterministic tokens.
-   Behavior, persistent state, legitimate use, and health are covered as needed.
-   Bidirectional docs/checker coverage matrix has no gaps.
-   Vulnerable, fixed, partial/regression, broken, and reset behavior is tested.

### Documentation

-   Solution notes are complete and student-CLI executable.
-   Instructor guide contains assessment/reveal/safety/feedback guidance, not copied solution.
-   Student guide was written last and passes anti-spoiler review; its Your Lab Environment and Your Mission sections carry all paths, access, and deliverables.
-   Scenario `title` and `story.situation` stay at anomaly level and name no defect/technique/fix.
-   Three MkDocs include files contain only exact snippet directives.
-   Student page is public; solution/instructor pages require instructor auth.

### Verification and Deployment

-   Scenario and checker-shell validators pass.
-   Python syntax passes for every lab Python file.
-   Full pre-commit passes without bypass.
-   All three Ansible syntax checks pass.
-   x01 lab source/images and x02 docs/metadata are deployed through Ansible.
-   `verify-platform.yml` passes.
-   Fresh live student-path pass, mutation/guardrail checks, and Reset pass.

Only then mark the lab ready and assign it to real teaching groups.

---

_[← Validate, Deploy, and Publish](06-validate-and-deploy.md) · [Guide overview](index.md)_
