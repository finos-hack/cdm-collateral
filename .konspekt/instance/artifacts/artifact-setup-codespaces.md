```yaml
id: artifact-setup-codespaces
name: GitHub Codespaces environment
kind: document
location: docs/setup-codespaces.md
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 41af88afd7f6994b53858c3b109793a399df3d06
  contentHash: 41af88afd7f6994b53858c3b109793a399df3d06
  timestamp: 2026-10-16T22:20:33Z
  confidence: 0.75
createdAt: 2026-10-16T22:20:33Z
updatedAt: 2026-10-16T22:43:35Z
```
# GitHub Codespaces environment

Guide `../../../docs/setup/setup-codespaces.md` with the dev container definition `.devcontainer/devcontainer.json` and the scripts
`besu/start-network.sh` (generate keys once, write `besu/.env`, start Docker Compose) and `besu/check-network.sh`.
Tested: the start script with a native Besu 26.9.0 in place of Docker (four nodes, 3 peers each, 4 validators); the dev
container CLI 0.80.0 read the configuration. 

Verified 2026-10-16T22:31:29Z (source `383a32e6247730d28a49f2c96d3f4facdae9d5a4`): the project owner built a codespace from `main`; `check-network.sh` showed all
four nodes at the same block, 3 peers and four validators.
