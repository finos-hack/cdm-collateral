```yaml
id: task-csa-substitution
type: task
title: Build the collateral substitution flow (G16)
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
# Task: build the collateral substitution flow (G16)

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 2 of section B of the workflow map. The CDM side is in `cdm-ext` (`cdmx.collateral.substitution`:
`Create_CollateralSubstitution`, `SubstitutionInstruction`, `SubstitutionState`; ISDA CSA Paragraph 4(d), consent by
Paragraph 13 (f)(ii); defect D5) from [[task-cdm-gap-closure]]. Still needed: a flow in
`architecture/prototype.architecture.json`, the contract steps (request, consent or refusal, settlement that delivers the
substitute and returns the original items), the gateway routes, the collateral service steps, the console steps and a
live spec.
