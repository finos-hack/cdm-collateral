# Findings — CDM for collateral management

Consolidated list of findings from the analyses under goal `goal-data-cdm-taxonomies-specs`. Defects in CDM itself (wrong or
self-contradictory model content, sample data or documentation) are listed separately in [`defects.md`](defects.md). Each finding keeps the
ID it has in its source document. CDM version for all findings: release `7.6.0`, commit `f685b4b`.

| Source document | Task | Finding IDs |
|---|---|---|
| [`cdm-csa-coverage-matrix.md`](cdm-csa-coverage-matrix.md) | `task-cdm-current-state-analysis` | F2, M1–M5 |
| [`collateral-standards-inventory.md`](collateral-standards-inventory.md) | `task-collateral-standards-inventory` | S1–S4 |
| [`collateral-taxonomy-inventory.md`](collateral-taxonomy-inventory.md) | `task-collateral-taxonomy-inventory` | TX1–TX5 |
| [`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md) | `task-cdm-collateral-other-agreements` | O1–O3, O8–O12 |
| [`../../cdm-ext/README.md`](../../cdm-ext/README.md) (found while building the local extension, CDM 7.7.0) | `task-cdm-gap-closure` | X1–X3 |

## Summary

| ID | Finding | Area | Status |
|---|---|---|---|
| F2 | Margin call workflow exists only as data types; no function, primitive instruction or business event creates or processes a margin call, response, dispute, transfer or balance update | Lifecycle | open |
| M1 | No unit tests found for any collateral function | Testing | open |
| M2 | Concentration limits are modelled as types but no function evaluates them against a portfolio | Eligibility | open |
| M3 | Delivery, Return and Credit Support Amount functions cite only the ISDA 2018 IM CSA; no separate VM 2016 or legacy calculation | Calculation | open |
| M4 | ISDA SIMM is represented by elections and a result field only; no calculation | Calculation | open (likely out of scope) |
| M5 | Exposure netting is not modelled in any agreement family: no netting-set type and no function nets trades into an exposure | Netting | open |
| S1 | CDM has no mapping to ISO 20022 `colr` or FpML collateral process messages, which define the steps missing in F2 | Messaging standards | open |
| S2 | ISO identifiers are cited inconsistently; DTI, FISN, ELF and IBAN are absent | Identifiers | open |
| S3 | EMIR and CFTC eligible-collateral classes are encoded; Financial Collateral Directive and SFTR have no reference | Regulation | open |
| S4 | ISDA Collateral Asset Definitions are at the 2003 edition | Taxonomy | open |
| TX1 | Taxonomies mix closed enums, open strings and one FpML coding scheme; closed enums need a release to change, open strings cannot be validated | Taxonomy | open |
| TX2 | Six FpML collateral reason code lists (and four other collateral code lists) are bundled but referenced by no model element | Taxonomy | open |
| TX3 | Credit ratings have no scale or order; `CheckAgencyRating` compares notations by string equality, so minimum-rating criteria cannot be evaluated | Taxonomy | open |
| TX4 | Eligible assets can be classified by four taxonomies (CDM asset types, ISDA Collateral Asset Definitions, EMIR/CFTC classes, CFI) with no mapping between them | Taxonomy | open |
| TX5 | Event taxonomies have no margin call, collateral transfer or (non-securities-finance) substitution entry | Taxonomy | open |
| O1 | GMRA terms cannot be represented: `GlobalMasterRepoAgreement` has no attributes and the clause identifiers are ISLA-only | Repo agreement | open |
| O2 | GMSLA elections and clause library are modelled but used by no function, amendment instruction or sample | Sec lending agreement | open |
| O3 | Repo and lending trade lifecycle events are executable, but the collateral calculation behind them (GMRA Net Exposure, GMSLA marking) is absent | Repo, sec lending | open |
| O8 | No agreement family has a margin call or margin maintenance workflow (F2 applies to all) | Lifecycle | open |
| O9 | Triparty appears only as a party role and one GMSLA clause | Triparty | open |
| O10 | CCP support covers trade clearing, not cleared margin | CCP | open |
| O11 | Securities-lending settlement workflows are hand-written Java, not Rune | Implementation | open |
| O12 | Buy/sell-back is qualification only; no sample sets `tradeType` | Repo | open |
| X1 | CDM's lifecycle events are trade-based: `BusinessEvent` records `TradeState`s and `Create_Transfer` builds transfers from a `TradeState`; a margin call has no trade, so no CDM event type records its steps | Lifecycle | open (extension: own event type, `wp-adr-cdm-collateral-events`) |
| X2 | `UnscheduledTransferEnum` has no value for a collateral delivery or a collateral return (its `Return` is the securities-lending return) | Taxonomy | open |
| X3 | `PartyRoleEnum` has `Pledgor` (New York law), `Chargor` (English law) and `SecuredParty`, but no transferor or transferee role for title-transfer collateral (English-law VM CSA); `RegIMRoleEnum` repeats pledgor and secured party with other spellings (`Secured`) | Parties | open |
| N1 | CDM has no asset type for a physical asset such as an aircraft (no airframe, engine or MSN identifier) and no agreement type for asset finance (aircraft mortgage or security agreement); a token backed by such an asset has nothing to point to | Assets | open |

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

### M5 — Exposure netting is not modelled

**Observation.** No `.rosetta` type or function represents a netting set or aggregates trades into one exposure
(name search for `Netting`). `MarginCallExposure.overallExposure` holds an exposure that is already netted. Settlement
netting and close-out netting exist only as GMSLA elections and ISDA Master Agreement / CSA elections, with no
function. Rows 21–23 of the CSA matrix and R21–23, S23–25, T13–15, C14–16 of the other-agreements matrix.

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

### TX1–TX5 — Taxonomies

Evidence for each is in [`collateral-taxonomy-inventory.md`](collateral-taxonomy-inventory.md) § Findings.

### O1–O3, O8–O12 — Other agreement families

Evidence for each O-finding, with file and line references, is in
[`cdm-other-agreements-coverage-matrix.md`](cdm-other-agreements-coverage-matrix.md) § Findings.

### X1–X3 — Found while building the local extension (CDM 7.7.0)

**X1.** `cdm/event/common` (`event-common-type.rosetta`): `BusinessEvent extends EventInstruction` has
`after TradeState (0..*)`; `AgreementEvent` records `LegalAgreement` changes; `CounterpartyPositionBusinessEvent`
records trade positions. `Create_Transfer` takes a `TradeState`. `TransferState` itself needs no trade, so the
extension uses CDM's `TransferState` for settlement and its own `CollateralEvent` for the steps.

**X2.** `product-common-settlement-enum.rosetta`, `UnscheduledTransferEnum`: Recall, Return, Assignment,
BrokerageCommission, Increase, Novation, PartialTermination, Premium, Renegotiation, Termination, and others; none
describes a margin delivery or the return of excess collateral. The extension leaves `transferType` absent.

**X3.** `base-staticdata-party-enum.rosetta`, `PartyRoleEnum`: `Pledgor` "provides credit support under New York
Law", `Chargor` "under English Law", `SecuredParty` "receives credit support under New York or English Law". No
value names the parties of a title transfer. `event-common-enum.rosetta`, `RegIMRoleEnum`: `Pledgor`, `Secured`. The
extension reads `Pledgor` and `SecuredParty` only.

### N1 — Non-financial collateral (CDM 7.7.0, 2026-11-21)

**N1.** Found under `goal-tokenized-collateral` while working through a worked case: an aircraft pledged to a lender
for a $100M loan, and tokens issued on the SPV that holds it. `base-staticdata-asset-common-type.rosetta`, `Asset`:
a choice of `Cash`, `Commodity`, `DigitalAsset` (which "excludes the digital representation of other Assets") and
`Instrument` (`ListedDerivative`, `Loan`, `Security`). No choice holds a physical asset. `AssetIdTypeEnum` has
security, exchange and vendor codes (ISIN, CUSIP, FIGI, SEDOL and others) and `Other`; no manufacturer serial number
(MSN), engine serial number or registration mark. `AssetTypeEnum` (eligibility): Security, Cash, Commodity,
ListedDerivative, Loan, LetterOfCredit, Other. `legaldocumentation-common-enum.rosetta`, `LegalAgreementTypeEnum`:
BrokerConfirmation, Confirmation, CreditSupportAgreement, MasterAgreement, MasterConfirmation, SecurityAgreement
(related to a CTA), Other; no aircraft mortgage or asset-finance security agreement. No reference to the Cape Town
Convention, its Aircraft Protocol or the International Registry anywhere in the model. The loan itself can be held as
`Instrument -> Loan`; the aircraft, its mortgage and the link from a token to the aircraft cannot.


## Moved to defects.md

F1 (CSA matrix) and O4–O7 (other-agreements analysis) were removed from the findings at the project owner's request on
2026-10-15 and, on a later request the same day, recorded as defects in [`defects.md`](defects.md): F1 → D1,
O4 → D2 and D3, O5 → D4, D5 and D13, O6 → D6, O7 → D7. The rating comparison in TX3 is also recorded as D8.
