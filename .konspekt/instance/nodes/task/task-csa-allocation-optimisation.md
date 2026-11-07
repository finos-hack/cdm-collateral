```yaml
id: task-csa-allocation-optimisation
type: task
title: Optimise the suggested collateral basket by cost instead of a fixed ranking order
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 844ed07f9135d9e47306d591ccfec3e236390623
  contentHash: 844ed07f9135d9e47306d591ccfec3e236390623
  timestamp: 2026-11-07T18:27:28Z
  confidence: 0.7
createdAt: 2026-11-07T18:27:28Z
updatedAt: 2026-11-07T18:27:28Z
```
# Task: optimise the suggested collateral basket by cost

Under [[task-csa-workflow-extensions]], a follow-up to [[task-csa-allocation]] (row 7 of section B of the workflow map,
"collateral allocation and optimisation", gap G34). The built `AllocateCollateral` fills the agreed amount in the
pledgor's ranking order; it does not choose the basket that costs the pledgor least. The project owner asked for a
task of its own on 2026-11-07. To decide before building:

1. **Cost measure.** Haircut, funding or opportunity cost per asset, or a cheapest-to-deliver score; who supplies it
   (the pledgor, the service, an oracle feed). Depends on question 1 of [[task-sme-allocation-ranking]].
2. **Method.** A greedy order by cost per unit of value after haircut is close to a ranking supplied by the pledgor; a
   true optimum with whole units and concentration limits ([[task-sme-allocation-concentration]]) is an integer
   programme. Whether Rune can express it, or the optimisation runs in the service with CDM validating the result.
3. **Scope.** Whether optimisation also covers substitution (rebalance the held basket) or only new calls.
