# CDM 7.6.0 gap register for collateral management

Output of `task-cdm-gap-analysis` (goal `goal-cdm-development`). **Consolidation of existing analysis, no new
analysis of the CDM source.** Every gap below cites the finding, defect, capability row or blockchain consequence it
comes from; the evidence (files, line numbers, scores) stays in those documents. Gap closure is by **local extensions
in this repository only** (`wp-adr-cdm-local-extensions`); nothing is proposed to FINOS.

Sources:
[findings](../analysis/findings.md) (F2, M1–M5, S1–S4, TX1–TX5, O1–O3, O8–O12, X1–X3) ·
[defects](../analysis/defects.md) (D1–D16) ·
[CSA coverage matrix](../analysis/cdm-csa-coverage-matrix.md) (rows 1–25) ·
[other agreements matrix](../analysis/cdm-other-agreements-coverage-matrix.md) (R1–R25, S1–S27, T1–T16, C1–C18) ·
[blockchain applicability](../architecture/blockchain-applicability.md) §4 (B1–B5).
CDM release analysed: 7.6.0 (commit f685b4b). **Base release switched to 7.7.0 on 2026-10-17**: 7.7.0 changes six files, all
interest-rate reset instruction composition, so every gap here holds for 7.7.0 unchanged.

## How to read it

- **CDM score:** the lowest coverage score among the capability rows behind the gap (0 absent, 1 enum only, 2 data
  types, 3 functions, 4 events, 5 samples or tests).
- **Needed by:** the console scenarios (`console/src/scenarios/scenarios.ts`) or planned grid columns that rely on
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
| G15 | Close-out netting on default: elections only (CSA, GMSLA), absent for repo and CCP | rows 23, R20, R23, S19, S25, C12, C16 | 0–2 | im-default (close-out statement); VM default (planned) | P2 | types, functions |

### Substitution, interest, returns of lent securities

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G16 | Substitution works for repo and lending only (`condition SecurityFinance`) and is qualified as a renegotiation | row 14, C18, T8; D5; TX5 | 2 | substitution column (planned) | P2 | functions, events, replacement |
| G17 | Interest on cash collateral, lending rebate and manufactured payments are types only | rows 15, C11, S12, S20 | 2 | interest and income column (planned) | P2 | functions |
| G18 | Recall of lent securities has types only; full return collides with termination in qualification | S14; D4 | 2 | loan return / recall column (planned) | P2 | functions, replacement |
| G19 | Agreement terms amendment is missing for GMRA and has no GMSLA instruction | R2, S2 (row 2 is covered, score 4) | 0–2 | terms amendment column, repo and lending rows (planned) | P2 | events |

### Agreements outside ISDA

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G20 | GMRA terms cannot be represented (empty type, ISLA-only clause identifiers) | O1; R1 | 1 | repo row (planned) | P2 | types |
| G21 | GMSLA elections and clause library are used by no function or sample | O2; S1 | 2 | lending row (planned) | P2 | functions, samples |
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
| G26 | No mapping to ISO 20022 colr or FpML collateral messages; FpML collateral code lists bundled but unused | S1, TX2, B3 | 0 | off-chain messages between services (`service-to-peer-service`) | P2 | mapping |
| G27 | Four asset taxonomies without a mapping; three representation styles mixed | TX4, TX1 | – | eligibility schedules across taxonomies | P3 | mapping (start: `docs/analysis/collateral-asset-taxonomy-mapping.md`) |
| G28 | Financial Collateral Directive and SFTR not referenced; Collateral Asset Definitions at the 2003 edition; FISN, ELF, IBAN absent | S3, S4, S2 | – | none | P3 | enums, references |

### Quality and implementation

| ID | Gap | Sources | CDM score | Needed by | Priority | Closure kind |
|---|---|---|---|---|---|---|
| G29 | No unit tests for any collateral function | M1 | – | every extension (tests ship with it) | P1 | tests |
| G30 | Repo qualification rejects more than one interest payout; event samples without a qualifier | D7, D13 | – | repo row (planned) | P2 | replacement |
| G31 | Samples and documentation contradict the model (margin and haircut percentages, empty eligibility fields, bond labelled as cash) | D3, D6 | – | none | P3 | samples (local copies) |
| G32 | Misspelt enum values and attributes; literal `\t` and lost accents in descriptions | D9–D12 | – | none | P3 | none locally (renaming needs a CDM change); note only |
| G33 | Securities-lending settlement workflows are hand-written Java; buy/sell-back is qualification only | O11, O12 | – | none | P3 | none for now |
| G39 | The Python toolchain does not run CDM reliably: the package keeps placeholder types in nested types, `rune.runtime` fails on references, copies and dates, the generator emits Python that differs from Rune in eleven ways, and one CDM condition (`PriceQuantityTriangulation`) fails in CDM's own generated code. Worked around in the extension's runtime and Rune (2026-10-17); Java not yet evaluated | D14, D15, D16, X1 (context) | – | every extension and every scenario run through it | P1 | runtime workarounds, or another target language (decision open) |
| G34 | Collateral allocation and optimisation absent | row 18, R18, S16, T7 | 0 | proposal step (pledgor chooses assets by hand today) | P3 | functions |
| G35 | Reconciliation absent | row 19, R19, S22, T12, C13 | 0 | none: the shared ledger replaces reconciliation in the prototype | Out | none |
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
(`console/src/domain/engine.ts`), so closing it lets the engine's rules be expressed in CDM.

## Closure status

Local extension in [`../../cdm-ext/`](../../cdm-ext/) (`task-cdm-gap-closure`).

| Gap | Status | What exists |
|---|---|---|
| G2 | closed | `cdmx.collateral.proposal`: proposal, decision, status; coverage check; decide function |
| G1 | closed (proposed, for review) | `cdmx.collateral.margincall`: lifecycle state, steps, next-step function. `cdmx.collateral.event`: each step as a `CollateralEvent` (before and after state, instruction) with an `eventQualifier` from nine `Qualify_…` functions. An own event type, as CDM's `BusinessEvent` records trade states |
| G3 | partial | Agreed and disputed amounts recorded from the response; resolution not modelled |
| G4 | closed (proposed, for review) | Settlement only against an accepted proposal covering the agreed amount (return: within the agreed amount); the settlement event carries one CDM `TransferState` per position (pledgor → secured party on delivery, the reverse on return), passing CDM's own conditions. `transferType` stays absent: `UnscheduledTransferEnum` has no collateral value |
| G6 | closed | Return calls released without a proposal, within the agreed amount |
| G37, G38 | open | Found while closing G4 (findings X2, X3); the extension leaves `transferType` absent and reads pledge roles only |
| G39 | closed | Moved to Java (`wp-adr-java-cdm-stack`, 2026-10-18): CDM's Java distribution and the extension generated to Java run the 23 tests with no workarounds and with CDM's full validation; the Python build is retired (kept at commit `e1a2e6f` as a reproduction of D14–D16) |
| others | open | |

## Source index

Every source ID and where it went.

| Source | Gap | Source | Gap | Source | Gap |
|---|---|---|---|---|---|
| F2 | G1, G3, G4, G6 | D1 | G7 | B1 | G24 |
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

39 gaps: 15 P1 (G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G14, G24, G25, G29, G39), 12 P2, 9 P3, 3 out of scope. G37–G39 added 2026-10-17 during gap closure (proposed, for review).
