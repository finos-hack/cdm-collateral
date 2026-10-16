```yaml
id: artifact-setup-codespaces
name: GitHub Codespaces environment
kind: document
location: docs/setup-codespaces.md
review: proposed
provenance:
  conversationId: architecture-design
  sourceRef: 41af88afd7f6994b53858c3b109793a399df3d06
  contentHash: 41af88afd7f6994b53858c3b109793a399df3d06
  timestamp: 2026-10-16T22:20:33Z
  confidence: 0.75
createdAt: 2026-10-16T22:20:33Z
updatedAt: 2026-10-16T22:20:33Z
```
# GitHub Codespaces environment

Guide `docs/setup-codespaces.md` with the dev container definition `.devcontainer/devcontainer.json` and the scripts
`besu/start-network.sh` (generate keys once, write `besu/.env`, start Docker Compose) and `besu/check-network.sh`.
Tested: the start script with a native Besu 26.9.0 in place of Docker (four nodes, 3 peers each, 4 validators); the dev
container CLI 0.80.0 read the configuration. Not tested: a real codespace build and Docker Compose inside it.
