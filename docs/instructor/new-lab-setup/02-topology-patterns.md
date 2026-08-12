# Choose a Topology Pattern

_[← Before You Start](01-before-you-start.md) · [Guide overview](index.md)_

Every lab on this platform is built from the same parts — an auto-generated
student **workstation**, one or more **target containers**, one or more private
**networks**, and a **checker**. A "topology pattern" is just a recurring way of
wiring those parts together. There are four, and between them they cover every
scenario shape the platform supports. Each has a runnable, heavily-commented
**sample lab** you clone as a starting point.

| Pattern                                 | What it is                                                       | Clone this sample                  | Real catalog example                                 |
| --------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| **A — Standalone service**              | Workstation and one target                                       | `labs/sample-a-standalone`         | ssh-weak-config, ldap-anonymous-bind, smb-open-share |
| **B — Service with dependent app**      | A shared service another app relies on                           | `labs/sample-b-dependent-app`      | redis-exposed                                        |
| **C — Proxy / firewall / segmentation** | A middlebox enforcing a boundary between two networks            | `labs/sample-c-segmentation`       | firewall-source-port-bypass                          |
| **D — Custom workstation**              | Any of the above, but the workstation needs an extra client tool | `labs/sample-d-custom-workstation` | (modifier; layers on A/B/C)                          |

Read this page before you write `scenario.yaml`. Picking the wrong pattern is the
most common reason a lab fights the platform later.

## First, what "service" and "standalone" mean here

**A "service" is whatever the student hardens** — the target. It does **not**
have to be a third-party daemon. Two things count equally as the target:

-   **A third-party service:** OpenSSH, OpenLDAP, Redis, Postfix, Samba, Apache —
    a packaged daemon with its own config file and reload mechanism.
-   **Native Linux configuration:** the firewall (iptables/nftables), file
    permissions and ownership, PAM/account policy, a systemd unit, sysctl-style
    settings exposed to the container. There is no third-party product here — the
    "service" is the operating system's own configuration. The firewall lab is
    exactly this: its target is `iptables` rules, not an installed application.

So when this guide says "standalone service," read it as **"a single target
container the student works on,"** whether the weakness lives in an installed
daemon's config or in native Linux settings. The word "service" is about _what
gets hardened_, not about whether a vendor shipped it.

**"Standalone" (Pattern A)** then means exactly one target: the student's
workstation talks to one target container, and nothing else depends on it. Most
labs are this shape. You reach for B, C, or D only when the scenario genuinely
needs a second moving part.

## One image per distinct service

Before the patterns, one structural rule that decides how many Dockerfiles you
write: **each distinct service role gets its own image, built from its own
Dockerfile.** A lab with two different services (a backend and an app; a proxy
and a target) builds two images and lists both under `build.images`. This is how
the real multi-service labs are built:

-   `redis-exposed` builds a redis image (`Dockerfile`) **and** a demo-app image
    (`demo-app/Dockerfile`).
-   `firewall-source-port-bypass` builds a firewall image (`Dockerfile.firewall`)
    **and** an internal-server image (`Dockerfile.server`).

The Pattern B and C samples follow the same convention: `sample-b-dependent-app`
ships `Dockerfile.backend` + `Dockerfile.app`, and `sample-c-segmentation` ships
`Dockerfile.proxy` + `Dockerfile.backend`. Pattern A needs only one Dockerfile;
Pattern D adds a second Dockerfile for the workstation image (see below).

Give each running container a **distinct service key** in `scenario.yaml`, even
if two containers happen to share an image, because runtime container names are
derived from the service key.

---

## Pattern A: Standalone Service

**Shape:**

```text
workstation --> target service
```

**What it is.** The workstation and a single target on one private network. The
student investigates the target, changes something on it, and verifies. Nothing
else depends on the target, so there is no continuity constraint beyond "the
target itself still works."

**When to use it.** This is the default, and the right choice for the large
majority of scenarios: SSH hardening, LDAP access control, an open SMB share, an
open SMTP relay, an unpatched web server, a database with weak auth — and equally
for native-Linux-config labs where the "target" is file permissions or an
account policy rather than a third-party daemon.

**What the sample shows.** `labs/sample-a-standalone` is a tiny HTTP records
service with an access-control weakness in a config file. It demonstrates: one
target image, one implicit private network, a config volume the student edits
from the workstation, a service-local admin account using the student's lab
password, a single narrow sudo reload helper, and objective + guardrail checks.
Clone it and replace the service with your real target — third-party daemon or
native Linux configuration.

**Typically needed:** one custom target image; one private network (the implicit
default is enough); an optional shared configuration volume; the target port kept
private to the student network; no `app_port_base`.

## Pattern B: Service With Dependent Application

**Shape:**

```text
workstation --> target service <-- dependent app
workstation --------------------> dependent app
```

**What it is.** A shared service that a second application genuinely depends on.
The security work is on the shared service, but hardening it has a side effect:
the dependent app must keep working. That coupling — _harden the shared service
without breaking its consumer_ — is the entire reason to choose Pattern B over A.

**When to use it.** Only when the continuity of a real dependent service is part
of the lesson: an application sitting in front of a database or cache, where
turning on authentication on the store means the app must now present a
credential too. **Do not invent a demo app for every lab.** An extra service you
do not teach with is pure cost — more build time, more failure modes, more for
the student to hold in their head. If the lesson is fully expressed by Pattern A,
use Pattern A.

**What the sample shows.** `labs/sample-b-dependent-app` builds **two images**
(`Dockerfile.backend`, `Dockerfile.app`): a shared records backend and an app
that reads from it. The backend starts with access control off; the fix turns it
on **and** requires reconfiguring the app with the backend's credential. A
`guardrail` check (`app_continuity`) only passes when the app still returns data,
so a student who hardens the backend and forgets the app does **not** get a green
check. That guardrail is how Pattern B encodes "don't break the dependents."

**Design note.** Add guardrails that prove the dependent app remains healthy both
before and after the fix. The real catalog example is `redis-exposed`, where an
order application depends on an unauthenticated Redis instance.

## Pattern C: Proxy, Firewall, or Segmentation

**Shape:**

```text
workstation -- external net --> middlebox -- internal net --> target
```

**What it is.** Two networks separated by a middlebox — a proxy, a firewall, or a
router. The target sits on the _internal_ network only, so the workstation cannot
reach it directly; every packet goes through the middlebox. The lesson is that a
boundary is only as good as the middlebox's policy, and that the boundary must be
verified **from the untrusted (external) side**.

**When to use it.** Any scenario about a network boundary: a firewall rule that
admits traffic it should block, a reverse proxy that forwards a path it should
not, network segmentation that does not hold. The defining feature is the
two-network topology with a middlebox bridging them.

**Two flavours, both Pattern C.**

-   **Packet-filter (native Linux):** the middlebox enforces the boundary with
    `iptables`/`nftables`. This needs the `NET_ADMIN` capability. The real catalog
    example is `firewall-source-port-bypass`.
-   **Application-layer:** the middlebox is a reverse proxy that decides which
    request paths to forward. No special capability required. This is what the
    sample uses, so you can study the topology without the firewall machinery.

**What the sample shows.** `labs/sample-c-segmentation` builds **two images**
(`Dockerfile.proxy`, `Dockerfile.backend`): an edge proxy on both networks and an
internal backend on the internal network only. In the vulnerable baseline the
proxy forwards an internal-only path to the outside; the fix restricts it. A
`segmentation_intact` guardrail confirms the backend is unreachable directly in
both states, teaching that segmentation is the topology **and** the middlebox
policy together — neither alone is enough.

**Wiring rules that bite.** List the workstation-facing (external) network
**first** — labctl attaches the workstation to the first declared network. Attach
the middlebox to **both** networks and the internal target to the internal
network **only**. For richer segmentation (several clients, servers, middleboxes),
give each its own uniquely named service key. Add only the capability the lesson
needs — commonly `NET_ADMIN` for an in-container firewall, and nothing for an
application-layer proxy.

## Pattern D: Custom Workstation

**Shape:** any of A / B / C, with a lab-specific workstation image.

**What it is.** Not a topology of its own — a **modifier** you layer on another
pattern. The shared workstation base already ships the common Linux security
clients (curl, nmap, ldap-utils, smbclient, redis-tools, swaks, a MySQL client,
and more). When a single lab needs a client the base does **not** have, you build
a lab-specific workstation image that adds it, instead of bloating the global
image every lab pays for.

**When to use it.** Only when your investigation genuinely needs a tool absent
from the base workstation. If curl and the standard clients cover it, you do not
need Pattern D.

**What the sample shows.** `labs/sample-d-custom-workstation` is a Pattern A
service (the same records target) whose **workstation** is a custom image. It
ships **two Dockerfiles**: `Dockerfile` for the target service and
`Dockerfile.workstation` for the workstation, which extends
`thesis-labs/workstation-base` and adds the HTTPie `http` client. The wiring is
the point: list the workstation image under `build.images` with
`service: workstation`, and set `services.workstation.image` to it. labctl then
builds and runs your image as the auto-generated workstation. Replace HTTPie with
whatever single tool your lab actually needs.

---

## Do these four cover everything?

Yes — deliberately. The platform's degrees of freedom are: how many target images
you build, how many private networks you declare, how many containers you run,
and whether the workstation needs extra tooling. The four patterns are the
canonical points in that space:

-   **A** — one target, one network.
-   **B** — multiple targets on one network with a dependency between them.
-   **C** — multiple targets across multiple networks with a middlebox between them.
-   **D** — any of the above, with a lab-specific workstation image.

Anything more elaborate (several clients and servers behind a firewall, a
multi-tier segmented network) is a **larger instance of C** — more uniquely-named
service keys and networks, same shape. There is no supported scenario that falls
outside these four. What the platform intentionally does **not** do — privileged
containers, host networking, kernel modules, real data, an LMS/CTF engine — is
covered in [Before You Start](01-before-you-start.md) and the platform-fit
section of the [guide overview](index.md); those limits are about safety and
reproducibility, not about topology.

---

_[← Before You Start](01-before-you-start.md) · [Guide overview](index.md) · [Next: Author `scenario.yaml` →](03-scenario-yaml.md)_
