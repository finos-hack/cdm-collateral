```yaml
id: wp-adr-cloud-dev-environment
kind: decision
timestamp: 2026-10-16T22:20:33Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;8Jx7J_a279LKNQEQrz3bE8rHZAx04LFMDhKmmkKuzu4
  timestamp: 2026-10-16T22:20:33Z
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 41af88afd7f6994b53858c3b109793a399df3d06
    contentHash: 41af88afd7f6994b53858c3b109793a399df3d06
createdAt: 2026-10-16T22:20:33Z
updatedAt: 2026-11-06T21:52:57Z
```
# Decision: Development environment in a public cloud (GitHub Codespaces)

The prototype's primary development and demo environment is a GitHub Codespace built from
`.devcontainer/devcontainer.json`: Ubuntu 24.04, Docker-in-Docker, Python 3.12, Node.js LTS, 4 cores and 16 GB,
starting the four-node Besu network on every start. The Windows machine install stays as an alternative
(`task-windows-install`).

**Context.** The project owner's Windows setup is not ready and should not hold up the work. The Claude Code cloud
session cannot host a reachable demo (its container is temporary and accepts no inbound connections). Codespaces needs
no local install, runs the Docker Compose network unchanged and can forward ports publicly for a demo; its free
allowance is limited (reported 120 core-hours a month) and a codespace stops when idle. Oracle Cloud's Always Free
VM (2 OCPU / 12 GB since 2026) and PaaS free tiers were considered and are less suitable.

**Consequences.** Everything the prototype needs must start from the dev container without manual steps. Public port
forwarding exposes Besu RPC to anyone while public; demos expose only the consoles and use test keys only.

Revised 2026-10-18T01:27:28Z (source `6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630`): the dev container also installs Java 21 (`wp-adr-java-cdm-stack`).
