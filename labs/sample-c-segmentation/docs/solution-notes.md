# Sample Segmented Service - Solution Notes

Full answer key for the Pattern C authoring reference. Not served to students.

## Root Cause

The edge proxy ships with `PROXY_MODE=open`, so it forwards every request path to
the internal backend - including the backend's internal-only endpoint
(`/internal/status`). Because the proxy is the only bridge between the external
and internal networks, that open forwarding punches a hole through the
segmentation: an external client reaches an internal-only path. The internal
backend itself is on the internal network only, so the workstation cannot reach
it directly - the exposure exists purely because the proxy forwards it.

Admin access: the `proxyadmin` account on the proxy uses the student's own lab
password (from the portal Workstation Access page).

## Impact Demonstration

Context: student workstation (external network).

```bash
# Public path is expected to work through the proxy.
curl -s http://edge-proxy:8080/public/records

# Internal-only path leaks through the open proxy.
curl -s http://edge-proxy:8080/internal/status

# The backend is not directly reachable from the workstation (segmentation):
curl -s --max-time 3 http://internal-backend:8080/health || echo "not directly reachable"
```

Expected: `/public/records` returns records; `/internal/status` returns the
`sample-demo-internal-marker` marker (the leak); the direct backend request fails.

## Canonical Remediation

Context: student workstation (proxy config is editable from the workstation).

```bash
# Restrict the proxy so it refuses to forward internal-only paths.
sed -i 's/^PROXY_MODE=open/PROXY_MODE=restricted/' /lab/proxy/config.env
```

Context: `proxyadmin@edge-proxy` (reload the proxy to re-read its config).

```bash
sshpass -p "$LAB_PASSWORD" ssh -o StrictHostKeyChecking=accept-new \
  proxyadmin@edge-proxy 'sudo /usr/local/sbin/reload-edge-proxy'
```

`$LAB_PASSWORD` is the student's own lab password; set it first
(`read -rs LAB_PASSWORD`).

## Verification

Context: student workstation.

```bash
# Internal path now refused at the proxy.
curl -s -o /dev/null -w '%{http_code}\n' http://edge-proxy:8080/internal/status   # 403

# Public path still works.
curl -s http://edge-proxy:8080/public/records | head -n 1                          # header line

# Backend still not directly reachable (segmentation intact).
curl -s --max-time 3 http://internal-backend:8080/health || echo "segmented"
```

Then **Run Check** in the portal → `fixed`: internal path blocked and restricted
mode persisted (objectives), public path works and segmentation intact
(guardrails).

## Reset Behavior

Portal **Reset** destroys and recreates containers and volumes from versioned
source, restoring `PROXY_MODE=open`. The edit survives an ordinary proxy reload
or restart (config on a named volume) but not a reset.

## Known Failure Modes

-   Student sets `PROXY_MODE=restricted` but does not reload → the running proxy
    keeps forwarding the internal path until reloaded.
-   Student tries to fix the backend instead of the proxy → the backend has no
    student-facing setting; the boundary is enforced at the proxy and the network
    topology. Redirect to the proxy configuration.
-   Student blocks the public path too → `public_path_works` guardrail fails; the
    restriction must target only internal paths.
