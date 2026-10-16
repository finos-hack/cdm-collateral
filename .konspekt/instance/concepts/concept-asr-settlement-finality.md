```yaml
id: concept-asr-settlement-finality
label: Deterministic settlement finality
subtype: asr
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: dc9865cb385fc2de9212ad62a89b55c55d0338e8
  contentHash: dc9865cb385fc2de9212ad62a89b55c55d0338e8
  timestamp: 2026-10-16T02:55:34Z
  confidence: 0.7
createdAt: 2026-10-16T02:55:34Z
updatedAt: 2026-10-16T19:43:54Z
```
# Deterministic settlement finality

A collateral movement counts as settled only at a defined, deterministic finality point on the ledger used, so that
margin, close-out and settlement-finality protection can rely on it.
