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
updatedAt: 2026-10-18T01:27:28Z
```
# Windows development machine setup

Step-by-step setup for the project owner's Windows machine: WSL2, Docker Desktop, Git, Python 3.12, Node.js LTS, and
a single-node QBFT Besu 26.9.0 network in Docker. The Besu configuration and flags were tested natively (Besu 26.9.0,
Java 25, Linux); the Windows and Docker steps were not tested.

Revised 2026-10-16T21:09:56Z (`wp-adr-per-participant-services`, source `2996ac2d303ef1b99234173cb0b618ba1a45aca9`): step 6 now starts four Besu validator nodes, one per
default participant, with Docker Compose; configuration in `besu/qbftConfigFile.json` and `besu/docker-compose.yml`.
Tested natively with four nodes; Windows and Docker steps not tested.

Revised 2026-10-17T18:32:09Z (`task-windows-install`, source `f653908353dce5cf20875fa230afab001c9f8ea1`): executed on
the project owner's Windows 11 machine with Docker Desktop (WSL 2 engine). Step 3 (Docker engine) and step 6 verified —
the four-node QBFT network over Docker Compose reached `net_peerCount` `0x3`, four validators and 2-second block
production with all four containers healthy. Step 3 gained a wait-for-engine instruction and a troubleshooting row for
the `dockerDesktopLinuxEngine` connection error. Steps 2, 4 and 5 (`wsl --install`, the Git / Python / Node installs,
the clone) were not exercised because those tools were already present on the test machine.

Revised 2026-10-18T01:27:28Z (source `6634e3f08a3a21e5cc0574f7ca2bfaf3cdd61630`): step 4 installs a JDK 21 (Temurin, not yet tested on Windows); Python only for documentation scripts; the Java build uses the Maven wrapper (`wp-adr-java-cdm-stack`).
