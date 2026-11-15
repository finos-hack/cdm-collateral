```yaml
id: investigation-cdm-workflow-task-map
type: investigation
title: Map every CDM collateral workflow to the tasks that implement it
status: active
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: ni:///sha-256;zsnmZETbzIDT3KVN5D8Pj3GGGS6Ix1Iol6m3NAJOgHI
  timestamp: 2026-11-03T14:18:57Z
  confidence: 0.85
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 9ae1c50fc83a1b5223f99484de5ff2dddb9af0be
    contentHash: 9ae1c50fc83a1b5223f99484de5ff2dddb9af0be
createdAt: 2026-11-03T14:18:57Z
updatedAt: 2026-11-03T14:47:29Z
```
# Investigation: map every CDM collateral workflow to the tasks that implement it

The project owner asked for a clear view of the tasks needed to implement all CDM workflows before more flow work
starts (2026-11-03; `flow-oracle-update` work is on hold until then).

Scope, as set by the project owner: both views, reconciled.
- The CDM collateral lifecycle: every collateral workflow CDM models or should model.
- The five flows in `architecture/prototype.architecture.json`. The project owner regards them as five CDM workflows
  (the CALM file is the notation they are written in).

Output: a workflow-to-task map. For each workflow: whether the five flows cover it, what is implemented (contracts,
gateway, services, console, live spec), what is missing, and the existing or proposed task that closes the gap.
