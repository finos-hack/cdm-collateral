```yaml
id: task-csa-amendment
type: task
title: Build the amendment of agreement terms flow
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;zUSWoS_Is_x0i0j9LQ7oiK6y41fk_3-H9AvsdYOfhrA
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
    contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T19:18:15Z
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

## Progress 2026-11-06T17:04:10Z

Correction to the finding above: a probe (cdm-ext `AmendmentTest`) shows that
`CloneEligibleCollateralWithChangedTreatment` writes the changed criterion and treatment into the first criterion of
the schedule (defect D18); it does not change every criterion.

Built on branch `csa-amendment`: cdm-ext `Create_CollateralAgreementAmendment` and `Qualify_AgreementTermsChange`
(commit `77f2168`, 11 tests), and `flow-agreement-amendment` (commit `33a7a11`): `CollateralControl.proposeAmendment`
and `decideAmendment` with eligibility per pair, gateway routes, the service fold of agreed amendments from CDM's sample
IM CSA (`CdmAgreement`, 4 tests), the console's "Agreement terms" card, the CALM flow and docs. Contract tests 36/36,
cdm-ext 158/158, service 18/18, console 62/62, live specs 10/10 on a new contract set on the same chain (earlier set
kept as `besu.pre-amendment.json`). The amendment changes the pledgor's MTA and haircuts; rounding is shown but the
form does not change it. Design choices are proposed in [[wp-adr-amendment-per-pair-terms]].

## Resolved 2026-11-06T19:18:15Z

Resolved by the project owner (2026-11-06: "2. resolve"), with [[wp-adr-amendment-per-pair-terms]] accepted in the same decision. Not covered:
amending the rounding from the console, party changes, VM and legacy CSAs, and criteria other than an AssetIdentifier.
Pushed on branch `csa-amendment` for review.
