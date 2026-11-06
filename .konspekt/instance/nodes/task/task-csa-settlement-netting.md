```yaml
id: task-csa-settlement-netting
type: task
title: Build the settlement netting flow
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.7
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T15:14:18Z
```
# Task: build the settlement netting flow

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 6 of section B of the workflow map. Absent in CDM (0-2), no gap ID; the CSA matrix places it inside the
transfer step. Needs a gap ID and the CDM side in `cdm-ext`, then the prototype flow, contracts, gateway, services,
console steps and a live spec.
