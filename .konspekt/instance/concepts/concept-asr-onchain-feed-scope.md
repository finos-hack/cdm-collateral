```yaml
id: concept-asr-onchain-feed-scope
label: On-chain market data limited to what contracts act on
subtype: asr
review: proposed
provenance:
  conversationId: adr-asr-traceability
  sourceRef: 5927fa0239a8781c51442acdf4500e2af1eea411
  contentHash: 5927fa0239a8781c51442acdf4500e2af1eea411
  timestamp: 2026-11-06T21:52:57Z
  confidence: 0.55
createdAt: 2026-11-06T21:52:57Z
updatedAt: 2026-11-06T21:52:57Z
```
# On-chain market data limited to what contracts act on

The on-chain feed carries only the market data a contract rule reads: prices and default status. Other market data,
such as ratings, stays off-chain until a contract rule needs it, because adding a field to the feed changes the
contract and requires redeploying it on every chain. Basis: `OracleFeed` stores prices and default status only, and the
rating check on chain (gap G11) is not built.
