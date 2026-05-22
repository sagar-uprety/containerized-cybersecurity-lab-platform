# Redis Exposed

`redis-exposed` is the first proof-of-concept lab: a browser-terminal-first Redis misconfiguration scenario.

Primary student access is the browser terminal on `190NN`. SSH on `220NN` remains available as fallback/debug access. The demo application is exposed on `180NN`. Redis must stay reachable only inside the private lab network.

The scenario contract is defined in `scenario.yaml` and must validate against `../scenario.schema.json` before `labctl` renders the Podman runtime template or starts the lab.

Layout notes:

- `demo-app/` contains the source and Dockerfile for the small Redis-backed web app.
- `files/` contains mounted lab artifacts, service configuration examples, and Dockerfiles or scripts used by workstation/service images.
