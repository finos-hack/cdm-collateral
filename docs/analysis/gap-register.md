# CDM 7.6.0 gap register for collateral management

Output of `task-cdm-gap-analysis` (goal `goal-cdm-development`). **Consolidation of existing analysis, no new
analysis of the CDM source.** Every gap below cites the finding, defect, capability row or blockchain consequence it
comes from; the evidence (files, line numbers, scores) stays in those documents. Gap closure is by **local extensions
in this repository only** (`wp-adr-cdm-local-extensions`); nothing is proposed to FINOS.

Sources:
[findings](findings.md) (F2, M1–M5, S1–S4, TX1–TX5, O1–O3, O8–O12, X1–X3) ·
[defects](defects.md) (D1–D16) ·
[CSA coverage matrix](cdm-csa-coverage-matrix.md) (rows 1–25) ·
[other agreements matrix](cdm-other-agreements-coverage-matrix.md) (R1–R25, S1–S27, T1–T16, C1–C18) ·
[blockchain applicability](../architecture/blockchain-applicability.md) §4 (B1–B5).
CDM release analysed: 7.6.0 (commit f685b4b). **Base release switched to 7.7.0 on 2026-10-17**: 7.7.0 changes six files, all
interest-rate reset instruction composition, so every gap here holds for 7.7.0 unchanged.

## How to read it

- **CDM score:** the lowest coverage score among the capability rows behind the gap (0 absent, 1 enum only, 2 data
  types, 3 functions, 4 events, 5 samples or tests).
- **Needed by:** the console scenarios (`../../console/src/scenarios/scenarios.ts`) or planned grid columns that rely on
  the gap being closed. A scenario that "needs" a gap currently does that step in the prototype's own rule engine,
  outside CDM.
- **Priority:** **P1** needed by a built scenario (ISDA IM and VM rows); **P2** needed by a planned grid cell;
  **P3** quality or breadth with no scenario depending on it; **Out** out of scope for local extension.
- **Closure kind:** what a local extension would add: *types*, *functions*, *events* (primitive instruction, business
  event, qualification), *replacement* (a corrected function under a new name, since CDM's own cannot be edited in
  place), *mapping*, or *tests*.

## Register

### Margin call lifecycle

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G1 | Margin call issuance and response have types but no function, primitive instruction or business event; no event qualification | F2, O8, TX5, B2; rows 11, R7, S7, C7 | 2 | all seven scenarios | P1 | functions, events |
| G2 | Collateral proposal has no dedicated type; acceptance or rejection has nothing | rows 24, 25, R24/R25, S26/S27; S1 (colr.007/008) | 0 | im-call, im-dispute, im-reval, vm-call | P1 | types, functions, events |
| G3 | Dispute is an enum value and elections; no dispute record, reason codes unused, no resolution step | row 12, R9, S8; F2; TX2 (dispute reason code list) | 2 | im-dispute | P1 | types, functions |
| G4 | No link from an agreed response or accepted proposal to a collateral transfer | row 13, C10; F2 | 2 | im-call, im-reval, vm-call, vm-return | P1 | functions, events |
| G5 | Collateral positions and balances are not updated by any function | row 16, R16, S17, T10 | 2 | all IM and VM scenarios | P1 | functions |
| G6 | Return of excess collateral is a call direction in the types only | rows 7, 11, 13; F2 | 2 | im-return, vm-return | P1 | functions (with G1, G4) |
| G37 | No CDM transfer type for a collateral delivery or return; settlement transfers carry no `transferType` | X2 | 1 | none (transfers are recorded without it) | P3 | types |
| G38 | No party roles for title-transfer collateral; payer and receiver of a VM transfer under an English-law CSA cannot be named by role (pledge roles only) | X3 | 1 | vm-call, vm-return if modelled as title transfer | P2 | types |

### Valuation and calculation

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G7 | Additional haircut reads the FX haircut field (FX haircut applied twice, additional haircut never) | D1; row 4 | 3, defective | every valuation after haircut | P1 | replacement, tests |
| G8 | Concentration limits are never evaluated | M2; rows 5, R5, S5, T5 | 2 | im-dispute (rejected proposal) | P1 | functions |
| G9 | Delivery, Return and Credit Support Amount follow the 2018 IM CSA only; nothing for the 2016 VM CSA | M3; row 7 (IM only), row 10 | 2 for VM | vm-call, vm-return | P1 | functions |
| G10 | Exposure netting is not modelled: no netting set, no function that nets trades into one exposure | M5; rows 21, R21, S23, T13, C14 | 0 | vm-call | P1 | types, functions |
| G11 | Rating eligibility compares notations by text; ratings have no scale or order | TX3, D8; row 3 | 5 (row 3), defective | planned rating-based eligibility | P2 | types, replacement |
| G12 | Repo net exposure (GMRA ¶4) and lending marking (GMSLA ¶5) are not calculated; repo margin ratio is inverted | O3, D2; R6, R7, S6, S7 | 2 | repo and lending call / revaluation (planned) | P2 | functions, replacement |
| G13 | ISDA SIMM is an input field only | M4; row 9 | 2 | IM call amount (taken as input) | Out | none: the IM amount comes from a risk engine |

### Custody, default and close-out

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G14 | Custody and segregation are legal terms only; no enforcement step against segregated IM | row 17; ADR `wp-adr-im-segregation` | 2 | im-default | P1 | functions, events |
| G15 | Close-out netting on default: elections only (CSA, GMSLA), absent for repo and CCP | rows 23, R20, R23, S19, S25, C12, C16 | 0–2 | im-default (close-out statement); VM default (planned); repo: `cdm-ext` GMRA close-out statement, task-map row C11 (2026-11-11, `wp-adr-repo-default-close-out`) | P2 | types, functions |

### Substitution, interest, returns of lent securities

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G16 | Substitution works for repo and lending only (`condition SecurityFinance`) and is qualified as a renegotiation | row 14, C18, T8; D5; TX5 | 2 | substitution column (planned) | P2 | functions, events, replacement |
| G17 | Interest on cash collateral, lending rebate and manufactured payments are types only | rows 15, C11, S12, S20 | 2 | interest and income column (planned) | P2 | functions |
| G18 | Recall of lent securities has types only; full return collides with termination in qualification | S14; D4 | 2 | loan return / recall column (planned) | P2 | functions, replacement |
| G19 | Agreement terms amendment is missing for GMRA and has no GMSLA instruction | R2, S2 (row 2 is covered, score 4) | 0–2 | terms amendment column; repo: `cdm-ext` `GmraTermsAmendment` (task-map row C1); lending: `cdm-ext` `GmslaTermsAmendment` (task-map row C12, 2026-11-11) | P2 | events |

### Agreements outside ISDA

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G20 | GMRA terms cannot be represented (empty type, ISLA-only clause identifiers) | O1; R1 | 1 | repo row (planned) | P2 | types |
| G21 | GMSLA elections and clause library are used by no function or sample | O2; S1 | 2 | lending: CDM's GMSLA elections held as is in `cdm-ext` `GmslaTerms` with the elections CDM lacks, task-map row C12 (2026-11-11, `wp-adr-gmsla-terms`); the clause library is not used | P2 | functions, samples |
| G22 | Triparty: party role and one clause only; no agent valuation, allocation or settlement | O9; T1, T6, T7, T9 | 0–1 | triparty row (planned) | P3 | types, functions |
| G23 | CCP: trade clearing only; no CCP margin model, default management or porting | O10; C1, C5, C12 | 0–1 | CCP row (planned) | P3 | types, functions |

### Tokenized collateral and the ledger

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G24 | No identity for a tokenized asset: no DTI (ISO 24165), network, token contract, token standard, or which record is legally authoritative; `DigitalAsset` excludes tokenized assets | B1, B5, S2; ASR `concept-asr-onchain-asset-identity` | 0 | all IM and VM scenarios (tUST, tMMF, tUSD) | P1 | types |
| G25 | No reference from a CDM event or margin call to the ledger record (transaction, block, content hash) | B2; ADR `wp-adr-margin-call-state-onchain`, ASR `concept-asr-onchain-call-state` | 0 | all scenarios | P1 | types |

### Messaging, taxonomies, regulation

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G26 | No mapping to ISO 20022 colr or FpML collateral messages; FpML collateral code lists bundled but unused | S1, TX2, B3 | 0 | off-chain CDM documents between services (`service-to-payload-store`, ADR `wp-adr-cdm-payload-carrier`); business case S8. **Deferred** (`nw-defer-message-standard-mapping`) | P2 | mapping |
| G27 | Four asset taxonomies without a mapping; three representation styles mixed | TX4, TX1 | – | eligibility schedules across taxonomies | P3 | mapping (start: `collateral-asset-taxonomy-mapping.md`) |
| G28 | Financial Collateral Directive and SFTR not referenced; Collateral Asset Definitions at the 2003 edition; FISN, ELF, IBAN absent | S3, S4, S2 | – | none | P3 | enums, references |

### Quality and implementation

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G29 | No unit tests for any collateral function | M1 | – | every extension (tests ship with it) | P1 | tests |
| G30 | Repo qualification rejects more than one interest payout; event samples without a qualifier | D7, D13 | – | repo row (planned) | P2 | replacement |
| G31 | Samples and documentation contradict the model (margin and haircut percentages, empty eligibility fields, bond labelled as cash) | D3, D6 | – | none | P3 | samples (local copies) |
| G32 | Misspelt enum values and attributes; literal `\t` and lost accents in descriptions | D9–D12 | – | none | P3 | none locally (renaming needs a CDM change); note only |
| G33 | Securities-lending settlement workflows are hand-written Java; buy/sell-back is qualification only | O11, O12 | – | none | P3 | buy/sell-back: `cdm-ext` income deduction and Sell Back Price, task-map row C10 (2026-11-11, `wp-adr-repo-buy-sell-back`); securities lending: none for now |
| G39 | The Python toolchain does not run CDM reliably: the package keeps placeholder types in nested types, `rune.runtime` fails on references, copies and dates, the generator emits Python that differs from Rune in eleven ways, and one CDM condition (`PriceQuantityTriangulation`) fails in CDM's own generated code. Worked around in the extension's runtime and Rune (2026-10-17); Java not yet evaluated | D14, D15, D16, X1 (context) | – | every extension and every scenario run through it | P1 | runtime workarounds, or another target language (decision open) |
| G34 | Collateral allocation and optimisation absent | row 18, R18, S16, T7 | 0 | proposal step (pledgor chooses assets by hand today) | P3 | functions |
| G35 | Reconciliation absent | row 19, R19, S22, T12, C13 | 0 | none today; a shared ledger reduces but does not remove reconciliation (business case V6). Back in scope 2026-11-07: records against the chain and trade portfolios between the parties (`wp-adr-reconciliation-scope`) | P3 | types, functions |
| G36 | Regulatory reporting of margin not in this repository | row 20 | n/a | none | Out | none |

## P1 summary: what the built scenarios need

| Area | Gaps | What the extension adds |
|---|---|---|
| Lifecycle | G1, G2, G3, G4, G5, G6 | Instructions, functions and business events for: issue call, respond (agree, partially agree, dispute), propose collateral, accept or reject proposal, settle (pledge or transfer), return; balance update; qualification of each event |
| Valuation | G7, G8, G9, G10 | Corrected haircut valuation; concentration limit evaluation; VM Delivery / Return Amount; netting set and exposure aggregation |
| Default | G14 | Enforcement against segregated IM |
| Ledger | G24, G25 | Tokenized asset identity; ledger reference on events and calls |
| Tests | G29 | Unit tests for every extension function |
| Toolchain | G39 | Closed: CDM and the extension on Java (`wp-adr-java-cdm-stack`) |

The P1 set matches the steps the console's rule engine performs today outside CDM
(`../../console/src/domain/engine.ts`), so closing it lets the engine's rules be expressed in CDM.

## Closure status

Local extension in [`../../cdm-ext`](../../cdm-ext/) (`task-cdm-gap-closure`).

| Gap | Status | What exists |
|---|---|---|
| G2 | closed | `cdmx.collateral.proposal`: proposal, decision, status; coverage check; decide function |
| G1 | closed (proposed, for review) | `cdmx.collateral.margincall`: lifecycle state, steps, next-step function. `cdmx.collateral.event`: each step as a `CollateralEvent` (before and after state, instruction) with an `eventQualifier` from nine `Qualify_…` functions. An own event type, as CDM's `BusinessEvent` records trade states |
| G3 | closed (proposed, for review) | Agreed and disputed amounts recorded from the response. `cdmx.collateral.dispute` (2026-11-04): `Create_Dispute` records a `Dispute` next to the margin call from the call's own amounts (disputing party, subject Amount or Value, reason, Resolution Time); `ResolveDispute` resolves it by agreement or, after the Resolution Time, by recalculation, at an amount between the agreed and the called amount, and states the additional amount still due through a new call (ISDA CSA Paragraph 5). The recalculation itself (quotations, SIMM rerun, revaluation) is the caller's; the FpML dispute reason code lists (TX2) are not used, the reason is free text. `DisputeTest` (11 tests) |
| G4 | closed (proposed, for review) | Settlement only against an accepted proposal covering the agreed amount (return: within the agreed amount); the settlement event carries one CDM `TransferState` per position (pledgor → secured party on delivery, the reverse on return), passing CDM's own conditions. `transferType` stays absent: `UnscheduledTransferEnum` has no collateral value |
| G5 | closed (proposed, for review) | `cdmx.collateral.portfolio` (2026-11-03): `ApplyCollateralEvent` keeps CDM's `CollateralPortfolio` up to date from each `CollateralEvent`. Only a settlement changes it: a delivery adds the accepted proposal's positions and value after haircuts; a return removes the released positions and value. Positions are netted per asset with status `SettledAmount`; one `CollateralBalance` (post-haircut, settled, payer the pledgor, receiver the secured party). Releasing more of an asset than is held is rejected. `PortfolioTest` (8 tests) |
| G6 | closed | Return calls released without a proposal, within the agreed amount |
| G7 | closed (proposed, for review) | `cdmx.collateral.valuation` (2026-11-03): `CorrectedPostedCreditSupportItemAmount` reads `additionalHaircutPercentage` (D1) and counts an absent FX or additional haircut as zero. Because Rune calls functions by name, `CorrectedUndisputedAdjustedPostedCreditSupportAmount`, `CorrectedDeliveryAmount` and `CorrectedReturnAmount` restate CDM's three callers on top of it; `CreditSupportAmount` is CDM's own. `ValuationTest` (10 tests) shows CDM's function giving 8.2m where 8.5m is correct |
| G8 | closed (proposed, for review) | `cdmx.collateral.concentration` (2026-11-03): `ConcentrationLimitBreaches` evaluates the `ConcentrationLimit`s of a CDM `EligibleCollateralSpecification` against the collateral held and proposed together, on the value after haircuts. A limit applies to the collateral matching its criteria (CDM `CheckCriteria` on an `EligibilityQuery` per position), narrowed by the limit's own criteria; percentage and value limits, both bounds, inclusive or not; types Asset and Issuer per asset or issuer, untyped over the matching collateral. Limit types that need market data (exchange, sector, issue size, market capitalisation, outstanding balance, trading volume) are rejected. `ConcentrationTest` (10 tests) |
| G9 | closed (proposed, for review) | `cdmx.collateral.valuation` (2026-11-03): `CreditSupportAmountVM` (Exposure less any Threshold, zero if negative), `DeliveryAmountVM` (rounded up) and `ReturnAmountVM` (rounded down), zero below the MTA, disputed amounts deducted; the credit support held is valued with the G7 functions. `VariationMarginTest` |
| G10 | closed (proposed, for review) | `cdmx.collateral.exposure` (2026-11-03): `NettingSet` (one mark-to-market value per transaction from a valuation party, Base Currency Equivalents) and `NettedExposure` (the secured party's Exposure: the sum, sign flipped for the counterparty). FX conversion and close-out netting (G15) are not covered. `VariationMarginTest` (14 tests with G9) |
| G14 | closed (proposed, for review) | `cdmx.collateral.enforcement` (2026-11-03): `Create_CollateralEnforcement` records the secured party's enforcement against the segregated collateral as a `CollateralEnforcement` event (qualifier `CollateralEnforced`): the positions taken leave CDM's `CollateralPortfolio`, their value after haircuts leaves the balance, and one `TransferState` per position moves them from the pledgor to the secured party. Allowed only when the Defaulting Party (`DefaultNotice`, ISDA 2002 MA Section 5(a)) is the portfolio's pledgor, the secured party enforces, the custodian or control contract has given it exclusive control, and an Enforcement Event has occurred under CDM's `SecurityAgreementElections -> enforcementEvent` (`EnforcementEventOccurred`: an Early Termination Date reached, or with `failureToPay` elected a notified Failure to Pay or Deliver). The realised value feeds `CloseOutNetting` (G15). Sale, appropriation and the custodian's own steps are not modelled. `EnforcementTest` (14 tests) |
| G15 | partial (proposed, for review) | `cdmx.collateral.closeout` (2026-11-03): ISDA 2002 MA only. `EarlyTerminationAmount` nets the Close-out Amounts and the Unpaid Amounts both ways (Section 6(e)(i), Non-defaulting Party determining); `CloseOutNetting` returns a `CloseOutStatement`. Collateral held from the Defaulting Party is applied after the Early Termination Amount under security interest (surplus returned), or enters it as an Unpaid Amount owed to the Transferor under title transfer. Amounts in the Termination Currency. Open: GMRA, GMSLA and CCP close-out; Section 6(e)(ii) (Termination Events); `CloseOutTest` (10 tests) |
| G16 | partial (proposed, for review) | `cdmx.collateral.substitution` (2026-11-03): ISDA CSA substitution (Paragraph 4(d)) as its own lifecycle over CDM's `CollateralPortfolio`. `Create_CollateralSubstitution` applies request, consent and settlement steps and records each as a `CollateralSubstitution` event; consent is needed only where the pledgor's CDM `SubstitutionPartyElection -> needsConsent` says so (`SubstitutionNeedsConsent`). The original items must be held and worth no more than the substitute; on settlement the substitute moves pledgor to secured party, the original items move back, and the portfolio and balance are updated. `Qualify_CollateralSubstituted` replaces CDM's `Qualify_Substitution` for CSA collateral, so the event is no longer a Renegotiation (D5). Both legs settle on the event date. Open: substitution by a triparty agent (T8) and at a CCP (C18); CDM's repo and lending substitution keeps its own qualification. `SubstitutionTest` (10 tests) |
| G17 | partial (proposed, for review) | `cdmx.collateral.interest` (2026-11-06): interest on cash collateral under an ISDA CSA, one currency and one Interest Period, on CDM's `CollateralInterestParameters`. `CollateralInterestRate` gives the day's rate: the fixed rate, or the observed rate bounded by the floor and cap plus the spread (dropped when compressible and the rate is not positive), floored at zero unless negative interest is elected. `CollateralInterestAccrual` accrues each day's balance at that rate and the day count fraction for one day. `Create_CollateralInterestStatement` sums the days, rounds daily or at period end, deducts withholding tax, writes off an amount below the write-off limit, and splits the Interest Amount into the part transferred and the part that adjusts the posted collateral: by the handling election (Transfer, Adjust, Transfer_or_Adjust with the rollover limit) and the Interest Amount alternative (Standard: transferred only within the Credit Support excess; TransferIfDeliveryAmountBelowMTA). A negative amount is payable by the pledgor. Open: compounding, dated spread, floor and cap steps, the ActualAmountReceived and Other alternatives, payment dates and notification; lending rebate and manufactured payments (C11, S12, S20). `InterestTest` (21 tests) |
| G24 | closed (proposed, for review) | `cdmx.collateral.ledger` (2026-11-04): `TokenizedAsset` links a CDM `Asset` to its token: `LedgerNetwork` (name, platform, chain id), contract address, `TokenStandardEnum`, decimals, ISO 24165 DTI, and `AuthoritativeRecordEnum` (Bearer, Registered, Claim) with the record keeper when the ledger is not authoritative. `TokenForAsset` and `AssetForToken` map between them. The DTI format is not checked (Rune has no pattern match). `LedgerTest`. Open: settlement and enforcement do not yet depend on the authoritative record; a Registered or Claim asset needs the record keeper's confirmation, rule pending the SME (`task-sme-registered-asset-completion`) |
| G25 | closed (proposed, for review) | Redesign 2026-11-04 (`nw-ledger-anchor-redesign`; the first design was rejected for reversing `concept-asr-onchain-call-state` and rewriting existing records). `cdmx.collateral.ledger`: `LedgerAnchor` is an append-only record, separate from the CDM record it anchors: record kind and identifier, the keccak256 hash of the record's instruction (`MarginCallInstruction`, `EnforcementInstruction` or `SubstitutionInstruction`), and the `LedgerTransaction`s (contract events, each Mined, Final or Reverted) that carry the hash or share its transaction. `Create_LedgerAnchor` builds it from chain events, so both parties build the same anchor; `AnchorStatus` reports Missing, Pending, Complete or Failed, and `MarginCallStepAnchorStatus` does so for an applied step. CDM events and states hold no ledger data. `TransferComplete` also needs a `RecordKeeperConfirmation` for Registered and Claim tokens (provisional, `task-sme-registered-asset-completion`). The collateral service builds the anchors of each folded step from the gateway's step events (`CdmAnchors`, `cdm-state` reports `anchors`, `anchored` and `anchorHash`); the live specs check that both parties' anchors are Complete and equal. `LedgerTest` (16 tests with G24), `CdmAnchorsTest` (5) |
| G29 | closed (proposed, for review) | Every extension function runs in the tests (120 in 12 classes, 2026-11-04): each entry function is called directly; helpers (`Apply*`, `Qualify_*`, `HeldQuantity`, `NetCollateralPosition`, `Create_CollateralTransfer` and others) are checked through the entry functions' results |
| G34 | partial (proposed, for review) | `cdmx.collateral.allocation` (2026-11-07): `AllocateCollateral` fills an agreed amount from the pledgor's ranked inventory (`AllocationCandidate`: holding, unit price, eligibility, haircut), eligible assets only, in rank order, the last asset rounded up to whole units; no positions when the inventory cannot cover the amount (`wp-adr-allocation-scope`). Not covered: optimisation by cost, concentration limits; the default ranking awaits `task-sme-allocation-ranking`. Prototype: `flow-allocation` suggests the basket off-chain |
| G35 | partial (proposed, for review) | `cdmx.collateral.reconciliation` (2026-11-07): `ReconcilePortfolios` matches the two parties' trade snapshots by UTI (trade missing on one side, key economic terms, valuations offsetting within a tolerance) and states each party's exposure; `ReconcileWithLedger` compares a party's record facts with the ledger's (`wp-adr-reconciliation-scope`). Not covered yet: the key terms and tolerance await `task-sme-reconciliation-rules`; products other than interest rate swaps compare on product, notional and UTI only; escrow positions are rebuilt from records only since the pair's last enforcement or close-out, and calls recorded before 2026-11-07 state every call as RegIM and no returned margin type. Prototype: `flow-reconciliation` built 2026-11-07 (snapshot and result hashes on the `PortfolioReconciliation` contract; a dispute can cite a run) |
| G26 | deferred | Deferred by the project owner on 2026-11-10 (`nw-defer-message-standard-mapping`): the first goal is a proof of concept of CDM over Besu, and mapping from a message standard to CDM is important, even critical, but trivial. No task; the prototype's parties exchange CDM documents, not `colr` or FpML messages. Business case criterion S8 waits for it |
| G37, G38 | open | Found while closing G4 (findings X2, X3); the extension leaves `transferType` absent and reads pledge roles only |
| G39 | closed | Moved to Java (`wp-adr-java-cdm-stack`, 2026-10-18): CDM's Java distribution and the extension generated to Java run the 23 tests with no workarounds and with CDM's full validation; the Python build is retired (kept at commit `e1a2e6f` as a reproduction of D14–D16) |
| others | open | |

## Source index

Every source ID and where it went.

| Source | Gap | Source | Gap | Source | Gap |
|---|---|---|---|---|---|
| F2 | G1, G3, G4, G6 | D1, D17 | G7 | B1 | G24 |
| M1 | G29 | D2 | G12 | B2 | G1, G25 |
| M2 | G8 | D3 | G31 | B3 | G26 |
| M3 | G9 | D4 | G18 | B4 | none (FINOS smart-contract taskforce; context) |
| M4 | G13 | D5 | G16 | B5 | G24 |
| M5 | G10 | D6 | G31 | O1 | G20 |
| S1 | G2, G26 | D7 | G30 | O2 | G21 |
| S2 | G24, G28 | D8 | G11 | O3 | G12 |
| S3 | G28 | D9–D12 | G32 | O8 | G1 |
| D14, D15, D16 | G39 | X1 | G1 (context) | X2 | G37 |
| X3 | G38 | | | | |
| S4 | G28 | D13 | G30 | O9 | G22 |
| TX1 | G27 | TX4 | G27 | O10 | G23 |
| TX2 | G3, G26 | TX5 | G1, G16 | O11, O12 | G33 |
| TX3 | G11 | | | | |

Capability rows scored 0–2 are listed in the Sources column of the gap they belong to. Rows scored 3–5 with no
defect (for example row 1 agreement terms 5, row 3 eligibility 5, R11 repo substitution 5) are not gaps.

## Totals

39 gaps: 15 P1 (G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G14, G24, G25, G29, G39), 12 P2, 10 P3, 2 out of scope (G35 moved from out of scope to P3 on 2026-11-07). G37–G39 added 2026-10-17 during gap closure (proposed, for review).
