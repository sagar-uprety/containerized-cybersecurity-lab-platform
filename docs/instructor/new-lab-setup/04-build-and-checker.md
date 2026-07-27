# Build the Image and Design the Checker

_[← Author `scenario.yaml`](03-scenario-yaml.md) · [Guide overview](index.md)_

## Build the Target Image

Start vulnerable service images with:

```dockerfile
FROM thesis-labs/lab-service-base:1.0
```

Then:

1. Install only required packages.
2. Remove package-manager caches.
3. Create a service-admin user only if student remote administration needs it.
4. Grant one narrow sudo helper rather than unrestricted sudo.
5. Copy baseline config, seed, setup hook, and service scripts from the lab root.
6. Document only internal ports with `EXPOSE`.
7. Keep secrets synthetic and clearly marked.

The deployment host is RHEL 9.6 `ppc64le`. Verify package repositories, base
image manifests, downloaded binaries, and source builds support that
architecture. Do not assume an `amd64`-only release archive will work.

When teaching an exact vulnerable version, pin and verify it. If source is
downloaded during build, use an authoritative URL and checksum. Current
production advice in docs must still recommend a supported release, not merely
the historical first patched version.

## Create Baseline, Seed, and Setup Artifacts

### Vulnerable Configuration

`config.vulnerable` must contain the complete state Reset restores. Comments may
identify intentional teaching risk for authors, but student-facing files must
not hand out the remediation.

### Seed Data

Seed only enough fake data to prove impact. Use obviously synthetic names,
domains, tokens, hashes, addresses, and records. Add deterministic setup so
repeated starts do not duplicate or corrupt state.

### Setup Hook

Use an idempotent POSIX shell hook when generic entrypoint variables are not
enough. Typical work:

-   initialize data on first boot
-   generate lab-local keys/certificates
-   create target users/groups
-   expose a student-readable credential/path file
-   prepare logs and permissions

Do not put required manual VM commands in the guide. Convert them to image,
setup, scenario, Ansible, or documentation source.

### Student Discoverability

Every credential and path used by `solution-notes.md` must be available to a
student through one of these:

-   portal Workstation Access page
-   `SITREP.txt`
-   a student-readable file inside the lab
-   a value discoverable from target configuration or service behavior

Operator-only knowledge is not a valid solution dependency.

## Design the Checker

The checker is assessment and operational evidence, not proof of conceptual
mastery. It should observe technical outcomes accurately and explain failures.

### State Model

Authors declare conditions only for `vulnerable` and `fixed` per criterion.
labctl synthesizes:

| Observed state | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| `vulnerable`   | Criterion matched vulnerable condition                         |
| `fixed`        | Criterion matched fixed condition                              |
| `unknown`      | Command exited zero but matched neither, or a guardrail failed |
| `error`        | Command exited nonzero or checker execution failed             |
| `partial`      | Overall objectives contain a mix of vulnerable and fixed       |

Overall fixed requires all objectives fixed and all guardrails passing.

### Objective Versus Guardrail

Use `objective` for a state students must change. Use `guardrail` for behavior
that must remain healthy before and after the fix.

Good objective examples:

-   unauthenticated access blocked
-   weak account locked
-   overbroad network trust removed
-   persistent config uses secure directive
-   restricted principal cannot perform forbidden write

Good guardrail examples:

-   authorized read still works
-   key-based SSH still works
-   dependent app remains healthy
-   target service remains reachable
-   forwarding path remains valid

### Condition Operators

Each command emits deterministic output and each state uses one implemented
condition:

| Operator                | Match                                 |
| ----------------------- | ------------------------------------- |
| `output_contains: text` | Text occurs in combined stdout/stderr |
| `output_eq: text`       | Trimmed stdout equals text            |
| `output_ne: text`       | Trimmed stdout differs from text      |
| `exit_code: n`          | Process exit equals integer           |
| `exit_code_ne: n`       | Process exit differs from integer     |

Prefer `output_eq` with short tokens. A shell expression returning status alone
can use exit-code conditions, but output tokens produce clearer evidence.

`sample-lab`'s checks all emit a token from an HTTP response. Other
vulnerability classes need their own token-emitting pattern; for example, a
file-permission or ownership check reads the mode bits and maps them to a
token instead of matching response text:

```bash
mode=$(stat -c '%a' /var/lib/target-service/data.log 2>/dev/null);
if [ "$mode" = 666 ] || [ "$mode" = 664 ]; then echo TARGET_WORLD_WRITABLE;
elif [ "$mode" = 640 ] || [ "$mode" = 600 ]; then echo TARGET_PERMISSIONS_HARDENED;
else echo TARGET_PERMISSIONS_UNKNOWN; fi
```

The shape is the same regardless of vulnerability class: read one fact
deterministically, map every expected value to a token, and emit a distinct
unmatched token for anything else. Adapt the fact-gathering command (`stat`,
`getfacl`, a config grep, a client request) to what your scenario actually
needs to prove; the token-and-`output_eq` pattern stays constant.

### Checker Command Rules

-   Run from `workstation` when testing student/attacker-visible behavior.
-   Run inside target only for configuration/runtime facts unavailable externally.
-   Bound every network or potentially blocking command.
-   Use `2>&1` deliberately when parsing client errors.
-   Emit a third unmatched token for ambiguous service responses.
-   Avoid changing state; if a write proves permissions, remove test data afterward.
-   Do not classify service-down behavior as successful hardening.
-   Increment checker version when criterion meaning or implementation changes.

### Bidirectional Coverage Matrix

Build this before writing the student guide:

| Criterion | Kind                | Student remediation goal | Instructor assessment | Solution outcome   | Regression test  |
| --------- | ------------------- | ------------------------ | --------------------- | ------------------ | ---------------- |
| `<name>`  | objective/guardrail | `<documented outcome>`   | `<evidence>`          | `<command result>` | `<one mutation>` |

Two checks are mandatory:

1. Every checker criterion maps to a documented goal, assessment, and solution outcome.
2. Every assessed security/continuity outcome maps back to a checker criterion.

Missing either direction is a blocking design bug.

---

_[← Author `scenario.yaml`](03-scenario-yaml.md) · [Guide overview](index.md) · [Next: Write Documentation and Declare Risk →](05-documentation.md)_
