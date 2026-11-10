```yaml
id: task-sme-repo-pair-off-rules
type: task
title: Confirm with a business SME the rules for a repo pair-off under the GMRA
status: open
review: proposed
provenance:
  conversationId: repo-pair-off
  sourceRef: 2733275ab3cc72d223729efa4a32ccae2f360c80
  contentHash: 2733275ab3cc72d223729efa4a32ccae2f360c80
  timestamp: 2026-11-10T23:26:13Z
  confidence: 0.6
createdAt: 2026-11-10T23:26:13Z
updatedAt: 2026-11-10T23:26:13Z
```
# Task: confirm the rules for a repo pair-off under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-roll-rules]]. The project owner chose the design
for [[task-repo-pair-off]] on 2026-11-10: a net settlement of the paired repurchase legs, full pair-off only. The details
below are assumptions ([[wp-adr-repo-pair-off]]). Questions for the SME:

1. **Matching.** The prototype pairs off two repos only when they are between the same parties in opposite directions,
   with the same security, quantity, cash currency and Repurchase Date. Which of these must match in practice, and is a
   pair-off of repos with different Repurchase Dates possible?
2. **Partial.** Only equal quantities pair off. Is a partial pair-off (the difference delivered) common, and how is the
   residual treated?
3. **Leg.** The prototype nets the repurchase legs on the common Repurchase Date. Is pairing off the purchase legs (the
   repos never start) also in scope?
4. **Cash.** The net cash is the difference of the two Repurchase Prices, paid by the Seller of the repo with the higher
   one. Are interim interest, income or margin also netted into it?
5. **Agreement.** Either party proposes and the other agrees or refuses. Is a pair-off agreed bilaterally like this, or
   instructed through a settlement system?
6. **Margin.** The paired repos leave the pair's Net Exposure on settlement. Must the margin held be adjusted at the same
   time?
7. **Trades.** CDM keeps both trades and adds a package reference; the prototype then marks both repurchased. Under the
   GMRA, are the two Transactions terminated, or settled by netting?
