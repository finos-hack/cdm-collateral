```yaml
id: task-csa-amendment
type: task
title: Build the amendment of agreement terms flow
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.7
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T16:37:15Z
```
# Task: build the amendment of agreement terms flow

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 4 of section B of the workflow map. CDM models CSA amendment (score 4). Needs the prototype flow, contracts,
gateway, services, console steps and a live spec; whether `cdm-ext` needs any addition is to be checked first.

## Decisions 2026-11-06T16:37:15Z

The project owner (2026-11-06, source `578226982772d99dbb0570851616daaed670e859`): the amendment changes both the IM MTA and rounding and the
eligibility haircuts; one party proposes with the CDM amendment's hash and the other consents on-chain, and the control
contract then applies the new haircuts to that pair (eligibility per pair); the baseline `LegalAgreement` comes from a
CDM published sample IM CSA; cdm-ext adds a qualifier for the agreement terms change.

Found 2026-11-06: CDM 7.7.0's `Create_AgreementEvent` changes only the `LegalAgreement` (the IM, VM or legacy CSA
election block, replaced whole); the eligibility schedule is a separate `EligibleCollateralSpecification`, and CDM's only
change function for it, `CloneEligibleCollateralWithChangedTreatment`, gives every criterion the same changed treatment.
The CDM sample `01-2018-NY-Law-IM-CSA.json` (common-domain-model tag 7.7.0, Community Specification License 1.0) loads
with `RosettaObjectMapper` and passes CDM validation.
