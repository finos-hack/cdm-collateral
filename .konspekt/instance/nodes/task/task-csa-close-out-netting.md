```yaml
id: task-csa-close-out-netting
type: task
title: Build the close-out netting flow on default (G15)
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.8
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T13:19:22Z
```
# Task: build the close-out netting flow on default (G15)

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 1 of section B of the workflow map (`docs/analysis/cdm-workflow-task-map.md`). The CDM side is in `cdm-ext`
(`cdmx.collateral.closeout`: `CloseOutNetting`, `EarlyTerminationAmount`, `CloseOutStatement`; ISDA 2002 MA Section
6(e)) from [[task-cdm-gap-closure]]. Still needed: a flow in `architecture/prototype.architecture.json`, the contract
step that applies the pledged collateral to the Early Termination Amount and returns the surplus, the gateway route,
the collateral service step that builds the `CloseOutStatement`, the console step and a live spec.
