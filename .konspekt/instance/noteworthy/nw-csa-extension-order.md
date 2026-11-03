```yaml
id: nw-csa-extension-order
kind: decision
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: f2af9c708d4dfb0afca4f8657294d0883797c5b2
  contentHash: f2af9c708d4dfb0afca4f8657294d0883797c5b2
  timestamp: 2026-11-03T14:47:29Z
  confidence: 0.65
createdAt: 2026-11-03T14:47:29Z
updatedAt: 2026-11-03T14:47:29Z
```
# Decision: order of the CSA workflow extensions

Order for [[task-csa-workflow-extensions]], chosen by the maintainer at the project owner's request ("your call",
2026-11-03). Rule: gap-register priority first (P2, then unprioritised, then P3, then out of scope); within a
priority, workflows that extend flows the prototype already runs come first.

1. Close-out netting on default (G15, P2). Extends `flow-default-enforcement`, which runs live.
2. Substitution (G16, P2). Reuses the pledge and return steps.
3. Interest on cash collateral (G17, P2). Needs cash collateral and a periodic calculation.
4. Amendment of agreement terms. CSA coverage score 4; G19 (P2) covers repo and lending only.
5. Margin call cancellation. No gap ID; one added step on the margin call lifecycle.
6. Settlement netting. No gap ID; sits inside the transfer step and needs several calls settling together.
7. Collateral allocation and optimisation (G34, P3). Replaces the hand-chosen proposal.
8. Reconciliation (G35, out of scope). Only if business case §8 item 3 moves it back into scope.
