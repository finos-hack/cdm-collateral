```yaml
id: concept-asr-offchain-dispute
label: Off-chain negotiation and dispute
subtype: asr
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;o4FBNlrIoD_A3RYzlBcaW_9SO2sIY-njQBp8Tg_ALSg
  timestamp: 2026-10-16T02:55:34Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: dc9865cb385fc2de9212ad62a89b55c55d0338e8
    contentHash: dc9865cb385fc2de9212ad62a89b55c55d0338e8
createdAt: 2026-10-16T02:55:34Z
updatedAt: 2026-10-16T19:43:54Z
```
# Off-chain negotiation and dispute

Margin call negotiation and disputes run off-chain; only the agreed amount is executed on-chain. Basis: GDF/ISDA
sandbox scenario 1a showed dispute handling separable from pledge execution.
