```yaml
id: concept-asr-onchain-asset-identity
label: On-chain asset identity
subtype: asr
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: dc9865cb385fc2de9212ad62a89b55c55d0338e8
  contentHash: dc9865cb385fc2de9212ad62a89b55c55d0338e8
  timestamp: 2026-10-16T02:55:34Z
  confidence: 0.8
createdAt: 2026-10-16T02:55:34Z
updatedAt: 2026-10-16T19:43:54Z
```
# On-chain asset identity

Every tokenized collateral asset carries its security identifier (ISIN or CUSIP), its ISO 24165 DTI where one exists,
its network and token contract, and states which record is legally authoritative (bearer, registered or claims
structure; for DTCC tokens, DTC's books and records). CDM 7.6.0 has no
attribute for these (finding B1).
