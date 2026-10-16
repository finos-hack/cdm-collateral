```yaml
id: task-windows-install
type: task
title: Windows machine install
status: open
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 41af88afd7f6994b53858c3b109793a399df3d06
  contentHash: 41af88afd7f6994b53858c3b109793a399df3d06
  timestamp: 2026-10-16T22:20:33Z
createdAt: 2026-10-16T22:20:33Z
updatedAt: 2026-10-16T22:20:33Z
```
# Task: Windows machine install

Sub-task of `task-local-environment-setup`. Run `docs/setup-windows.md` on the project owner's Windows machine
(WSL2, Docker Desktop, Git, Python 3.12, Node.js, four-node Besu network), and fix the guide where it fails. Not on the
critical path: the primary environment is GitHub Codespaces (`wp-adr-cloud-dev-environment`).
