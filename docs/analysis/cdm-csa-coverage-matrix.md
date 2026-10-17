# CDM coverage of collateral management — ISDA credit support documents

Output of `task-cdm-current-state-analysis` (goal `goal-data-cdm-taxonomies-specs`).
Conceptual model of the same space, coloured by these scores: [`collateral-conceptual-model.md`](collateral-conceptual-model.md).

- **CDM version:** release `7.6.0`, commit `f685b4b45d8faa419425c018a52af66f40e43c0b` (2026-10-09), from
  [finos/common-domain-model](https://github.com/finos/common-domain-model) `rosetta-source/src/main/rosetta`.
- **Scope:** ISDA credit support documents only — 1994/1995 legacy CSA/CSD, 2016 VM CSA, 2016/2018 IM CSA/CSD,
  2019 Collateral Transfer Agreement and Security Agreement. Other agreement families (GMRA, GMSLA, triparty,
  CCP margin) are covered by `task-cdm-collateral-other-agreements`.
- **Status:** first pass. Evidence comes from type/function names, definitions read for the margin call, CSA
  calculation and eligibility rows, and the repository file listing. Rows marked *(name search)* were not read in
  full.


> **Release note (2026-10-17):** the project's base release moved from CDM 7.6.0 to 7.7.0. The 7.7.0 changes (six files,
> interest-rate reset instruction composition) touch no row of this matrix, so the scores hold for 7.7.0.

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
| 4 | Haircuts and valuation of posted collateral | **3** | yes | yes | – | none found | `CollateralValuationTreatment` (haircut, margin, FX, additional haircut). `PostedCreditSupportItemAmount` in `legaldocumentation-csa-func.rosetta` applies them |
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
| 21 | Exposure netting (trades in a netting set produce one exposure) *(added 2026-10-15)* | **0** | – | – | – | – | No netting-set type. `MarginCallExposure.overallExposure` holds an exposure that is already netted; no function aggregates trades into it *(name search for `Netting`)* |
| 22 | Settlement netting of collateral movements *(added 2026-10-15)* | **1** | – | – | – | – | Nothing for collateral movements. For trades only, `StandardSettlementStyleEnum.Net` / `StandardAndNet` / `PairAndNet` (`product-common-settlement-enum.rosetta` lines 51–55) |
| 23 | Close-out netting on default *(added 2026-10-15)* | **2** | elections | – | – | – | ISDA `MasterAgreement` elections `automaticEarlyTermination` and `terminationCurrency` (`legaldocumentation-master-isda-type.rosetta` lines 15–26); CSA `automaticSetOff` (`legaldocumentation-csa-type.rosetta` line 856). No close-out valuation or netting function. Trade compression (`Qualify_Compression`, `event-qualification-func.rosetta` line 139, with test data) reduces trades, not collateral, and is not scored here |
| 24 | Collateral proposal *(added 2026-10-16; split 2026-10-16)* | **2** | yes | – | – | – | `MarginCallResponseAction.collateralPositionComponent` (`event-common-type.rosetta` lines 769–772) carries the collateral the responding party will move, so a proposal can be expressed inside `MarginCallResponse`. ISO 20022 colr.007, FpML `requestCollateralAcceptance` (finding S1) |
| 25 | Collateral proposal acceptance or rejection *(added 2026-10-16)* | **0** | – | – | – | – | No type records the receiving party's acceptance or rejection of proposed assets *(name search: proposal, acceptance)*. The generic `WorkflowStep` has proposed / accepted / rejected states (`event-workflow-type.rosetta` lines 37–44; `Create_AcceptedWorkflowStep`, `event-workflow-func.rosetta` line 68), but needs an `EventInstruction`, and `PrimitiveInstruction` (`event-common-type.rosetta` line 45) has no margin call instruction (finding F2). ISO 20022 colr.008, FpML `collateralProposalStatus` |


## Flows and capabilities *(added 2026-10-16)*

The clickable UI (`ui-prototype/clickable.html`, decision `wp-adr-ux-scenario-grid`) is organised by flow. Each flow
uses several capability rows; its CDM coverage is the **weakest** score among them. Row 7 is executable for IM only,
so it counts as 2 for VM. Rows for repo, securities lending, triparty and CCP are mapped in
[`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md#flows-and-capabilities-added-2026-10-16).

| Flow (UI grid column) | ISDA IM: rows used | Weakest | ISDA VM: rows used | Weakest |
|---|---|---|---|---|
| Call → proposal → settle | 1, 3, 4, 5, 6, 7, 9, 11, 13, 16, 17, 24, 25 | **0** (25 proposal acceptance) | 1, 3, 4, 6, 7, 10, 11, 13, 16, 21, 24, 25 | **0** (21 exposure netting, 25 proposal acceptance) |
| Revaluation / top-up | 4, 6, 7, 9, 11, 16 | **2** | 4, 6, 7, 10, 11 | **2** |
| Return | 7, 11, 13, 17 | **2** | 7, 11, 13 | **2** |
| Substitution | 14 | **2** | 14 | **2** |
| Dispute | 12 | **2** | 12 | **2** |
| Default / enforcement | 17, 23 | **2** | 23 | **2** |
| Interest and income | 15 | **2** | 15 | **2** |
| Terms amendment | 2 | **4** | 2 | **4** |

Rows used by no flow: 8 (standardised IM schedule; an alternative to 9), 18 allocation and optimisation (inside the
proposal step when built), 19 reconciliation (the prototype replaces it with a shared on-chain record), 20 reporting
(out of scope), 22 settlement netting (inside the transfer step when several movements fall on one day).

## Findings

**F2 — Margin call workflow is message types without lifecycle.** CDM can represent a margin call and its response
(including the dispute response), but no function, primitive instruction or business event creates or processes
them. The agreement side (rows 1–3) and the IM calculation side (rows 7–8) are not connected to the call workflow.

F2 laid out as workflow steps:

| Workflow step | CDM can represent it | CDM function that produces it | Business event that carries it |
|---|---|---|---|
| Agreement terms (threshold, MTA, rounding) | yes (CSA elections) | n/a | yes (`Create_*CSATermsChange`) |
| Exposure calculation | yes (`MarginCallExposure`) | **no** | **no** |
| Call amount (Delivery/Return Amount) | yes | yes (`DeliveryAmount`, `ReturnAmount`, IM 2018 only) | **no** |
| Margin call issued | yes (`MarginCallIssuance`) | **no** | **no** |
| Response: agree, partially agree, dispute | yes (`MarginCallResponse`) | **no** | **no** |
| Dispute resolution | elections only | **no** | **no** |
| Collateral transfer | yes (`CollateralPosition` + direction) | **no** link from the response | **no** |
| Updated collateral balance | yes (`CollateralBalance`) | **no** | **no** |

Only the agreement terms and the Delivery/Return Amount calculation have executable logic, and the calculation
output is not passed into a call.

## Cross-check (method step 5)

Checked 2026-10-15 against CDM's own documentation (at 7.6.0), the Collateral Working Group issues and CDM
issue searches on GitHub. Accepted by the human on 2026-10-15. **No score changed.**

| Row(s) | External evidence | Effect |
|---|---|---|
| 2 Amendment of terms | Issue [#4486](https://github.com/finos/common-domain-model/issues/4486) "Event model change to support Legal Agreement Documentation Amendment Process": Agreement Event and `AgreementPrimitiveInstruction`, Major Release 7.0, closed via PR #4644 on 2026-06-24 | Confirms score 4 |
| 3 Eligibility | Issue [#5072](https://github.com/finos/common-domain-model/issues/5072) (open, milestone 8.0): "CDM already provides a strong foundation for deterministic collateral eligibility." Further criteria work is open: [#4211](https://github.com/finos/common-domain-model/issues/4211) (linked notes), [#4209](https://github.com/finos/common-domain-model/issues/4209), [#4210](https://github.com/finos/common-domain-model/issues/4210), [#4212](https://github.com/finos/common-domain-model/issues/4212) | Confirms score 5; criteria coverage still being extended |
| 1, 3 Samples | Issue [#5261](https://github.com/finos/common-domain-model/issues/5261) (open, 2026-10-08): "Update collateral examples to use latest serialisation standard" | Samples may not load unchanged in 7.6.0 tooling *(inference — to verify)* |
| 7, 8 Calculation | `docs/process-model.md` lists "Margin calculation" as in scope and states that a function's logic "may be *fully defined* or only *partially defined*", with unspecified parts being "functionality that firms are expected to implement" | Confirms scores 3; partial logic is by design |
| 11 Margin call (F2) | Working Group meeting [#3030](https://github.com/finos/common-domain-model/issues/3030) (2024-07-30) listed "margin call steps, issuance and response" as a workflow area where CDM may help. No issue found that proposes margin call functions or events | F2 is a known gap with no scheduled work; it is not declared out of scope |
| 14 Substitution | Same meeting: Acadia raised "the need for a message definition to communicate substitutions between parties"; the group agreed to continue the discussion | Confirms score 2 for CSA; demand recorded, nothing delivered |
| 20 Reporting | `docs/process-model.md` lists regulatory reporting as in scope but "covered in a different documentation section" | Consistent with n/a for this repository |
| 18, 19 Allocation, reconciliation | No Working Group or issue evidence found. "Allocation" in `docs/process-model.md` refers to trade allocation, not collateral allocation | Scores 0 stand |

Limits of this check: GitHub issue search was read through rendered pages (first page of results only), and the
GitHub release notes for 7.x were not reachable from this session. ISDA's CDM-for-collateral guide was not read.

## Summary

CDM is strongest on the **documentation side** of the CSA (terms, amendments, eligibility, sample agreements) and has
executable **IM calculation** logic (Delivery/Return Amount, standardised schedule). The **operational lifecycle** —
margin calls, disputes, transfers, substitution, interest, inventory — is modelled as data types only. Allocation,
optimisation and reconciliation are absent. No unit tests were found for any collateral function.
