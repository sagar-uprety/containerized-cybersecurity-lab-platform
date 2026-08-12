# Write Documentation and Declare Risk

_[← Build the Image and Design the Checker](04-build-and-checker.md) · [Guide overview](index.md)_

## Write Documentation in Safe Order

Write documentation in this order so the student guide can be checked against a
complete answer key:

1. `docs/solution-notes.md`
2. `docs/instructor-guide.md`
3. `docs/student-guide.md`

> **SITREP.txt is retired.** Earlier labs shipped a `docs/SITREP.txt` mission
> brief mounted into the workstation. It over-specified the task and leaked fix
> direction, so it was removed. Its content — topology, paths, access, and the
> mission deliverables — now lives always-visibly in the student guide's
> **Your Lab Environment** and **Your Mission** sections. Do not create a new
> SITREP.txt; the scenario validator rejects it.

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

### Student Guide

Write last. It is guided discovery, not a walkthrough. It follows
`STUDENT_GUIDE_TEMPLATE.md` and its reveal tiers. It should provide:

-   natural scenario narrative (no defect name in the title or intro)
-   a **Why This Matters** paragraph with measured scale and a citation
-   measurable, lab-specific outcomes (sourced from the scenario selection report)
-   concrete prerequisites and official references
-   a **Your Lab Environment** section carrying topology, every path, and access
    (this is where the retired SITREP's facts now live — omitting a path strands
    the student)
-   a **Your Mission** section stating deliverables as outcomes, never steps
-   guiding investigation questions
-   diagnostic command shapes with placeholders, never target-bound values
-   impact students must prove
-   remediation goal stated as an observable end state, and constraints — not config lines
-   three progressive hints without exact values
-   a **Verify** section that mirrors the goal's clauses and adds none
-   a **Real-World Context** debrief with figures, citations, and prevention
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
