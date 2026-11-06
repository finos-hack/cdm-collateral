```yaml
id: task-csa-call-cancellation
type: task
title: Build the margin call cancellation flow
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
# Task: build the margin call cancellation flow

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 5 of section B of the workflow map. No coverage-matrix row; only the ISO 20022 message names (colr.005/006,
findings). Needs a CDM coverage check and, where missing, the CDM side in `cdm-ext`, then the prototype flow,
contracts, gateway, services, console steps and a live spec.
