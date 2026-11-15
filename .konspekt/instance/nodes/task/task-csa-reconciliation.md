```yaml
id: task-csa-reconciliation
type: task
title: Decide whether reconciliation (G35) is in scope, then build it
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;zUSWoS_Is_x0i0j9LQ7oiK6y41fk_3-H9AvsdYOfhrA
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.65
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
    contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-07T20:11:29Z
```
# Task: decide whether reconciliation (G35) is in scope, then build it

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 8 of section B of the workflow map. Absent in CDM (0): G35, classified out of scope in the gap register and
reopened as an open decision (business case §8 item 3). The scope decision comes first; if it is in scope, the CDM
side and the prototype flow follow.

**Scope decided 2026-11-07** (source `a2bc041d64b5866b6881d035f29342b3a34faccd`: "in scope, with options 1 and 2"): G35
moves back into scope with (1) each party's CDM records reconciled against the chain (calls, escrow, balances) and (2)
portfolio and exposure reconciliation between the parties (the trades and valuations behind a call, held off-chain).
Oracle inputs against a second source are not included. The design questions go to an ADR before the build.

Built on branch `csa-reconciliation` (2026-11-07), within [[wp-adr-reconciliation-scope]]: cdm-ext
`cdmx.collateral.reconciliation` (`ReconcilePortfolios`, `ReconcileWithLedger`), the `PortfolioReconciliation`
contract (snapshot and result hashes), the collateral service's snapshot exchange and ledger endpoint, the console
reconciliation card and "Dispute citing reconciliation", and the live spec `flow-reconciliation`. Open questions for the
SME are in [[task-sme-reconciliation-rules]].

**Escrow positions** (source `fe94d24c8393576eafa827a5ced53840580becbe`: "stick to what ADR says - compare escrow
positions"): the ledger check also compares the pledgor's escrow by token, as the party's settled CDM records build it
(initial margin deliveries, returns that released initial margin, settled substitutions, since the pair's last
enforcement or close-out), with the control contract's. To make that possible the call records now state the margin
type: VM calls are issued as `regMarginType` VM (they were all stated as RegIM), and a return's
`SettleCallInstruction.returnedMarginType` says whether it released escrowed IM or paid VM back. Records written before
this change are read as they state. The project owner resolved the task on 2026-11-07 (same source: "3. yes").
