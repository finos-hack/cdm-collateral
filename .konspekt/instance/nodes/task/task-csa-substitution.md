```yaml
id: task-csa-substitution
type: task
title: Build the collateral substitution flow (G16)
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;zUSWoS_Is_x0i0j9LQ7oiK6y41fk_3-H9AvsdYOfhrA
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
    contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T15:14:18Z
```
# Task: build the collateral substitution flow (G16)

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 2 of section B of the workflow map. The CDM side is in `cdm-ext` (`cdmx.collateral.substitution`:
`Create_CollateralSubstitution`, `SubstitutionInstruction`, `SubstitutionState`; ISDA CSA Paragraph 4(d), consent by
Paragraph 13 (f)(ii); defect D5) from [[task-cdm-gap-closure]]. Still needed: a flow in
`architecture/prototype.architecture.json`, the contract steps (request, consent or refusal, settlement that delivers the
substitute and returns the original items), the gateway routes, the collateral service steps, the console steps and a
live spec.

## Progress 2026-11-06T14:41:19Z

- Built in commit `8bb9891` on branch `P2`: `CollateralControl.requestSubstitution`,
  `decideSubstitution`, `settleSubstitution`, gateway routes `/substitutions` and `/escrow-at`, service
  `/api/v1/substitutions` (`CdmSubstitution`), console cards "Substitute pledged collateral" and "Substitutions", CALM
  flow `flow-substitution` and a live spec. Design proposed in [[wp-adr-substitution-fold-portfolio]].
- Verified locally 2026-11-06 with the same runs as [[task-csa-close-out-netting]]: all 8 live specs pass.
- Not done: not pushed, no PR. A refusal is covered by the contract tests and the console, not by a live spec.

## Resolved 2026-11-06T15:14:18Z

Resolved by the project owner (2026-11-06: "3. yes"), with its design record accepted in the same decision. Pushed on
branch `P2` for review.
