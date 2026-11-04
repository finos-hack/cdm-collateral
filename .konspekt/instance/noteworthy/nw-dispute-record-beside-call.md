```yaml
id: nw-dispute-record-beside-call
kind: decision
review: proposed
provenance:
  conversationId: cdm-development
  sourceRef: 1196485feb767867744d28d3eebfaaac64e6fc01
  contentHash: 1196485feb767867744d28d3eebfaaac64e6fc01
  timestamp: 2026-11-04T00:15:20Z
  confidence: 0.7
createdAt: 2026-11-04T00:15:20Z
updatedAt: 2026-11-04T00:15:20Z
```
# Decision: a dispute is its own record next to the margin call; resolution states what is still due, paid through a new call

How gap G3 is closed in `cdm-ext/rosetta/cdmx-collateral-dispute-*.rosetta` ([[task-cdm-gap-closure]]):

- **Record:** `Create_Dispute` builds a `Dispute` from the call's own agreed and disputed amounts, with the disputing
  party, the subject (Amount or Value, ISDA CSA Paragraph 5), a free-text reason and the Resolution Time. The margin
  call lifecycle is unchanged: the agreed part settles through the call, and the call keeps its disputed amount.
- **Resolution:** `ResolveDispute` settles the dispute by agreement, or by recalculation only once the Resolution Time
  has passed. The resolved amount lies between the agreed and the called amount. The additional amount due (resolved
  less agreed) is transferred through a new call.
- **Out of scope:** the recalculation itself (quotations, SIMM rerun, revaluation) and the FpML dispute reason code
  lists (TX2).

On-chain, only the fact of a dispute and the disputed amount are recorded ([[concept-asr-onchain-call-state]]).
