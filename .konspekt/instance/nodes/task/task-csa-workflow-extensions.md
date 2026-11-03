```yaml
id: task-csa-workflow-extensions
type: task
title: Implement the ISDA CSA workflows that have no prototype flow yet
status: open
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.8
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-03T14:29:20Z
```
# Task: implement the ISDA CSA workflows that have no prototype flow yet

Section B of the workflow map (`docs/analysis/cdm-workflow-task-map.md`), from [[investigation-cdm-workflow-task-map]]. Build order set by the project owner
on 2026-11-03: the CSA cycle first, then the other agreement families. This task is the CSA part that the prototype
does not cover yet:

- substitution (G16, D5);
- interest on cash collateral (G17);
- collateral allocation and optimisation (G34);
- close-out netting on default (G15);
- settlement netting (no gap ID);
- amendment of agreement terms;
- margin call cancellation (no coverage-matrix row);
- reconciliation (G35): first decide whether it is in scope (business case §8 item 3).

Each workflow needs the CDM side (the gap closed in `cdm-ext`, as [[task-cdm-gap-closure]] does for the margin call
lifecycle), a flow in `architecture/prototype.architecture.json`, the contracts, gateway, services and console
steps, and a live spec. Splitting this task into one task per workflow, and their order, is still to be decided.
