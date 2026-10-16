```yaml
id: artifact-setup-windows
name: Windows development machine setup
kind: document
location: docs/setup-windows.md
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 9ae499a1f078db987641f81be32f5a995ed8f218
  contentHash: 9ae499a1f078db987641f81be32f5a995ed8f218
  timestamp: 2026-10-16T20:21:13Z
  confidence: 0.75
createdAt: 2026-10-16T20:21:13Z
updatedAt: 2026-10-16T21:09:56Z
```
# Windows development machine setup

Step-by-step setup for the project owner's Windows machine: WSL2, Docker Desktop, Git, Python 3.12, Node.js LTS, and
a single-node QBFT Besu 26.9.0 network in Docker. The Besu configuration and flags were tested natively (Besu 26.9.0,
Java 25, Linux); the Windows and Docker steps were not tested.

Revised 2026-10-16T21:09:56Z (`wp-adr-per-participant-services`, source `2996ac2d303ef1b99234173cb0b618ba1a45aca9`): step 6 now starts four Besu validator nodes, one per
default participant, with Docker Compose; configuration in `besu/qbftConfigFile.json` and `besu/docker-compose.yml`.
Tested natively with four nodes; Windows and Docker steps not tested.
