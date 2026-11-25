```yaml
id: artifact-replay-determinism-review
name: Replay determinism review of the collateral workflow service
kind: doc
location: docs/analysis/replay-determinism-review.md
createdAt: 2026-11-25T02:26:00Z
updatedAt: 2026-11-25T02:26:00Z
review: proposed
provenance:
  sourceRef: ni:///sha-256;V6KQR3nL0uhP6kuhQg3K3JF3g6TlzvNWvnBFrDKieGE
  conversationId: onchain-data-protection
  timestamp: 2026-11-25T02:26:00Z
  confidence: 0.75
```
# Artifact: replay determinism review

Static review of `services/collateral` against sections 8.1 to 8.4 of `docs/architecture/onchain-privacy.md`,
approved by the project owner ("ok", 2026-11-24). Finds that `CdmFold` already replays a call's chain-ordered
documents, and that prices, haircuts and the business date are read live at check time instead of from versions named
in the call. Thirteen findings with file and line. Not compiled or run; covers the margin call path only.
