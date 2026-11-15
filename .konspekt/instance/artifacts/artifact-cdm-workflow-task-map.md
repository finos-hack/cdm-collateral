```yaml
id: artifact-cdm-workflow-task-map
name: CDM collateral workflow to task map
kind: analysis
location: docs/analysis/cdm-workflow-task-map.md
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: ni:///sha-256;Hz-Wy1LX7MxZHrtHdKdGAvW6iIBnWud1M1UwzNVDAys
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
    contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-03T14:47:29Z
```
# CDM collateral workflow to task map

Output of [[investigation-cdm-workflow-task-map]]. Every collateral workflow in the repository's analysis (CSA and
other-agreements coverage matrices, findings, conceptual model, gap register), in three sections: A, the ISDA CSA
margin cycle the prototype implements (seven flows in `architecture/prototype.architecture.json`, including the new
`flow-vm-margin-call-transfer`); B, the CSA workflows with no prototype flow; C, repo, securities lending, triparty
and CCP. Each row gives the CDM status with gap IDs, what is built, the live spec and the task that closes the gap.
Build order (project owner, 2026-11-03): the CSA cycle first, then the four other agreement families.
