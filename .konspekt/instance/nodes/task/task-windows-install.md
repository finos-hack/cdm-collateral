```yaml
id: task-windows-install
type: task
title: Windows machine install
status: resolved
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
updatedAt: 2026-10-17T18:32:09Z
```
# Task: Windows machine install

Sub-task of `task-local-environment-setup`. Run `../../../../docs/setup/setup-windows.md` on the project owner's Windows machine
(WSL2, Docker Desktop, Git, Python 3.12, Node.js, four-node Besu network), and fix the guide where it fails. Not on the
critical path: the primary environment is GitHub Codespaces (`wp-adr-cloud-dev-environment`).

Resolved 2026-10-17T18:32:09Z (source `f653908353dce5cf20875fa230afab001c9f8ea1`): `../../../../docs/setup/setup-windows.md` was run end
to end on the project owner's Windows 11 machine. The one failure — step 3's `docker run --rm hello-world` against a
stopped Docker Desktop engine — was a guide gap, now fixed (wait-for-engine instruction plus a troubleshooting row).
Step 6 brought up the four-node QBFT network over Docker Compose and passed its RPC checks. Steps 2, 4 and 5 were not
exercised because WSL, Git, Python and Node were already present.
