```yaml
id: task-csa-allocation
type: task
title: Build the collateral allocation and optimisation flow (G34)
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.7
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-07T18:15:45Z
```
# Task: build the collateral allocation and optimisation flow (G34)

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 7 of section B of the workflow map. Absent in CDM (0): G34, P3; the pledgor chooses assets by hand. Needs the CDM
side in `cdm-ext`, then the prototype flow, services, console steps and a live spec.

Built on branch `csa-allocation` (2026-11-07): `cdmx.collateral.allocation` `AllocateCollateral` in `cdm-ext`, the
collateral service endpoint `POST /api/v1/calls/{id}/allocation`, the console "Suggest allocation" button and the live
spec `flow-allocation`, within the scope of [[wp-adr-allocation-scope]]. Open questions for the SME are in
[[task-sme-allocation-ranking]]. The project owner resolved the task on 2026-11-07 (source `b94ecf05be6e7d479e2ec32ca6f413bdcfb74679`: "1. yes, please").
