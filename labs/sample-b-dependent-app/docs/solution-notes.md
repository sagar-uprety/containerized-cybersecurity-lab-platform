# Sample Dependent App - Solution Notes

Full answer key for the Pattern B authoring reference. Not served to students.

## Root Cause

The shared records backend ships with `ACCESS_CONTROL=disabled`, so it returns
records to any client without checking identity. A dependent application
(`records-app`) reads from the backend and, in the vulnerable baseline, needs no
credential to do so. Hardening the backend therefore has a side effect: the
dependent app must be given a valid credential or it stops working. That
side effect is the entire point of Pattern B.

Admin access: the `appadmin` account on each service container uses the
student's own lab password (from the portal Workstation Access page).

## Impact Demonstration

Context: student workstation.

```bash
# The backend hands over records with no credential at all.
curl -s http://records-backend:8080/records
```

Expected: HTTP 200 with `sample-record-001` / `sample-record-002` — an
unauthenticated read of the shared store.

## Canonical Remediation

Context: student workstation. Both config files are editable from the
workstation through shared volumes.

```bash
# 1. Enable access control on the shared backend (persistent lab config).
sed -i 's/^ACCESS_CONTROL=disabled/ACCESS_CONTROL=enabled/' /lab/backend/config.env

# 2. Give the dependent app the backend's credential so it keeps working.
sed -i 's/^BACKEND_TOKEN=$/BACKEND_TOKEN=sample-demo-token/' /lab/app/config.env
```

Context: `appadmin@records-backend` (reload the backend to re-read its config).

```bash
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new \
  appadmin@records-backend 'sudo /usr/local/sbin/reload-records-backend'
```

Context: `appadmin@records-app` (reload the app to re-read its config).

```bash
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new \
  appadmin@records-app 'sudo /usr/local/sbin/reload-records-app'
```

`$LAB_PASSWORD` is the student's own lab password; set it in the shell first
(`read -rs LAB_PASSWORD`). The reload helpers validate each config before
signalling only the intended process.

## Verification

Context: student workstation.

```bash
# Backend now rejects unauthenticated reads.
curl -s -o /dev/null -w '%{http_code}\n' http://records-backend:8080/records   # 401

# The dependent app still serves, because it now presents the token.
curl -s http://records-app:8080/summary                                        # records available: 2

# Both services healthy.
curl -s http://records-backend:8080/health   # ok
curl -s http://records-app:8080/health        # ok
```

Then **Run Check** in the portal → `fixed`: both objectives satisfied
(unauthenticated backend access blocked, backend config persisted) and both
guardrails green (app continuity, services healthy).

## Reset Behavior

Portal **Reset** destroys and recreates the containers and named volumes from
versioned source, restoring `ACCESS_CONTROL=disabled` and an empty
`BACKEND_TOKEN`. Config edits do not survive a reset (that is the vulnerable
baseline being restored), but they do survive an ordinary service restart
because the config lives on a named volume.

## Known Failure Modes

-   Student enables backend access control but forgets the app token → `app_continuity`
    guardrail fails (app gets 401 from backend). This is the intended teaching
    moment for Pattern B.
-   Student edits config but does not reload → the running process keeps the old
    config; the objective/guardrail reflect stale state until reload.
-   Student sets a `BACKEND_TOKEN` that does not match the backend's
    `AUTHORIZED_TOKEN` → app still gets 401. The values must match.
