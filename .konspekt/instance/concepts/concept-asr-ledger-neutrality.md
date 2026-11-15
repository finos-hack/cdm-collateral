```yaml
id: concept-asr-ledger-neutrality
label: Ledger neutrality
subtype: asr
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: ni:///sha-256;o4FBNlrIoD_A3RYzlBcaW_9SO2sIY-njQBp8Tg_ALSg
  timestamp: 2026-10-16T02:55:34Z
  confidence: 0.75
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: dc9865cb385fc2de9212ad62a89b55c55d0338e8
    contentHash: dc9865cb385fc2de9212ad62a89b55c55d0338e8
createdAt: 2026-10-16T02:55:34Z
updatedAt: 2026-10-16T19:43:54Z
```
# Ledger neutrality

The collateral system must not depend on one ledger. On-chain actions go through a ledger-neutral interface that
covers both EVM token models (ERC-20 on Hyperledger Besu) and non-EVM ones (CIP-56 on Canton). DTCC's tokenization
service launches on both.
Basis: the ISDA documents are ledger-neutral; the GDF/ISDA sandbox settled across Ethereum, Hedera and Besu through an
orchestration layer.
