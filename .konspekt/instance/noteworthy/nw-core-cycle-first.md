```yaml
id: nw-core-cycle-first
kind: decision
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: f2af9c708d4dfb0afca4f8657294d0883797c5b2
  contentHash: f2af9c708d4dfb0afca4f8657294d0883797c5b2
  timestamp: 2026-11-03T14:47:29Z
createdAt: 2026-11-03T14:47:29Z
updatedAt: 2026-11-03T14:47:29Z
```
# Decision: finish the core CSA margin cycle before the CSA extensions

Decided by the project owner on 2026-11-03. Work on section B of `docs/analysis/cdm-workflow-task-map.md`
([[task-csa-workflow-extensions]]) starts only after the rest of section A is done: `flow-oracle-update` and
`flow-revaluation-top-up` ([[task-e2e-remaining-flows]]) and the valuation gaps G7–G10 ([[task-cdm-gap-closure]]).
The two orders are not interleaved. The codespace follow-ups from PR #11 are deferred.
