```yaml
id: artifact-setup-windows
name: Windows development machine setup
kind: document
location: docs/setup-windows.md
review: proposed
provenance:
  conversationId: architecture-design
  sourceRef: 9ae499a1f078db987641f81be32f5a995ed8f218
  contentHash: 9ae499a1f078db987641f81be32f5a995ed8f218
  timestamp: 2026-10-16T20:21:13Z
  confidence: 0.75
createdAt: 2026-10-16T20:21:13Z
updatedAt: 2026-10-16T20:21:13Z
```
# Windows development machine setup

Step-by-step setup for the project owner's Windows machine: WSL2, Docker Desktop, Git, Python 3.12, Node.js LTS, and
a single-node QBFT Besu 26.9.0 network in Docker. The Besu configuration and flags were tested natively (Besu 26.9.0,
Java 25, Linux); the Windows and Docker steps were not tested.
