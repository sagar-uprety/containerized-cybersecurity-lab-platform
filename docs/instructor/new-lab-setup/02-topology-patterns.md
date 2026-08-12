# Choose a Topology Pattern

_[← Before You Start](01-before-you-start.md) · [Guide overview](index.md)_

The platform supports four topology patterns, and each has a runnable,
heavily-commented **sample lab** you can clone as a starting point. Pick the
pattern that matches your scenario, copy its sample, and replace the
sample-specific content:

| Pattern                             | Clone this sample                | Real catalog example                                 |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------- |
| A — Standalone service              | `labs/sample-lab`                | ssh-weak-config, ldap-anonymous-bind, smb-open-share |
| B — Service with dependent app      | `labs/sample-dependent-app`      | redis-exposed                                        |
| C — Proxy / firewall / segmentation | `labs/sample-segmentation`       | firewall-source-port-bypass                          |
| D — Custom workstation              | `labs/sample-custom-workstation` | (modifier; applies on top of A/B/C)                  |

The four patterns cover every scenario type the platform supports: one service
container, multiple service containers with an app-continuity dependency, a
multi-network middlebox, and a lab-specific workstation image. Pattern D is a
modifier you can layer on any of the others when a lab needs a client tool the
shared workstation base lacks.

## Pattern A: Standalone Service

Use for SSH, LDAP, FTP, SMB, SNMP, SMTP, DNS, banner, and many database labs.
Runnable sample: `labs/sample-lab`.

```text
workstation --> target service
```

Usually needed:

-   one custom target image
-   one private network (implicit default is enough)
-   optional shared configuration volume
-   target port exposed only inside the student network
-   no `app_port_base`

## Pattern B: Service With Dependent Application

Use only when continuity of an actual dependent service is pedagogically
important, such as an application using a database/cache. Runnable sample:
`labs/sample-dependent-app`.

```text
workstation --> target service <-- dependent app
workstation --------------------> dependent app
```

Add guardrails proving the dependent app remains healthy after hardening. Do
not invent a demo app for every lab; unnecessary services increase build time,
failure modes, and student cognitive load. The sample carries two services from
one image (each container selects its script and config through `LAB_*`
variables) and a continuity guardrail that only passes when the dependent app is
reconfigured to work with the hardened service.

## Pattern C: Proxy, Firewall, or Segmentation

Runnable sample: `labs/sample-segmentation` (application-layer proxy, no extra
capabilities). The firewall lab is the packet-filter variant (iptables +
`NET_ADMIN`).

```text
workstation -- external net --> middlebox -- internal net --> target
```

Declare networks explicitly. List the workstation-facing network first because
labctl attaches the workstation to the first declared network. Attach the
middlebox to both networks, and the internal target to the internal network
only, so the workstation cannot reach it directly. Add only the capability
required by the lesson, commonly `NET_ADMIN` for an in-container firewall (the
segmentation sample needs none because it segments at the application layer).

For more complex segmentation, add uniquely named service keys for each client,
server, and middlebox. Even if two containers use the same image, each instance
must have a distinct service key because runtime container names derive from
that key.

## Pattern D: Custom Workstation

The shared workstation image already includes common Linux security clients.
If a future lab needs another client, extend `thesis-labs/workstation-base` in a
lab-specific Dockerfile, add that image under `build.images`, and set
`services.workstation.image` to it. Do not modify the global workstation image
for a tool needed by only one lab. Runnable sample:
`labs/sample-custom-workstation` (adds the HTTPie `http` client on top of the
base and wires it through `build.images` + `services.workstation.image`).

---

_[← Before You Start](01-before-you-start.md) · [Guide overview](index.md) · [Next: Author `scenario.yaml` →](03-scenario-yaml.md)_
