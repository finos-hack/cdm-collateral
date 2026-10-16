```yaml
id: concept-asr-ledger-neutrality
label: Ledger neutrality
subtype: asr
review: proposed
provenance:
  conversationId: architecture-design
  sourceRef: dc9865cb385fc2de9212ad62a89b55c55d0338e8
  contentHash: dc9865cb385fc2de9212ad62a89b55c55d0338e8
  timestamp: 2026-10-16T02:55:34Z
  confidence: 0.75
createdAt: 2026-10-16T02:55:34Z
updatedAt: 2026-10-16T02:55:34Z
```
# Ledger neutrality

The collateral system must not depend on one ledger. On-chain actions go through a ledger-neutral interface, and at
least one permissioned EVM ledger (for example Hyperledger Besu) and one public EVM ledger must be supportable.
Basis: the ISDA documents are ledger-neutral; the GDF/ISDA sandbox settled across Ethereum, Hedera and Besu through an
orchestration layer.
