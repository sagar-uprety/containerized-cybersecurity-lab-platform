# Before You Start

_[← Guide overview](index.md)_

## Before Writing Files

Write a one-page design worksheet first. If any row is unclear, the scenario is
not ready to implement.

| Decision             | Required answer                                                      |
| -------------------- | -------------------------------------------------------------------- |
| Security concept     | One precise misconfiguration students must reason about              |
| Target misconception | Incorrect belief the lab should correct                              |
| Vulnerable behavior  | Observable action proving initial state is unsafe                    |
| Fixed behavior       | Observable action proving required control is effective              |
| Legitimate behavior  | What must still work after remediation                               |
| Persistence          | Which file/data must survive reload or Stop/Start                    |
| Reset source         | Which versioned artifact recreates vulnerable baseline               |
| Student path         | Shared-volume edit, nested SSH administration, or both               |
| Containers           | Workstation plus each target/dependent/middlebox service             |
| Networks             | Which containers may communicate and why                             |
| Seed data            | Clearly synthetic data sufficient to prove impact                    |
| Objective checks     | One criterion per assessed security outcome                          |
| Guardrail checks     | Service health and required legitimate behavior                      |
| Official references  | Current vendor/protocol docs for discovery and remediation           |
| Platform fit         | `ppc64le`, Podman, package/image availability, no forbidden boundary |

Research official documentation before implementation. Verify current
configuration syntax, reload behavior, package availability, and recommended
hardening. Do not trust old blog posts for security-sensitive directives.

## Quick Start: Clone the Runnable Sample

Run from repository root. Use a lowercase hyphenated ID no longer than 64
characters.

```bash
python3 tools/create_lab.py ftp-anonymous-access \
  --title "Unexpected Access to a File Transfer Service" \
  --difficulty beginner
```

Allowed difficulty values are `beginner`, `intermediate`, and `advanced`.

The command:

-   refuses invalid IDs and existing paths
-   copies runnable files from `labs/sample-a-standalone/` and omits its sample-only `AUTHORING.md`
-   replaces `sample-a-standalone` in scenario, image, allowlist, docs, and author notes
-   updates title and difficulty
-   creates student, solution, and instructor MkDocs include pages
-   leaves a schema-valid runnable clone of the sample behavior

Generated structure:

```text
labs/ftp-anonymous-access/
|-- scenario.yaml
|-- Dockerfile
|-- config.vulnerable
|-- seed.txt
|-- setup-sample.sh
|-- reload-sample-service.sh
|-- sample-service.py
`-- docs/
    |-- student-guide.md
    |-- instructor-guide.md
    `-- solution-notes.md

docs/labs/
|-- ftp-anonymous-access.md
|-- ftp-anonymous-access-solution.md
`-- ftp-anonymous-access-instructor.md
```

The clone is not finished. It is a known-good baseline that should remain
runnable while sample behavior is replaced. Delete or rename sample files only
after removing all matching references from Dockerfile and `scenario.yaml`.

**The rename is a literal substring replacement of `sample-a-standalone` only** - it
does not touch every sample-prefixed identifier. After cloning, `scenario.yaml`
still contains `sample-service`, `sample-net`, `sample_config`/`sample_data`,
`SAMPLE_SERVICE_HOST`/`SAMPLE_SERVICE_PORT`, and `sampleadmin`; the student
guide's **Your Lab Environment** section still says `/lab/sample` in its paths
list. None of these contain the literal string `sample-a-standalone`, so the generator
leaves them for you. Work
through `labs/sample-a-standalone/docs/AUTHORING.md`'s file map deliberately, service
name by service name, rather than assuming the generator caught everything.

## Learn the Sample Before Replacing It

`sample-a-standalone` is a real catalog scenario, not inert pseudocode. It demonstrates:

-   one target service and the auto-generated workstation
-   one explicit private network
-   a commented optional safe application-endpoint pattern
-   a vulnerable baseline config copied into a named volume
-   synthetic seed data initialized once
-   a shared student-editable config volume
-   a service-local admin account using the student's lab password
-   a single narrow sudo reload helper
-   behavior and persistence objectives
-   authorized-use and health guardrails
-   complete student, instructor, and solution boundaries

Read `labs/sample-a-standalone/docs/AUTHORING.md` side-by-side with every sample file.
Run the sample once after deployment before using it as a template. Seeing its
vulnerable, fixed, broken, and reset behavior makes later checker design easier.

---

_[← Guide overview](index.md) · [Next: Choose a Topology Pattern →](02-topology-patterns.md)_
