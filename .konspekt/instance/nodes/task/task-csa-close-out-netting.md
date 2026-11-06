```yaml
id: task-csa-close-out-netting
type: task
title: Build the close-out netting flow on default (G15)
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.8
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T15:14:18Z
```
# Task: build the close-out netting flow on default (G15)

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 1 of section B of the workflow map (`docs/analysis/cdm-workflow-task-map.md`). The CDM side is in `cdm-ext`
(`cdmx.collateral.closeout`: `CloseOutNetting`, `EarlyTerminationAmount`, `CloseOutStatement`; ISDA 2002 MA Section
6(e)) from [[task-cdm-gap-closure]]. Still needed: a flow in `architecture/prototype.architecture.json`, the contract
step that applies the pledged collateral to the Early Termination Amount and returns the surplus, the gateway route,
the collateral service step that builds the `CloseOutStatement`, the console step and a live spec.

## Progress 2026-11-06T14:41:19Z

- Built in commit `8bb9891` on branch `P2`: `CollateralControl.closeOut`, gateway routes
  `/close-outs`, service `POST|GET /api/v1/close-outs` (`CdmCloseOut`), console card "Close-out on default", CALM flow
  `flow-close-out-netting` and a live spec. Design proposed in [[wp-adr-closeout-contract-applies-collateral]].
- Verified locally 2026-11-06 on a new contract deployment on the existing chain (the owner chose this; the previous
  deployment file is kept as `contracts/deployments/besu.pre-g15-g16.json`): contract tests 28 of 28, service tests,
  console unit tests 62 of 62, all 8 live specs pass.
- Not done: not pushed, no PR. GMRA, GMSLA and CCP close-out stay with section C.

## Resolved 2026-11-06T15:14:18Z

Resolved by the project owner (2026-11-06: "3. yes"), with its design record accepted in the same decision. Pushed on
branch `P2` for review.
