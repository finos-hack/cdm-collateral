# CDM coverage of collateral management — ISDA credit support documents

Output of `task-cdm-current-state-analysis` (goal `goal-data-cdm-taxonomies-specs`).

- **CDM version:** release `7.6.0`, commit `f685b4b45d8faa419425c018a52af66f40e43c0b` (2026-10-09), from
  [finos/common-domain-model](https://github.com/finos/common-domain-model) `rosetta-source/src/main/rosetta`.
- **Scope:** ISDA credit support documents only — 1994/1995 legacy CSA/CSD, 2016 VM CSA, 2016/2018 IM CSA/CSD,
  2019 Collateral Transfer Agreement and Security Agreement. Other agreement families (GMRA, GMSLA, triparty,
  CCP margin) are covered by `task-cdm-collateral-other-agreements`.
- **Status:** first pass. Evidence comes from type/function names, definitions read for the margin call, CSA
  calculation and eligibility rows, and the repository file listing. Rows marked *(name search)* were not read in
  full.

## Method

1. Reference capability map of collateral management, built independently of CDM (rows below).
2. Each row scored on an evidence ladder. The highest level reached is the score; levels are not strictly
   cumulative (level 4 applies only to lifecycle steps).

   | Level | Meaning |
   |---|---|
   | 0 | Absent |
   | 1 | Enums or descriptions only |
   | 2 | Data types — the model can represent it |
   | 3 | Functions — executable logic |
   | 4 | Business events / primitive instructions — the lifecycle step is modelled as an event |
   | 5 | Sample data or tests in the CDM repository |

3. Every score cites file and type/function at the pinned commit.
4. Rows are later weighted by the needs of `goal-end-to-end-flow`.
5. Scores are checked against CDM release notes and Collateral Working Group scope before being treated as final.

## Matrix

| # | Capability | Score | Types | Functions | Events | Samples / tests | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Agreement terms and elections (VM, IM, legacy, CTA/SA) | **5** | yes | – | – | 31 documents (JSON + PDF) | `legaldocumentation-csa-type.rosetta` (1,560 lines): `CreditSupportAgreementVariationMarginElections`, `CreditSupportAgreementInitialMarginElections`, `CreditSupportAgreementLegacyElections`, `CollateralTransferAgreementElections`, `SecurityAgreementElections`. Samples: `examples/samples/legal-agreements/Isda-Credit-Support-Annex-Docs/` — 10 VM, 10 legacy, 9 IM CSA/CSD, 1 CTA, 1 Security Agreement |
| 2 | Amendment of agreement terms | **4** | yes | yes | yes | none found | `event-common-type.rosetta`: `AgreementPrimitiveInstruction`, `AgreementTermsChangeInstruction` (vm / im / legacy). `event-common-func.rosetta`: `Create_AgreementTermsChange`, `Create_VMCSATermsChange`, `Create_IMCSATermsChange`, `Create_LegacyCSATermsChange` |
| 3 | Eligible collateral and eligibility criteria | **5** | yes | yes | – | 4 eligible collateral schedules + 1 expected-output example; no unit tests found | `product-collateral-type.rosetta`: `EligibleCollateralSpecification`, `EligibleCollateralCriteria`, `AllCriteria` / `AnyCriteria` / `NegativeCriteria`, issuer/asset/rating/maturity criteria. `product-collateral-func.rosetta`: `CheckEligibilityForProduct`, `CheckEligibilityByDetails`, `CheckCriteria`, `Check*`, `CloneEligibleCollateralWithChangedTreatment`. Docs: `docs/eligible-collateral-representation.md` (1,024 lines) |
| 4 | Haircuts and valuation of posted collateral | **3** (defect) | yes | yes | – | none found | `CollateralValuationTreatment` (haircut, margin, FX, additional haircut). `PostedCreditSupportItemAmount` in `legaldocumentation-csa-func.rosetta` applies them — see Finding F1 |
| 5 | Concentration limits | **2** | yes | – | – | none found | `ConcentrationLimit`, `ConcentrationLimitCriteria`, `AverageTradingVolume`. No function references `ConcentrationLimit` |
| 6 | Threshold, MTA, Independent Amount, rounding | **3** | yes | yes (as inputs) | – | none found | Elections in CSA types; `IndependentAmount`, `CollateralRounding`; consumed by `DeliveryAmount` / `ReturnAmount` |
| 7 | Credit Support Amount, Delivery Amount, Return Amount | **3** (IM only) | yes | yes | – | none found | `legaldocumentation-csa-func.rosetta`: `CreditSupportAmount`, `DeliveryAmount`, `ReturnAmount`, `UndisputedAdjustedPostedCreditSupportAmount`. All `docReference` cite ISDA 2018 IM CSA; no separate VM 2016 or legacy calculation found |
| 8 | IM amount — standardised schedule (grid) | **3** | yes | yes | – | none found | `margin-schedule-func.rosetta` (~800 lines): `BuildStandardizedSchedule`, `GetGrossInitialMarginFromStandardizedSchedule`, `GetNetInitialMarginFromExposure`. Docs: `docs/standardized-functions.md` |
| 9 | IM amount — ISDA SIMM | **2** | elections + result field | – | – | – | `GeneralSimmElections`, `SimmVersion`, `SimmCalculationCurrency`, `SimmException`; `MarginCallExposure.simmIMExposure` holds a result. No calculation (SIMM is an ISDA-licensed methodology; likely out of scope *(inference)*) |
| 10 | Exposure (portfolio MTM) for VM | **2** | yes | – | – | – | `MarginCallExposure.overallExposure` (with a sum-check condition against SIMM + schedule IM). No function computes portfolio exposure |
| 11 | Margin call issuance and response | **2** | yes | – | – | – | `event-common-type.rosetta`: `MarginCallBase`, `MarginCallIssuance`, `MarginCallResponse`, `MarginCallResponseAction`, `MarginCallInstructionType`; enums `CallTypeEnum`, `MarginCallActionEnum`, `MarginCallResponseTypeEnum` (AgreeinFull / PartiallyAgree / Dispute). Outside their own definitions these types are referenced by no function, instruction or business event — see Finding F2 |
| 12 | Dispute | **2** | yes | disputed amounts as inputs | – | – | `DisputeResolution` elections (resolution time, recalculation of value); `MarginCallResponseTypeEnum.Dispute`; disputed amounts are inputs to Delivery/Return Amount. No dispute lifecycle |
| 13 | Collateral transfer and settlement | **2** | yes | – | – | – | `MarginCallResponseAction.collateralPositionComponent` (direction Delivery/Return). Generic `CalculateTransfer` / `ResolveTransfer` exist for trades; no path from a margin call response to a transfer instruction found |
| 14 | Substitution | **2** | yes | not for CSA | – | – | CSA: `SubstitutionProvisions`, `Substitution`. `Create_SubstitutionPrimitiveInstruction` exists but has `condition SecurityFinance` (repo / securities lending only; test data `functions/repo-and-bond/repo-substitution-*`) |
| 15 | Interest on cash collateral | **2** | yes | – | – | – | `CollateralInterestParameters`, `CollateralInterestCalculationParameters`, `CollateralAgreementFloatingRate`, `CollateralInterestHandlingParameters`, `CollateralInterestNotification`, `InterestAmountApplication`. No collateral-interest function *(name search)* |
| 16 | Collateral inventory, positions, balances | **2** | yes | – | – | – | `CollateralPortfolio`, `CollateralPosition`, `CollateralBalance`, `CollateralStatusEnum`. Used only by margin call types and repo substitution |
| 17 | Custody and segregation (IM) | **2** | yes (12 types) | – | – | 2 Euroclear samples (row 1) | `Custodian*`, `ControlAgreement*`, `CustodyArrangements` in `legaldocumentation-csa-type.rosetta` — legal terms only |
| 18 | Allocation and optimisation | **0** | – | – | – | – | Nothing found *(name search)* |
| 19 | Portfolio / collateral reconciliation | **0** | – | – | – | – | Nothing found *(name search)* |
| 20 | Regulatory reporting of margin | n/a | – | – | – | – | No reporting namespace in this repository; regulatory reporting rules are maintained in a separate project *(inference — to verify)* |

## Findings

**F1 — Additional haircut reads the FX haircut field.** In `legaldocumentation-csa-func.rosetta` line 24,
`PostedCreditSupportItemAmount` declares `alias additionalHaircutPercentage: postedItem -> fxHaircutPercentage`.
`PostedCreditSupportItem` has a separate `additionalHaircutPercentage` field (`legaldocumentation-csa-type.rosetta`
line 150). The FX haircut is therefore subtracted twice and the additional haircut is ignored. Present at 7.6.0 and
at `master` `40ce355` (2026-10-15).

**F2 — Margin call workflow is message types without lifecycle.** CDM can represent a margin call and its response
(including the dispute response), but no function, primitive instruction or business event creates or processes
them. The agreement side (rows 1–3) and the IM calculation side (rows 7–8) are not connected to the call workflow.

## Summary

CDM is strongest on the **documentation side** of the CSA (terms, amendments, eligibility, sample agreements) and has
executable **IM calculation** logic (Delivery/Return Amount, standardised schedule). The **operational lifecycle** —
margin calls, disputes, transfers, substitution, interest, inventory — is modelled as data types only. Allocation,
optimisation and reconciliation are absent. No unit tests were found for any collateral function.
