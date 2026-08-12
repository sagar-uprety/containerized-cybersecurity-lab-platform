# Network Segmentation and Boundary Control (Pattern C Reference)

You are auditing an internal service that sits behind an edge proxy on a separate
network. Nobody has checked whether the proxy keeps the internal-only parts of
that service away from the outside. Determine what the proxy actually exposes,
correct it using only synthetic data, and keep the intended public traffic
flowing.

<!-- AUTHORING NOTE (sample lab only): this is the runnable reference for
Pattern C (Proxy / Firewall / Segmentation), using an application-layer proxy so
it needs no special capabilities. The firewall lab is the packet-filter variant.
Follows every reveal-tier rule in STUDENT_GUIDE_TEMPLATE.md. -->

## Why This Matters

A network boundary is only as good as the component that enforces it. Firewalls
and proxies "provide a false sense of security" when a single permissive rule
lets traffic across that should have been stopped - the first Internet-wide study
of hosts behind misconfigured boundary controls found millions of services
reachable purely because a boundary did not hold as intended (Deng et al., IEEE
S&P 2025). A proxy that forwards more than it should is the application-layer
version of the same mistake: the internal service was never meant to be reachable
from outside, and the boundary quietly let it through.

The habit this lab builds is verifying a boundary from the outside, rather than
assuming that "it is behind the proxy" means "it is protected".

## Objectives

By the end of this lab you should be able to:

-   Distinguish what a network makes reachable from what a boundary control chooses to forward
-   Demonstrate that an internal-only path is exposed across a boundary through a middlebox
-   Restrict a boundary control so an internal path is refused while public traffic still passes
-   Confirm that the internal service remains unreachable directly, independent of the proxy rule
-   Verify a boundary from the untrusted side rather than trusting its configuration

## Prerequisites

Before starting this lab, you should be familiar with:

-   Basic TCP/IP networking (hosts, ports, and the idea of separate networks)
-   What a reverse proxy or middlebox does between two networks
-   Editing Linux configuration files and applying service changes

If you need to review these topics, see:

-   Reverse proxy concept: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Proxy_servers_and_tunneling>
-   Network segmentation (NIST glossary): <https://csrc.nist.gov/glossary/term/network_segmentation>
-   HTTP status codes (401/403): <https://developer.mozilla.org/en-US/docs/Web/HTTP/Status>

## Your Lab Environment

Your browser terminal starts on the **workstation**, which is on the **external**
network. An **edge proxy** (`edge-proxy`) bridges the external network and an
**internal** network. An **internal backend** (`internal-backend`) sits on the
internal network only. Because of that topology, your workstation can reach the
proxy but not the backend directly - every request to the backend goes through
the proxy.

Paths and access you will need:

-   `/lab/proxy/config.env` - the edge proxy's configuration, editable from the workstation
-   **Proxy admin account** - to reload the proxy after editing its config, log in over SSH as the `proxyadmin` account on `edge-proxy`. The SSH password is your own workstation/lab login password from the portal's Workstation Access page. That account can run only a narrow reload helper.

The proxy serves two kinds of path: a public one intended for outside clients,
and an internal-only one that should never cross the boundary.

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any
time. **Reset** restores the original vulnerable baseline, so it is not a way to
reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on
the portal's Workstation Access page.

## Your Mission

1. Map what is reachable from the workstation, and establish that the backend is only reachable through the proxy.
2. Establish which request paths the proxy forwards, and which of them should never have crossed the boundary.
3. Bring the proxy to a state where the internal-only path is refused, using only synthetic data.
4. Keep the intended public path working through the proxy.
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before changing anything, understand the environment and confirm the problem is
real.

**Guiding questions:**

-   What answers on the external network, and can you reach the internal backend directly?
-   Which request paths does the proxy forward to the backend? Do any of them return data that was clearly meant to stay internal?
-   What is the difference between the backend being unreachable directly and the proxy choosing not to forward a path?

HTTP clients and standard networking tools are on the workstation. Command shapes
to start from:

```bash
curl -s http://<proxy-host>:<port>/<path>
curl -s --max-time 3 http://<backend-host>:<port>/health
```

Try more than one path through the proxy, and try reaching the backend directly.

**Proving impact:** Show that a path which should stay internal is reachable from
the external network through the proxy - and, separately, that the backend cannot
be reached directly. Together those establish that the exposure comes from the
proxy's forwarding, not from a missing network boundary.

## Remediate

Now restrict the boundary control.

**Goal:** When you are done: a request for the internal-only path is refused at
the proxy from the external network; the public path still works through the
proxy; the backend remains unreachable directly; and the change survives a proxy
reload.

**Constraints:** The public path must keep working - a fix that blocks everything
has not met the goal. The change must be written to the persistent lab
configuration and reloaded, not applied only to a running process.

**Where to work:** The proxy config is at `/lab/proxy/config.env`, editable from
the workstation. Reloading the proxy requires the `proxyadmin` SSH account (see
Your Lab Environment). The backend has no student-facing setting - the boundary
is enforced at the proxy. The portal's **Reset** action restores the vulnerable
baseline, so it is not the right tool for reloading a fix.

**References:**

-   Reverse proxy concept: <https://developer.mozilla.org/en-US/docs/Web/HTTP/Proxy_servers_and_tunneling>
-   Network segmentation (NIST glossary): <https://csrc.nist.gov/glossary/term/network_segmentation>
-   Local: the proxy's configuration file comments and its narrow reload helper

**If you're stuck:**

-   The boundary is decided by the one component that sits on both networks. Which component is that, and what does its configuration let across?
-   You do not need to change the network or the backend. You need the boundary control to treat internal and public paths differently.
-   Look at the proxy's configuration file: it has a mode that governs which paths it will forward. Set it so internal paths are refused, then reload.

## Verify

After applying your fix, confirm each of the following:

1. A request for the internal-only path is refused at the proxy
2. The public path still works through the proxy
3. The backend is still not reachable directly from the workstation

Use the same tools from your investigation to re-check each one. When satisfied,
click **Run Check** in the portal.

## Real-World Context

This sample is the application-layer version of a boundary that does not hold.
Deng et al. scanned the entire IPv4 space and found nearly 2.5 million services
reachable only because a boundary control - usually a firewall - was
misconfigured, and observed that such controls "provide a false sense of
security" precisely because the boundary looks present while quietly forwarding
what it should block. A reverse proxy that forwards an internal admin path is the
same failure one layer up the stack: the topology is correct (the backend is not
directly reachable), but the middlebox's policy undoes it.

The lesson to carry away is that segmentation is two things working together -
the network topology _and_ the middlebox's policy - and both must be verified
from the untrusted side. Testing only from inside, or only reading the config,
would have missed this. In the lab catalog, the packet-filter version of this
pattern is the firewall lab, where the boundary is enforced by iptables rules
instead of a proxy.

What would catch this earlier in production: testing every boundary from the
external side as part of deployment, enumerating which paths a proxy actually
forwards rather than assuming, and treating "an internal-only path answered from
outside" as a finding.

**Sources:**

-   Deng, Q., Pu, J., Tan, Z., Qian, Z., & Krishnamurthy, S. V. (2025). Beyond the Horizon: Uncovering Hosts and Services Behind Misconfigured Firewalls. IEEE S&P 2025. <https://doi.org/10.1109/SP61157.2025.00164>
-   NIST glossary: Network Segmentation. <https://csrc.nist.gov/glossary/term/network_segmentation>

---

_When you're done, end the lab through the portal and complete the feedback form.
Take a moment to reflect on what you learned: what surprised you, what you would
do differently, and how this applies beyond this sample service._
