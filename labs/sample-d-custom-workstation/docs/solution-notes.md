# Sample Custom Workstation - Solution Notes

Full answer key for the Pattern D authoring reference. Not served to students.

## Root Cause

The records service ships with `ACCESS_CONTROL=disabled`, so it returns records
to any client without checking identity. The vulnerability and fix are identical
in spirit to the Pattern A sample lab; this lab exists to demonstrate the
**custom workstation** wiring (a lab-specific workstation image that adds the
HTTPie `http` client, built by `Dockerfile.workstation` and referenced in
`scenario.yaml` under `build.images` and `services.workstation.image`).

Admin access: the `recadmin` account uses the student's own lab password.

## Impact Demonstration

Context: student workstation. Either the base `curl` or the lab-added `http`
(HTTPie) client works.

```bash
# With curl:
curl -s http://records-service:8080/records

# With the lab-specific HTTPie client (added by the custom workstation image):
http --print=b GET http://records-service:8080/records
```

Expected: HTTP 200 with `sample-record-001` / `sample-record-002` - an
unauthenticated read.

## Canonical Remediation

Context: student workstation (config editable from the workstation).

```bash
sed -i 's/^ACCESS_CONTROL=disabled/ACCESS_CONTROL=enabled/' /lab/records/config.env
```

Context: `recadmin@records-service` (reload the service to re-read its config).

```bash
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new \
  recadmin@records-service 'sudo /usr/local/sbin/reload-records-service'
```

`$LAB_PASSWORD` is the student's own lab password; set it first
(`read -rs LAB_PASSWORD`).

## Verification

Context: student workstation.

```bash
# Unauthenticated read now refused.
curl -s -o /dev/null -w '%{http_code}\n' http://records-service:8080/records   # 401

# Authorized read still works (token from the config).
TOKEN=$(sed -n 's/^AUTHORIZED_TOKEN=//p' /lab/records/config.env)
http --print=b GET http://records-service:8080/records "Authorization: Bearer $TOKEN"

# Service healthy.
curl -s http://records-service:8080/health   # ok
```

Then **Run Check** in the portal → `fixed`: unauthenticated access blocked and
config persisted (objectives), authorized access and service health green
(guardrails).

## Reset Behavior

Portal **Reset** destroys and recreates containers and volumes from versioned
source, restoring `ACCESS_CONTROL=disabled`. Edits survive an ordinary restart
(config on a named volume) but not a reset.

## Known Failure Modes

-   Student edits config but does not reload → the running process keeps the old
    config until reloaded.
-   Student expects the base workstation to have HTTPie → it does not; the tool
    comes from this lab's custom workstation image. If `http` is missing, the
    workstation image was not built or not wired (`services.workstation.image`).
