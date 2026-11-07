```yaml
id: task-csa-reconciliation
type: task
title: Decide whether reconciliation (G35) is in scope, then build it
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.65
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-07T18:32:00Z
```
# Task: decide whether reconciliation (G35) is in scope, then build it

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 8 of section B of the workflow map. Absent in CDM (0): G35, classified out of scope in the gap register and
reopened as an open decision (business case §8 item 3). The scope decision comes first; if it is in scope, the CDM
side and the prototype flow follow.

**Scope decided 2026-11-07** (source `a2bc041d64b5866b6881d035f29342b3a34faccd`: "in scope, with options 1 and 2"): G35
moves back into scope with (1) each party's CDM records reconciled against the chain (calls, escrow, balances) and (2)
portfolio and exposure reconciliation between the parties (the trades and valuations behind a call, held off-chain).
Oracle inputs against a second source are not included. The design questions go to an ADR before the build.
