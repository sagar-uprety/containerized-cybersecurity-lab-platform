# Write Documentation and Declare Risk

_[← Build the Image and Design the Checker](04-build-and-checker.md) · [Guide overview](index.md)_

## Write Documentation in Safe Order

Write documentation in this order so the student guide can be checked against a
complete answer key:

1. `docs/solution-notes.md`
2. `docs/instructor-guide.md`
3. `docs/SITREP.txt`
4. `docs/student-guide.md`

### Solution Notes

This is the sole answer key. Every ordinary `bash` block must run through the
student CLI path from its stated context. Include:

-   root cause
-   exact impact demonstration
-   exact persistent remediation
-   every workstation-to-service SSH transition
-   hidden password prompts using the portal-provided lab password
-   service validation/reload behavior
-   expected failures/disconnects and postconditions
-   exact verification matching checker outcomes
-   design rationale

Never include operator `labctl`, Podman, Ansible, x01 filesystem, or hidden
solver shortcuts.

### Instructor Guide

Use only template-defined level-2 sections. Include measurable objectives,
phase evidence, progressive reveal policy, common mistakes with interventions,
all checker states, feedback interpretation, and teaching notes. Link to
solution notes rather than copying commands.

### SITREP

Keep it brief: situation, numbered mission, useful student paths, browser guide
URL, credential source when needed, and SSH fallback. Do not include exact fix,
directive, secret, or command sequence.

### Student Guide

Write last. It is guided discovery, not a walkthrough. It may contain exactly
one standard command: `cat ~/SITREP.txt`. Otherwise it should provide:

-   natural scenario narrative
-   measurable outcomes
-   concrete prerequisites and official references
-   guiding investigation questions
-   tool families, not exact commands/flags
-   impact students must prove
-   remediation goal and constraints, not config lines
-   three progressive hints without exact values
-   verification outcomes and portal Run Check
-   feedback/reflection reminder

Compare it directly with solution notes. Remove copied commands, exact
credentials, exact config values, and restart sequences.

### MkDocs Include Pages

The generator creates three one-line files. They must contain only their exact
snippet include. MkDocs 1.6 discovers student pages automatically; solution and
instructor pages build but are excluded from navigation and protected by Nginx.
No manual navigation edit is needed.

## Document Intentional Risk

Every real lab needs `intentional-risk-allowlist.yaml`. Each finding includes:

-   stable slug ID
-   scanner/tool name
-   exact files
-   exact rule or literal pattern
-   at least 20 characters explaining why risk is required for teaching

The allowlist documents a narrow, deliberate finding. It is not a broad scanner
exclusion. Dummy credentials must visibly look fake/demo/example/lab-only.

---

_[← Build the Image and Design the Checker](04-build-and-checker.md) · [Guide overview](index.md) · [Next: Validate, Deploy, and Publish →](06-validate-and-deploy.md)_
