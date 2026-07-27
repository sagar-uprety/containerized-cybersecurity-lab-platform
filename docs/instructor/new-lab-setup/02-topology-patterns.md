# Choose a Topology Pattern

_[← Before You Start](01-before-you-start.md) · [Guide overview](index.md)_

## Pattern A: Standalone Service

Use for SSH, LDAP, FTP, SMB, SNMP, SMTP, DNS, banner, and many database labs.

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
important, such as an application using a database/cache.

```text
workstation --> target service <-- dependent app
workstation --------------------> dependent app
```

Add guardrails proving the dependent app remains healthy after hardening. Do
not invent a demo app for every lab; unnecessary services increase build time,
failure modes, and student cognitive load.

## Pattern C: Proxy, Firewall, or Segmentation

```text
workstation -- external net --> middlebox -- internal net --> target
```

Declare networks explicitly. List the workstation-facing network first because
labctl attaches the workstation to the first declared network. Attach the
middlebox to both networks. Add only the capability required by the lesson,
commonly `NET_ADMIN` for an in-container firewall.

For more complex segmentation, add uniquely named service keys for each client,
server, and middlebox. Even if two containers use the same image, each instance
must have a distinct service key because runtime container names derive from
that key.

## Pattern D: Custom Workstation

The shared workstation image already includes common Linux security clients.
If a future lab needs another client, extend `thesis-labs/workstation-base` in a
lab-specific Dockerfile, add that image under `build.images`, and set
`services.workstation.image` to it. Do not modify the global workstation image
for a tool needed by only one lab.

---

_[← Before You Start](01-before-you-start.md) · [Guide overview](index.md) · [Next: Author `scenario.yaml` →](03-scenario-yaml.md)_
