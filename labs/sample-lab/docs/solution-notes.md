# Solution Notes: Sample Lab Access Control

## Root Cause

The sample records service starts with `ACCESS_CONTROL=disabled`. In that
state, the service returns seeded records to every client, even when the client
does not send an authorization token. The token itself is intentionally dummy
data and exists only to demonstrate that legitimate access must keep working
after hardening.

The runtime configuration is stored on the shared `sample_config` volume. A
portal reset destroys that volume and recreates this vulnerable baseline from
`config.vulnerable`.

## Investigation

Run these commands from the student workstation. First prove that records are
available without authorization and inspect only the synthetic data:

```bash
curl -i --max-time 5 http://sample-service:8080/records
```

Inspect the active configuration through the student-editable shared volume:

```bash
cat /lab/sample/config.env
```

Confirm the intended authorized path also works. The command reads the dummy
token from the lab configuration instead of embedding a hidden credential:

```bash
SAMPLE_TOKEN=$(sed -n 's/^AUTHORIZED_TOKEN=//p' /lab/sample/config.env)
curl -fsS --max-time 5 \
  -H "Authorization: Bearer ${SAMPLE_TOKEN}" \
  http://sample-service:8080/records
unset SAMPLE_TOKEN
```

## Remediation

### Step 1: Enable Access Control Persistently

From the student workstation, change the version stored on the shared volume:

```bash
sed -i 's/^ACCESS_CONTROL=disabled$/ACCESS_CONTROL=enabled/' \
  /lab/sample/config.env
```

This edits persistent lab state rather than an unmounted copy inside a process.

### Step 2: Validate and Reload the Service

The `sampleadmin` account uses the workstation/lab password shown on the
portal's Workstation Access page. Enter it at the hidden prompt. The narrow sudo
helper validates the configuration and reloads only the sample service:

```bash
read -rsp 'Lab password: ' LAB_PASSWORD; echo
timeout 15 sshpass -p "$LAB_PASSWORD" ssh \
  -o ConnectTimeout=5 \
  -o StrictHostKeyChecking=accept-new \
  sampleadmin@sample-service \
  'sudo /usr/local/sbin/reload-sample-service'
unset LAB_PASSWORD
```

## Verification

### Unauthorized Requests Are Rejected

Run from the student workstation:

```bash
test "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' \
  http://sample-service:8080/records)" = 401
```

### Authorized Requests Still Work

```bash
SAMPLE_TOKEN=$(sed -n 's/^AUTHORIZED_TOKEN=//p' /lab/sample/config.env)
curl -fsS --max-time 5 \
  -H "Authorization: Bearer ${SAMPLE_TOKEN}" \
  http://sample-service:8080/records \
  | grep -q 'sample-record-001'
unset SAMPLE_TOKEN
```

### Persistent Configuration Is Hardened

```bash
grep -qx 'ACCESS_CONTROL=enabled' /lab/sample/config.env
```

### Service Health Is Preserved

```bash
test "$(curl -fsS --max-time 5 \
  http://sample-service:8080/health)" = ok
```

The portal checker should now report all four criteria as passed and the
overall state as `fixed`.

## Design Rationale

This intentionally small lab models four outcomes useful across many security
scenarios:

1. Test the vulnerability through externally observable behavior.
2. Verify persistent configuration separately from current behavior.
3. Keep legitimate use working through a guardrail.
4. Keep service availability working through a second guardrail.

Future labs should replace every sample command and criterion with behavior
specific to their target service. They should preserve this bidirectional
alignment: every assessed remediation outcome needs a checker criterion, and
every checker criterion needs a documented learning or continuity purpose.
