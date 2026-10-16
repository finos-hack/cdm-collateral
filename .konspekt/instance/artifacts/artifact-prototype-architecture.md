```yaml
id: artifact-prototype-architecture
name: Prototype architecture (CALM)
kind: architecture
location: architecture/prototype.architecture.json
version: calm-1.2
review: proposed
provenance:
  conversationId: architecture-design
  sourceRef: 4b19056d8c79b44d09a5d2b5798f74d5dd53fe62
  contentHash: 4b19056d8c79b44d09a5d2b5798f74d5dd53fe62
  timestamp: 2026-10-16T20:08:49Z
  confidence: 0.75
createdAt: 2026-10-16T20:08:49Z
updatedAt: 2026-10-16T20:08:49Z
```
# Prototype architecture (CALM)

CALM 1.2 architecture of the local prototype: collateral workflow service (Python, CDM 7.6.0), oracle service (Python),
ledger gateway (TypeScript, Besu adapter), SQLite workflow store, mock market data, dev keystore, single-node QBFT Besu
network in Docker, and three Solidity contracts (tokenized collateral, collateral control, oracle feed); four flows
(IM call and pledge, oracle update, return, default and enforcement). Companion page `architecture/README.md`.
Validated with CALM CLI 1.60.1 --strict. Sketch only; nothing built.
