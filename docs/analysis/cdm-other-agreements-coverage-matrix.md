# CDM coverage of collateral management: repo, securities lending, triparty, CCP margin

Output of `task-cdm-collateral-other-agreements` (goal `goal-data-cdm-taxonomies-specs`). Companion to
[`cdm-csa-coverage-matrix.md`](cdm-csa-coverage-matrix.md), which covers ISDA credit support documents.

- **CDM version:** release `7.6.0`, commit `f685b4b45d8faa419425c018a52af66f40e43c0b`, from
  [finos/common-domain-model](https://github.com/finos/common-domain-model). Sparse checkout widened to
  `rosetta-source/src/main/resources/functions`, `examples/samples`, `rosetta-source/src/test`, `tests`,
  `rosetta-source/src/main/java/cdm/security`.
- **Scope:** four agreement families outside ISDA credit support documents:
  1. Repo: ICMA GMRA, including buy/sell-back.
  2. Securities lending: ISLA GMSLA (title transfer and pledge), including collateral schedules.
  3. Triparty collateral arrangements: triparty agents, collateral profiles and baskets, allocation by the agent.
  4. CCP and cleared margin: house and client IM and VM, clearing members, CCP margin calls.
- **Status:** first pass. Not cross-checked against release notes or working group scope; the CSA matrix's method
  step 5 is still to do.
- **Evidence basis:**
  - Read in full: the Rune definitions named in the matrices (`legaldocumentation-master-*.rosetta`, the repo
    and securities-lending functions in `event-common-func.rosetta`, the qualification functions in
    `event-qualification-func.rosetta` and `product-qualification-func.rosetta`, `product-collateral-type.rosetta`
    lines 1–165).
  - Scanned with scripts: the function test data in `resources/functions/repo-and-bond` (60 files) and
    `resources/functions/sec-lending` (event qualifiers, product qualifiers, haircut fields, transfer history).
  - Fetched on 2026-10-15: CDM issues #5109 and #4692.
  - Not done: the CDM test suite was not run. Rows marked *(name search)* rest on `grep` over the `.rosetta`
    files only.
  - Inference is labelled *(inference)*. Everything else is observation of the files at the pinned commit.

## Method

Same as the CSA matrix. Each capability row gets the highest level it reaches:

| Level | Meaning |
|---|---|
| 0 | Absent |
| 1 | Enums or descriptions only (including `docReference` annotations) |
| 2 | Data types: the model can represent it |
| 3 | Functions: executable logic |
| 4 | Business events, primitive instructions or qualification functions: the lifecycle step is modelled as an event |
| 5 | Sample data or tests in the CDM repository |

Additional conventions for this document:

- **Generic vs family-specific.** Many CDM types are agreement-agnostic, for example `EligibleCollateralCriteria`
  and `MarginCallIssuance`. A generic construct counts toward a family's score only if it can be attached to that
  family's trade or agreement. The Evidence column says when a score rests on a generic construct.
- **What counts as level 5.** Level 5 needs a sample or test that exercises the capability for the family in
  question. The function test data under `resources/functions/*` counts as a test. `tests/.../FunctionTest.java`
  runs every entry of `repo-and-bond-execution-descriptor.json` and `sec-lending-execution-descriptor.json`
  through `Create_BusinessEvent` or the named function, and compares the result with the expected output file
  (`FunctionCreator.EXECUTION_DESCRIPTOR_PATHS`, lines 39–43).

Paths below are relative to `rosetta-source/src/main/rosetta/` unless they start with `resources/`, which means
`rosetta-source/src/main/resources/`.

## Matrix 1 — Repo (ICMA GMRA, buy/sell-back)

| # | Capability | Score | Types | Functions | Events | Samples / tests | Evidence |
|---|---|---|---|---|---|---|---|
| R1 | Agreement terms and elections (GMRA) | **1** | empty type | – | – | none | `legaldocumentation-master-icma-type.rosetta` line 6: `GlobalMasterRepoAgreement extends MasterAgreementBase` has no attributes, and `MasterAgreementBase` is also empty (`legaldocumentation-master-type.rosetta` line 44). `MasterAgreementTypeEnum.GMRA` (`legaldocumentation-master-enum.rosetta` line 22). `MasterAgreementClauseIdentifierEnum` (line 185) holds only `ISLA_GMSLA_*` values, so GMRA clauses have no identifiers. GMRA paragraph references exist only as `docReference ICMA GMRA` annotations on product and event types (`Trade`, `CollateralValuationTreatment`, `Create_Transfer`, `SecurityFinanceCashSettlementAmount`) |
| R2 | Amendment of agreement terms | **0** | – | – | – | – | `AgreementTermsChangeInstruction` (`event-common-type.rosetta` line 93) has only `vmCSATermsChange`, `imCSATermsChange` and `legacyCSATermsChange`. There are no GMRA elections to amend (R1). `Create_AgreementPartyChange` (`event-common-func.rosetta` line 2505) is agreement-agnostic but covers party changes, not terms |
| R3 | Eligible collateral / baskets | **3** | yes (generic) | yes (generic) | – | repo samples carry no criteria | `CollateralProvisions.eligibleCollateral EligibleCollateralCriteria (0..*)` (`product-collateral-type.rosetta` line 34). `CheckEligibilityForProduct` and `CheckEligibilityByDetails` (`product-collateral-func.rosetta` lines 43, 60) say "For ICMA usecase - this is the basket(s)". These functions take `EligibleCollateralSpecification`, not the trade-level `EligibleCollateralCriteria`. The repo samples use `eligibleCollateral` only to carry `marginPercentage` (finding O6) |
| R4 | Haircut / margin ratio | **5** | yes | yes | – | `repo-execution-func-input.json` line 140 (`marginPercentage: 0.99`) | `CollateralValuationTreatment.haircutPercentage` (GMRA 2(xx)(B)) and `.marginPercentage` (GMRA 2(bb) Margin Ratio) (`product-collateral-type.rosetta` lines 62–79). Applied in `SecurityFinanceCashSettlementAmount` (`event-common-func.rosetta` lines 837–842). The direction of the ratio is inconsistent (finding O4) |
| R5 | Concentration limits | **2** | yes (generic) | – | – | – | `CollateralTreatment.concentrationLimit` (`product-collateral-type.rosetta` line 146). No function references `ConcentrationLimit` (same as CSA row 5) |
| R6 | Purchase price / repurchase price / exposure calculation | **3** | yes | yes | – | repo samples do not exercise it | `SecurityFinanceCashSettlementAmount` (`event-common-func.rosetta` line 799, docReference GMRA 2(rr) Repurchase Price): price × quantity × margin ratio. `InterestCashSettlementAmount` (line 148) computes repo interest. Called through `ResolveTransfer` (line 762). In `repo-execution-func-input.json` the cash amount 9,974,250 is an input, not a computed value, and no repo output file has `transferHistory`. GMRA Transaction Exposure and Net Exposure: absent *(name search)* |
| R7 | Margin maintenance (GMRA paragraph 4 margin transfers) | **2** | generic only | – | – | – | No Net Exposure, Margin Transfer or Margin Maintenance type or function *(name search)*. Only the generic `MarginCallIssuance` / `MarginCallResponse` (`event-common-type.rosetta` lines 689–790) could carry a repo margin call (`callAgreementType AgreementName` can name GMRA). Same gap as CSA finding F2 |
| R8 | Repricing and adjustment | **5** | yes | yes | yes | `repo-reprice-*`, `repo-adjustment-*` | `Create_RepricePrimitiveInstruction` (`event-common-func.rosetta` line 1769) changes the cash amount. `Create_AdjustmentPrimitiveInstruction` (line 1843) changes the collateral quantity. `Qualify_Reprice` (`event-qualification-func.rosetta` line 592) and `Qualify_Adjustment` (line 11). The new price, cash or quantity are inputs. Both `.md` files state "This event does not automatically generate cash/collateral transfers". Neither expected output carries an `eventQualifier` (finding O5) |
| R9 | Dispute | **2** | generic only | – | – | – | `MarginCallResponseTypeEnum.Dispute` (`event-common-enum.rosetta` line 97) through the generic margin call types. No repo-specific dispute construct *(name search)* |
| R10 | Collateral transfer / settlement | **4** | yes | yes | yes | partial delivery only (quantity change, no transfer) | `Create_AssetTransfer`, `Create_CashTransfer`, `ResolveTransfer` (`event-common-func.rosetta` lines 674–798). `ResolveRepurchaseTransferInstruction` (line 1430) sets intent `Repurchase`. `Create_PartialDeliveryPrimitiveInstruction` (line 1746) and `Qualify_PartialDelivery` (`event-qualification-func.rosetta` line 454). `AssetLeg.deliveryMethod` and `AssetPayout` condition `SettlementCentreRequired` (`product-template-type.rosetta` lines 865–900). No repo sample output contains a `transferHistory` |
| R11 | Substitution | **5** | yes | yes | yes | `repo-substitution-*` (5 files) | `Create_SubstitutionPrimitiveInstruction` (`event-common-func.rosetta` line 1919, `condition SecurityFinance`: collateral exists) and `Create_SubstitutionInstruction` (line 1947) replace `collateralPortfolio`. `SubstitutionProvisions` (`product-collateral-type.rosetta` line 41). `Qualify_Substitution` (`event-qualification-func.rosetta` line 821). The expected output is qualified as `Renegotiation`, not `Substitution` (finding O5) |
| R12 | Repo interest / rate change / interim payment | **5** | yes | yes | yes | `on-demand-rate-change-*`, `on-demand-interest-payment-*` | `Create_OnDemandRateChangePrimitiveInstruction` (`event-common-func.rosetta` line 1533) with `Qualify_OnDemandRateChange` (the output is qualified `OnDemandRateChange`). `Create_OnDemandInterestPaymentPrimitiveInstruction` (line 2001) adds a payout leg (its output has no `eventQualifier`). Interest calculation: `InterestCashSettlementAmount` |
| R13 | Term events: roll, repurchase, termination, pair-off, shaping | **5** | yes | yes | yes | `roll-*`, `cancellation-*`, `pair-off-*`, `shaping-*` | `Create_RollPrimitiveInstruction` (line 1466), `Create_PairOffInstruction` (line 1656), `ResolveRepurchaseTransferInstruction` (line 1430). `Qualify_Roll`, `Qualify_PairOff`, `Qualify_Shaping`, `Qualify_Repurchase` (`event-qualification-func.rosetta` lines 673, 417, 717, 637). No repurchase (maturity) sample found. Qualifiers found in outputs: `Cancellation` and `PairOff` only |
| R14 | Buy/sell-back | **4** | yes | – | qualification | none | `AssetPayoutTradeTypeEnum.BuySellBack` (`product-template-enum.rosetta` line 33), `Qualify_BuySellBack` (`product-qualification-func.rosetta` line 1799). No sample sets `tradeType`, and no file under `resources/functions` contains `BuySellBack` |
| R15 | Product qualification (repo) | **5** | – | – | qualification | all 12 repo outputs carry `RepurchaseAgreement` | `Qualify_RepurchaseAgreement` (`product-qualification-func.rosetta` line 1786) requires `payout only-element as InterestRatePayout` (line 1793). Open issue #4692 (finding O7) |
| R16 | Collateral inventory / positions | **2** | yes (generic) | – | – | – | Collateral is held per trade in `economicTerms -> collateral -> collateralPortfolio` (`CollateralPortfolio`, `CollateralPosition`, `CollateralBalance`, `event-common-type.rosetta` lines 732–755). No firm-level collateral inventory construct for repo |
| R17 | Custody | **2** | settlement location only | – | – | – | `settlementTerms.securitySettlementCentre` (required by `AssetPayout` condition `SettlementCentreRequired`). `PartyRoleEnum.ThirdPartyCustodian` (`base-staticdata-party-enum.rosetta` line 118). The CSA custody types are not linked to repo |
| R18 | Collateral allocation / optimisation | **0** | – | – | – | – | Nothing found *(name search)*. `Qualify_Allocation` and `Qualify_Shaping` concern trade allocation and splitting, not collateral allocation |
| R19 | Reconciliation | **0** | – | – | – | – | Nothing found *(name search)* |
| R20 | Close-out / event of default | **0** | – | – | – | – | `GlobalMasterRepoAgreement` has no default elections. No default-valuation function *(name search)* |

## Matrix 2 — Securities lending (ISLA GMSLA)

| # | Capability | Score | Types | Functions | Events | Samples / tests | Evidence |
|---|---|---|---|---|---|---|---|
| S1 | Agreement terms and elections (GMSLA) | **2** | yes | – | – | none | `GlobalMasterSecuritiesLendingAgreement` (`legaldocumentation-master-isla-type.rosetta` line 9): `CollateralSpecification` (market value definition, `Aggregation`, netting, failure-to-deliver indemnity, notification time), `BaseCurrency`, `EventsOfDefault` (2 party elections, automatic early termination). Clause library: 56 clause identifiers `ISLA_GMSLA_001`–`056` and 172 variant identifiers (`legaldocumentation-master-enum.rosetta` lines 185–415) for `MasterAgreementSchedule`. No sample under `examples/samples` or `resources/functions` uses `islaGmsla`, `masterAgreementSchedule` or `ISLA_GMSLA_*` |
| S2 | Amendment of agreement terms | **2** | data only | – | – | – | `AgreementTermsChangeInstruction` has no GMSLA field (`event-common-type.rosetta` line 93). An amended agreement can be represented only as a new `LegalAgreement` record. `Create_AgreementPartyChange` covers party changes only |
| S3 | Eligible collateral / collateral schedule | **3** | yes | yes (generic) | – | no GMSLA schedule sample | Clause `ISLA_GMSLA_004` (variants `_01` GMSLA Schedule, `_02` Outside of GMSLA, `_03` Additional Criteria), `CollateralProvisions.collateralType` (`CollateralTypeEnum`: Cash, NonCash, CashPool), `eligibleCollateral`. Generic `Check*` eligibility functions. The 5 eligible collateral schedule samples in `examples/samples/legal-agreements/eligible-collateral-schedules` are stand-alone. The README describes them as CSA-related. None references GMSLA |
| S4 | Haircut / margin | **5** | yes | yes | – | `reallocation-pre-settled-func-input.json`, `full-return-settlement-workflow-func-input.json` and others contain `haircutPercentage` / `marginPercentage` | `CollateralValuationTreatment`. Applied in `SecurityFinanceCashSettlementAmount` and `ResolveSecurityFinanceBillingAmount` (`event-common-func.rosetta` lines 837–842, 1280–1310). Clause `ISLA_GMSLA_005` (Margin) |
| S5 | Concentration limits | **2** | yes (generic) | – | – | – | As R5 |
| S6 | Collateral requirement / exposure calculation | **3** | yes | yes | – | probably exercised by the settlement workflow sample *(inference)* | Cash collateral amount = price × quantity × margin ratio (`SecurityFinanceCashSettlementAmount`). GMSLA aggregation (paragraph 5.4) is represented as `Aggregation` / `AggregationSpecificationEnum` (`legaldocumentation-master-isla-enum.rosetta`) and is not used by any function |
| S7 | Margin call / marking to market (GMSLA paragraph 5) | **2** | generic only | – | – | – | Clause `ISLA_GMSLA_005`, `ISLA_GMSLA_051` (minimum collateral transfer amount). Generic margin call types. No mark-to-market or margin delivery function *(name search)* |
| S8 | Dispute | **2** | generic only | – | – | – | As R9 |
| S9 | Collateral transfer / settlement | **5** | yes | yes (Rune + Java) | yes | `new-settlement-workflow-func-*` | `RunNewSettlementWorkflow` and `RunReturnSettlementWorkflow` are Java classes (`rosetta-source/src/main/java/cdm/security/lending/functions/`), not Rune. `Create_Transfer` (`event-common-func.rosetta` line 651) sets `positionState` to `Settled` when `Qualify_SecurityLending` holds and `PayoutObligationFulfillmentFromTrade` (line 2344) returns true. The expected output has `transferHistory`, and all four `positionState` values in it are `Executed` |
| S10 | Substitution | **4** | yes | yes | yes | no securities-lending substitution sample | `Create_SubstitutionPrimitiveInstruction` requires only `economicTerms -> collateral exists`, so a lending trade passes the condition *(inference: not tested for lending)*. Clause `ISLA_GMSLA_030` (4 variants) |
| S11 | Lending fee and billing | **5** | yes | yes | – | `create-security-lending-invoice-func-*` | `Create_SecurityLendingInvoice`, `Create_BillingRecord`, `ResolveSecurityFinanceBillingAmount` (`event-common-func.rosetta` lines 1227–1390). `Create_BillingSummary` is `[codeImplementation]` |
| S12 | Rebate on cash collateral | **2** | yes | – | – | none | `PriceSubTypeEnum.Rebate` (`observable-asset-enum.rosetta` line 293). The billing function is written over any `InterestRatePayout` and could compute a rebate *(inference)*. No sample sets `priceSubType` |
| S13 | Return (full / partial) | **5** | yes | yes | yes | `full-return-*`, `part-return-*` | `Create_Return` (`event-common-func.rosetta` line 1392), `ReturnInstruction`, `Qualify_FullReturn` (`event-qualification-func.rosetta` line 215). Neither return output carries an `eventQualifier`. Issue #5109 (finding O5) |
| S14 | Recall | **2** | yes | – | – | – | `RecallProvision` (`product-template-type.rosetta` line 678), `UnscheduledTransferEnum.Recall`. No recall function, instruction or qualification *(name search)* |
| S15 | Allocation / reallocation of loans | **5** | yes | yes | yes | `allocation-sec-lending-*`, `reallocation-pre-settled-*` | `Qualify_Allocation`, `Qualify_Reallocation`. This is trade allocation by an agent lender, not collateral allocation |
| S16 | Collateral allocation / optimisation | **0** | – | – | – | – | Nothing found *(name search)* |
| S17 | Inventory / positions | **2** | yes (generic) | – | – | – | As R16 |
| S18 | Pledge structure (GMSLA 2018 security interest) / custody | **1** | enum only | – | – | – | `ISLA_GMSLA_055_01` "Security Agreement Details Included". `LegalAgreementIdentification.vintage` distinguishes editions. There is no attribute that separates title-transfer from pledge GMSLA, and no GMSLA custody or control types |
| S19 | Close-out / events of default | **2** | yes | – | – | – | `EventsOfDefault`, `EventsOfDefaultElection` (automatic early termination). Clauses `ISLA_GMSLA_037`, `_038`, `_043` (default market value fallbacks). No function |
| S20 | Manufactured payments / corporate actions | **2** | yes | – | – | – | `AssetPayout.dividendTerms` (`DividendTerms`), clauses `ISLA_GMSLA_031`, `_032` |
| S21 | Product qualification | **5** | – | – | qualification | all 9 lending outputs carry `SecurityLending` | `Qualify_SecurityLending` (`product-qualification-func.rosetta` line 1812) |
| S22 | Reconciliation | **0** | – | – | – | – | Nothing found *(name search)* |

## Matrix 3 — Triparty collateral arrangements

| # | Capability | Score | Types | Functions | Events | Samples / tests | Evidence |
|---|---|---|---|---|---|---|---|
| T1 | Triparty agreement terms | **1** | – | – | – | – | No triparty agreement type. `LegalAgreementTypeEnum` (`legaldocumentation-common-enum.rosetta` line 224) has no triparty value. GMSLA clause `ISLA_GMSLA_056` with variants `_01` "Triparty Services Not Referenced" and `_02` "Triparty Services May Apply" (`legaldocumentation-master-enum.rosetta` lines 241, 414–415) |
| T2 | Triparty agent as a party | **2** | generic | – | – | – | `PartyRoleEnum.TripartyAgent` (`base-staticdata-party-enum.rosetta` line 117) through `PartyRole`, `LegalAgreementBase.otherParty`, `MarginCallBase.partyRole`. These are the only `TripartyAgent` / "triparty" occurrences in the `.rosetta` files *(name search)* |
| T3 | Collateral profile / basket | **3** | yes (generic) | yes (generic) | – | generic schedule samples only | `EligibleCollateralSpecification` (`product-collateral-type.rosetta` line 95, `identifier`, `party`, `criteria`). `CheckEligibilityForProduct` / `CheckEligibilityByDetails` name ICMA baskets. `docs/eligible-collateral-representation.md` line 11 mentions "custodian triparty agreements". There is no attribute linking a basket to a triparty agent or a triparty account |
| T4 | Haircuts | **3** | yes (generic) | yes (generic) | – | – | As R4, through basket criteria (`CollateralTreatment.valuationTreatment`) |
| T5 | Concentration limits | **2** | yes (generic) | – | – | – | As R5 |
| T6 | Required collateral value / exposure from agent | **0** | – | – | – | – | Nothing found *(name search)* |
| T7 | Allocation by agent | **0** | – | – | – | – | Nothing found *(name search)*. No instruction or event in which a third party allocates collateral to a trade |
| T8 | Substitution by agent | **2** | generic data | – | – | – | `CollateralPortfolio` can hold a reallocated portfolio. The repo substitution event (R11) works per trade and is instructed by the trade parties, not by an agent |
| T9 | Collateral transfer / settlement through agent | **0** | – | – | – | – | `DeliveryMethodEnum` (DvP, FoP, PreDelivery, PrePayment) has no triparty value. No transfer type for collateral movements |
| T10 | Inventory / positions at agent | **2** | yes (generic) | – | – | – | `CollateralPortfolio` / `CollateralBalance` (with `CollateralStatusEnum`, `HaircutIndicatorEnum`) |
| T11 | Custody | **1** | enum only | – | – | – | `PartyRoleEnum.ThirdPartyCustodian` |
| T12 | Reporting / reconciliation by agent | **0** | – | – | – | – | Nothing found *(name search)* |

## Matrix 4 — CCP / cleared margin

| # | Capability | Score | Types | Functions | Events | Samples / tests | Evidence |
|---|---|---|---|---|---|---|---|
| C1 | CCP rulebook / clearing agreement terms | **1** | enum only | – | – | – | `MasterAgreementTypeEnum` values `CMA`, `CCPClearingConditions`, `ISDAFIA_CDEA`, `JSCC` (`legaldocumentation-master-enum.rosetta` lines 6–43). No elections |
| C2 | Trade clearing (context, not margin) | **5** | yes | yes | yes | `clearing-via-novation-*`, `clearing-via-open-offer-*` (repo), `business-event/clearing` | `ClearingInstruction` (`event-common-type.rosetta` line 616: `clearingParty`, `clearerParty1/2`). `Qualify_ClearedTrade`, `Qualify_OpenOfferClearedTrade` (`event-qualification-func.rosetta` lines 116, 396). The novation output has no `eventQualifier`, and the open-offer output has `OpenOfferClearedTrade` |
| C3 | Clearing member / client roles | **2** | yes | – | – | – | `PartyRoleEnum.ClearingOrganization`, `ClearingFirm`, `ClearingClient` (`base-staticdata-party-enum.rosetta` lines 75–78). `MarginCallBase.clearingBroker` (`event-common-type.rosetta` line 693) |
| C4 | House / client account segregation | **2** | yes | – | – | – | `Account.accountType` with `AccountTypeEnum` House, Client, AggregateClient (`base-staticdata-party-type.rosetta` line 74, `base-staticdata-party-enum.rosetta` lines 26–29). Not linked to margin or collateral types. No omnibus / individual segregation or porting *(name search)* |
| C5 | IM calculation (CCP methodology) | **0** | – | – | – | – | No SPAN, VaR or CCP model *(name search)*. `margin-schedule-func.rosetta` implements the ISDA standardised schedule (bilateral) |
| C6 | VM / settlement price | **2** | yes | – | – | – | `Valuation` (`event-common-type.rosetta` line 282): its `timestamp` description says the value may be "provided by the central counterparty (CCP)". `MarginCallExposure` (generic). No VM calculation |
| C7 | CCP margin call | **2** | generic only | – | – | – | `MarginCallIssuance` with `regMarginType` (`RegMarginTypeEnum` VM / RegIM / NonRegIM) and `clearingBroker`. No CCP-specific call type, instruction or event |
| C8 | Credit / IM limits | **2** | yes | – | – | – | `CreditLimitInformation`, `CreditLimitTypeEnum.IM` (`event-workflow-type.rosetta` line 9, `event-workflow-enum.rosetta` line 7). These are pre-clearing credit-limit checks taken from FpML/CME, not margin |
| C9 | Eligibility / haircuts | **3** | yes (generic) | yes (generic) | – | – | As T3 / T4. Nothing CCP-specific |
| C10 | Collateral transfer / settlement | **2** | generic | – | – | – | As CSA row 13 |
| C11 | Interest on cash collateral | **2** | generic | – | – | – | CSA collateral-interest types (`CollateralInterestParameters` and related). Not linked to CCP |
| C12 | Default management / porting | **0** | – | – | – | – | Nothing found *(name search)* |
| C13 | Reconciliation | **0** | – | – | – | – | Nothing found *(name search)* |

## Findings

**O1 — GMRA terms cannot be represented; GMSLA terms can.** `GlobalMasterRepoAgreement`
(`legaldocumentation-master-icma-type.rosetta` line 6) and its parent `MasterAgreementBase`
(`legaldocumentation-master-type.rosetta` line 44) have no attributes. `MasterAgreementClauseIdentifierEnum` (line
185) and `MasterAgreementVariantIdentifierEnum` (line 243) contain only ISLA values (56 clauses, 172 variants).
`MasterAgreementClause.identifer` is mandatory (1..1), so the clause library cannot hold GMRA clauses with a valid
identifier either. The GMRA is therefore present only as an enum value (`MasterAgreementTypeEnum.GMRA`) and as
`docReference ICMA GMRA` annotations on product and event types.

**O2 — GMSLA elections are modelled but not used.** The GMSLA types (S1) are referenced only from
`MasterAgreementElections.islaGmsla`. No function reads them, `AgreementTermsChangeInstruction` cannot amend them,
and no sample instantiates them. The search covered every JSON file under `resources/functions` and
`examples/samples`. By contrast, the CSA side has 31 sample documents.

**O3 — For repo and securities lending, the trade lifecycle is executable; the collateral calculation behind it
is not.** Collateral is attached to each trade (`economicTerms -> collateral`), and repricing, adjustment,
substitution, roll, return and settlement are primitive-instruction functions with test data (R8, R11, R13, S9,
S13). This is a higher level than the CSA operational rows, which stop at level 2. However:

- the new collateral price, cash amount and quantity are inputs to `Create_RepricePrimitiveInstruction` and
  `Create_AdjustmentPrimitiveInstruction` (`event-common-func.rosetta` lines 1769, 1843);
- no function computes GMRA Transaction Exposure or Net Exposure, or GMSLA marking under paragraph 5;
- both `.md` files for these events state that no transfers are generated;
- no repo expected output contains a `transferHistory`.

**O4 — The direction of the margin ratio is inconsistent between definition, function and sample.**

- *Definition.* `marginPercentage` is defined with GMRA 2(bb) Margin Ratio = Market Value / Purchase Price, with
  the example "a 104% requirement would be represented as 1.04" (`product-collateral-type.rosetta` lines 69–73).
- *Function.* `SecurityFinanceCashSettlementAmount` sets cash = price × quantity × marginRatio (`event-common-func.rosetta`
  line 854). When a haircut is given, it sets marginRatio = 1 / (1 − haircut) (lines 837–842).
- *Sample.* `repo-execution-func-input.json` line 140 sets `marginPercentage: 0.99`, and the `.md` describes it as
  "haircut of 1%". The resulting cash value is 10,075,000 × 0.99 = 9,974,250.

*(Inference)* Under the GMRA definition, Purchase Price = Market Value / Margin Ratio. The multiply-by-ratio
formula matches the sample only if 0.99 is read as (1 − haircut). The haircut branch then produces a cash amount
larger than the collateral market value. Either the definition or one of the branches is inverted. This needs
confirmation from the ICMA working group.

Also observed: `docs/repurchase-agreement-representation.md` line 221 shows `"haircutPercentage" : 2`, which
violates the condition `haircutPercentage < 1` (`product-collateral-type.rosetta` lines 77–79).

**O5 — Several repo and lending event samples are not qualified as the event they demonstrate.** The
`eventQualifier` values in the expected outputs were extracted with a script:

| Expected output | `eventQualifier` |
|---|---|
| Reprice, adjustment, roll, partial delivery, shaping, on-demand interest payment, clearing via novation | none |
| Full return and part return (securities lending) | none |
| Repo substitution | `Renegotiation`, not `Substitution` |
| Repo execution | `Execution` |
| On-demand rate change | `OnDemandRateChange` |
| Pair-off | `PairOff` |
| Cancellation | `Cancellation` |

Causes:

- *Full return (observation).* `Qualify_FullReturn` (`event-qualification-func.rosetta` lines 215–240) and
  `Qualify_Termination` (lines 841–860) both accept an event with no intent, a single quantity-change primitive,
  quantity reduced to zero and state `Terminated`. Issue
  [#5109](https://github.com/finos/common-domain-model/issues/5109) records this collision. It is open: it was
  fixed in PR #5241 on 2026-10-01 and reopened for backport to 6.x and 7.x. The maintainers add that
  `Qualify_FullReturn` looks for the `AssetPayout` on the collateral path, which is wrong for securities lending.
- *Substitution (observation).* `Qualify_Substitution` (lines 821–839) requires a changed `payout` and the new
  trade's effective date to equal the old termination date. `Create_SubstitutionInstruction` changes only
  `collateralPortfolio` and the effective date (`event-common-func.rosetta` lines 1947–1963). The event
  `Create_SubstitutionPrimitiveInstruction` builds (termsChange + quantityChange, no split) matches
  `Qualify_Renegotiation` (lines 573–591).
- *Reprice, adjustment, roll and the other unqualified outputs (not verified).* The test harness compares the
  output with the expected file, so these outputs are the expected behaviour at 7.6.0 *(inference)*.

**O6 — The repo and lending samples do not populate eligibility criteria.** In `repo-execution-func-input.json`
(lines 136–140), `eligibleCollateral` contains only `treatment.valuationTreatment.marginPercentage`. The
mandatory `collateralCriteria` (1..1) and `treatment.isIncluded` (1..1) of `EligibleCollateralCriteria` /
`CollateralTreatment` (`product-collateral-type.rosetta` lines 112–150) are missing. The same file sets
`collateralType: Cash` for a bond-collateralised repo, while `CollateralTypeEnum` describes its values as
"Security Lending Trades against …" (`product-collateral-enum.rosetta` lines 6–9). Whether model validation flags
the missing attributes in the test run was not checked.

**O7 — Repo product qualification rejects repos with more than one interest payout.**
`Qualify_RepurchaseAgreement` uses `payout only-element as InterestRatePayout`
(`product-qualification-func.rosetta` line 1793). Issue
[#4692](https://github.com/finos/common-domain-model/issues/4692) (open, opened 2026-05-07 by ICMA) proposes
removing `only-element`. Repos with coupon, dividend or ad-hoc interest legs need it.
`Create_OnDemandInterestPaymentPrimitiveInstruction` adds a payout leg (`event-common-func.rosetta` line 2001).
*(Inference)* The after-trade of that event may therefore fail product qualification.

**O8 — No family has a margin call or margin maintenance workflow.** CSA finding F2 applies to all four families:

- GMRA paragraph 4 margin transfers, GMSLA paragraph 5 marking and CCP margin calls have no function, instruction
  or event.
- The generic `MarginCallIssuance` / `MarginCallResponse` types can name the governing agreement
  (`callAgreementType`) and a clearing broker, but no function references them.
- For repo, the transaction-level reprice and adjustment events (R8) are the only executable path for
  rebalancing collateral.

**O9 — Triparty is represented by two names only.** In the `.rosetta` files, "triparty" appears only as
`PartyRoleEnum.TripartyAgent` and as GMSLA clause `ISLA_GMSLA_056` (2 variants). The model has no triparty
agreement, no link between a collateral profile and an agent, no agent allocation or substitution, no triparty
settlement method and no sample. Baskets can be represented with the generic `EligibleCollateralSpecification`,
whose function documentation names "ICMA usecase – basket(s)" (`product-collateral-func.rosetta` lines 46, 62).

**O10 — CCP support covers trade clearing, not margin.** Clearing a trade is modelled and tested (C2), including
the two repo clearing samples. CCP margin has:

- no IM methodology;
- no VM calculation;
- no house/client margin account link (`AccountTypeEnum` is not referenced by any collateral type);
- no default management.

`CreditLimitTypeEnum.IM` is a pre-trade credit-limit category and does not represent margin.

**O11 — The securities-lending settlement workflows are Java, not Rune.** `RunNewSettlementWorkflow` and
`RunReturnSettlementWorkflow` are hand-written Java (`rosetta-source/src/main/java/cdm/security/lending/functions/`).
*(Inference)* Code generators for languages other than Java do not get this logic.

**O12 — Buy/sell-back is qualification only.** `Qualify_BuySellBack` and `AssetPayoutTradeTypeEnum.BuySellBack`
exist. No sample sets `tradeType`: the attribute is absent from every file under `resources/functions`.
Buy/sell-back-specific pricing (repurchase price net of coupon) appears only in the `docReference` text of
`SecurityFinanceCashSettlementAmount`, not in its logic (lines 799–870).

## Cross-family comparison

CSA scores are from `cdm-csa-coverage-matrix.md`. For exposure / calculation, the CSA score is row 7 (Delivery /
Return Amount).

| Capability | CSA (ISDA) | Repo (GMRA) | Sec lending (GMSLA) | Triparty | CCP |
|---|---|---|---|---|---|
| Agreement terms | 5 | 1 | 2 | 1 | 1 |
| Amendment of terms | 4 | 0 | 2 | – | – |
| Eligibility / schedule / basket | 5 | 3 | 3 | 3 | 3 |
| Haircuts / margin ratio | 3 | 5 | 5 | 3 | 3 |
| Concentration limits | 2 | 2 | 2 | 2 | – |
| Exposure / collateral calculation | 3 | 3 | 3 | 0 | 0 |
| Margin call / maintenance | 2 | 2 | 2 | – | 2 |
| Dispute | 2 | 2 | 2 | – | – |
| Collateral transfer / settlement | 2 | 4 | 5 | 0 | 2 |
| Substitution | 2 | 5 | 4 | 2 | – |
| Interest / fee / rebate | 2 | 5 | 5 (fee), 2 (rebate) | – | 2 |
| Inventory / positions | 2 | 2 | 2 | 2 | – |
| Custody | 2 | 2 | 1 | 1 | – |
| Allocation / optimisation (collateral) | 0 | 0 | 0 | 0 | – |
| Reconciliation | 0 | 0 | 0 | 0 | 0 |

"–" means the row was not scored for that family.

## Summary

At 7.6.0, CDM covers repo and securities lending as **trade-level products**. Collateral is attached to each
trade, and repricing, adjustment, substitution, roll, rate change, return, settlement and billing are executable
primitive instructions with function test data. On those rows the two families score above the ISDA CSA. On the
**agreement side** the picture is reversed: the GMRA type is empty, and the GMSLA elections and clause library
exist but are not used by any function or sample. Margin maintenance (GMRA paragraph 4, GMSLA paragraph 5) is
absent, as the margin call workflow is for the CSA. Several repo and lending event samples are not qualified as
the event they demonstrate (issue #5109 and finding O5). The margin-ratio direction is inconsistent between
definition, function and sample. **Triparty** arrangements appear only as a party role and a GMSLA clause, with
generic eligibility baskets. **CCP** support covers clearing a trade and not cleared margin. Collateral
allocation, optimisation and reconciliation are absent in all families.
