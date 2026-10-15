# Findings — CDM for collateral management

Consolidated list of findings from the analyses under goal `goal-data-cdm-taxonomies-specs`. Each finding keeps the
ID it has in its source document. CDM version for all findings: release `7.6.0`, commit `f685b4b`.

| Source document | Task | Finding IDs |
|---|---|---|
| [`cdm-csa-coverage-matrix.md`](cdm-csa-coverage-matrix.md) | `task-cdm-current-state-analysis` | F2, M1–M4 |
| [`collateral-standards-inventory.md`](collateral-standards-inventory.md) | `task-collateral-standards-inventory` | S1–S4 |
| [`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md) | `task-cdm-collateral-other-agreements` | O1–O12 (not yet reviewed) |

## Summary

| ID | Finding | Area | Status |
|---|---|---|---|
| F2 | Margin call workflow exists only as data types; no function, primitive instruction or business event creates or processes a margin call, response, dispute, transfer or balance update | Lifecycle | open |
| M1 | No unit tests found for any collateral function | Testing | open |
| M2 | Concentration limits are modelled as types but no function evaluates them against a portfolio | Eligibility | open |
| M3 | Delivery, Return and Credit Support Amount functions cite only the ISDA 2018 IM CSA; no separate VM 2016 or legacy calculation | Calculation | open |
| M4 | ISDA SIMM is represented by elections and a result field only; no calculation | Calculation | open (likely out of scope) |
| S1 | CDM has no mapping to ISO 20022 `colr` or FpML collateral process messages, which define the steps missing in F2 | Messaging standards | open |
| S2 | ISO identifiers are cited inconsistently; DTI, FISN, ELF and IBAN are absent | Identifiers | open |
| S3 | EMIR and CFTC eligible-collateral classes are encoded; Financial Collateral Directive and SFTR have no reference | Regulation | open |
| S4 | ISDA Collateral Asset Definitions are at the 2003 edition | Taxonomy | open |
| O1 | GMRA terms cannot be represented: `GlobalMasterRepoAgreement` has no attributes and the clause identifiers are ISLA-only | Repo agreement | proposed |
| O2 | GMSLA elections and clause library are modelled but used by no function, amendment instruction or sample | Sec lending agreement | proposed |
| O3 | Repo and lending trade lifecycle events are executable, but the collateral calculation behind them (GMRA Net Exposure, GMSLA marking) is absent | Repo, sec lending | proposed |
| O4 | Margin ratio direction is inconsistent between its definition, `SecurityFinanceCashSettlementAmount` and the repo sample | Repo calculation | proposed |
| O5 | Several repo and lending event samples are not qualified as the event they demonstrate (issue #5109; substitution qualifies as Renegotiation) | Event qualification | proposed |
| O6 | Repo and lending samples leave mandatory eligibility fields empty and set `collateralType: Cash` for a bond repo | Sample data | proposed |
| O7 | Repo product qualification accepts only one interest payout (issue #4692) | Product qualification | proposed |
| O8 | No agreement family has a margin call or margin maintenance workflow (F2 applies to all) | Lifecycle | proposed |
| O9 | Triparty appears only as a party role and one GMSLA clause | Triparty | proposed |
| O10 | CCP support covers trade clearing, not cleared margin | CCP | proposed |
| O11 | Securities-lending settlement workflows are hand-written Java, not Rune | Implementation | proposed |
| O12 | Buy/sell-back is qualification only; no sample sets `tradeType` | Repo | proposed |

## Details

### F2 — Margin call workflow is message types without lifecycle

**Observation.** `MarginCallBase`, `MarginCallIssuance`, `MarginCallResponse`, `MarginCallResponseAction`,
`MarginCallExposure` and `MarginCallInstructionType` (`event-common-type.rosetta`) are referenced by no function,
primitive instruction or business event outside their own definitions. The agreement terms (with amendment events)
and the Delivery/Return Amount calculation have executable logic, but the calculation output is not passed into a
call.

| Workflow step | CDM can represent it | CDM function produces it | Business event carries it |
|---|---|---|---|
| Agreement terms | yes | n/a | yes (`Create_*CSATermsChange`) |
| Exposure calculation | yes | no | no |
| Call amount (Delivery/Return Amount) | yes | yes (IM 2018 only) | no |
| Margin call issued | yes | no | no |
| Response: agree, partially agree, dispute | yes | no | no |
| Dispute resolution | elections only | no | no |
| Collateral transfer | yes | no link from the response | no |
| Updated collateral balance | yes | no | no |

**External context.** The CDM Collateral Working Group listed "margin call steps, issuance and response" as an area
where CDM may help (meeting of 2024-07-30, issue #3030). No CDM issue proposing margin call functions or events was
found. The gap is known but not scheduled, and not declared out of scope.

### M1 — No unit tests for collateral functions

**Observation.** The repository file listing shows no test file for `CheckEligibility*`, `DeliveryAmount`,
`ReturnAmount`, `CreditSupportAmount` or the standardised-schedule functions. Sample data exists for agreements (31
documents) and eligibility schedules (4), and one expected-output example for `CloneEligibleCollateralWithChangedTreatment`.
Based on file names, not on reading the test sources.

### M2 — Concentration limits are not evaluated

**Observation.** `ConcentrationLimit`, `ConcentrationLimitCriteria` and `AverageTradingVolume` exist in
`product-collateral-type.rosetta`. No function in any `*func*.rosetta` file references `ConcentrationLimit`.

### M3 — Amount calculations follow the IM CSA only

**Observation.** Every `docReference` on `CreditSupportAmount`, `DeliveryAmount`, `ReturnAmount` and
`UndisputedAdjustedPostedCreditSupportAmount` (`legaldocumentation-csa-func.rosetta`) cites the ISDA 2018 IM CSA.
No function cites the 2016 VM CSA or the legacy CSAs. Whether the IM functions can be used for VM was not tested.

### M4 — SIMM is not calculated

**Observation.** `GeneralSimmElections`, `SimmVersion`, `SimmCalculationCurrency`, `SimmException` and
`MarginCallExposure.simmIMExposure` exist; no SIMM calculation exists. **Inference:** SIMM is licensed by ISDA, so
this is likely outside CDM's scope. The SIMM input format (ISDA CRIF) is also not in CDM.

### S1 — No mapping to collateral message standards

**Observation.** CDM ingests only FpML confirmations (all `ingest-fpml-confirmation-*` files) and has no ISO 20022
reference. ISO 20022 `colr` defines margin call request and response (colr.003/004), cancellation (colr.005/006),
collateral proposal (colr.007/008), dispute notification (colr.009) and substitution request (colr.010). FpML
collateral processes define `requestMargin`, `marginCallStatus`, `requestCollateralAcceptance`,
`collateralProposalStatus`, `requestSubstitution` and `substitutionStatus`, based on the ISDA 2009 margin call
messaging standard.

**Relation to F2.** These messages cover the steps CDM models only as data types. Comparing CDM's margin call types
field by field with `colr.003`/`colr.004` and `requestMargin` would show what the CDM types lack. No task has been
created for this mapping.

### S2 — ISO identifiers cited inconsistently

**Observation.** LEI (ISO 17442), ISIN (ISO 6166), CFI (ISO 10962) and MIC (ISO 10383) name their ISO standard.
BIC (ISO 9362), UPI (ISO 4914) and UTI (ISO 23897) appear without the ISO number in the model; BIC and UPI are tied
to ISO numbers only in the FpML ingestion mappings. DTI (ISO 24165), FISN (ISO 18774), ELF (ISO 20275) and IBAN
(ISO 13616) are absent. DTI matters for tokenised collateral, an open CDM topic (issues #3995, #4956).

### S3 — Regulatory coverage is limited to margin rules and eligibility classes

**Observation.** `RegulatoryRegimeEnum` lists 12 margin regimes; `EU_EMIR_EligibleCollateralEnum`, UK EMIR and US
CFTC/prudential eligible-collateral classes are encoded. The EU Financial Collateral Directive (2002/47/EC) and SFTR
have no reference. Regulatory reporting rules are maintained outside the CDM repository.

### S4 — Collateral Asset Definitions edition

**Observation.** `CollateralAssetDefinitionsEnum` carries `docReference ISDA CollateralAssetDefinitions_2003`.
Whether a later edition exists was not checked.

### O1–O12 — Other agreement families

Evidence for each O-finding, with file and line references, is in
[`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md) § Findings. The O-series has
not yet been reviewed; its status is `proposed` until it is.

## Removed

F1 (a defect in `PostedCreditSupportItemAmount`) was removed from this analysis at the project owner's request on
2026-10-15.
