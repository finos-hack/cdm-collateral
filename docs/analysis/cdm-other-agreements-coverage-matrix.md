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
- **Status:** first pass, cross-checked against CDM issues on 2026-10-15 (see Cross-check).
- **Evidence basis:**
  - Read in full: the Rune definitions named in the matrices (`legaldocumentation-master-*.rosetta`, the repo
    and securities-lending functions in `event-common-func.rosetta`, the qualification functions in
    `event-qualification-func.rosetta` and `product-qualification-func.rosetta`, `product-collateral-type.rosetta`
    lines 1–165).
  - Scanned with scripts: the function test data in `resources/functions/repo-and-bond` (60 files) and
    `resources/functions/sec-lending` (event qualifiers, product qualifiers, haircut fields, transfer history).
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
| R3 | Eligible collateral / baskets | **3** | yes (generic) | yes (generic) | – | repo samples carry no criteria | `CollateralProvisions.eligibleCollateral EligibleCollateralCriteria (0..*)` (`product-collateral-type.rosetta` line 34). `CheckEligibilityForProduct` and `CheckEligibilityByDetails` (`product-collateral-func.rosetta` lines 43, 60) say "For ICMA usecase - this is the basket(s)". These functions take `EligibleCollateralSpecification`, not the trade-level `EligibleCollateralCriteria`. |
| R4 | Haircut / margin ratio | **5** | yes | yes | – | `repo-execution-func-input.json` line 140 (`marginPercentage: 0.99`) | `CollateralValuationTreatment.haircutPercentage` (GMRA 2(xx)(B)) and `.marginPercentage` (GMRA 2(bb) Margin Ratio) (`product-collateral-type.rosetta` lines 62–79). Applied in `SecurityFinanceCashSettlementAmount` (`event-common-func.rosetta` lines 837–842) |
| R5 | Concentration limits | **2** | yes (generic) | – | – | – | `CollateralTreatment.concentrationLimit` (`product-collateral-type.rosetta` line 146). No function references `ConcentrationLimit` (same as CSA row 5) |
| R6 | Purchase price / repurchase price / exposure calculation | **3** | yes | yes | – | repo samples do not exercise it | `SecurityFinanceCashSettlementAmount` (`event-common-func.rosetta` line 799, docReference GMRA 2(rr) Repurchase Price): price × quantity × margin ratio. `InterestCashSettlementAmount` (line 148) computes repo interest. Called through `ResolveTransfer` (line 762). In `repo-execution-func-input.json` the cash amount 9,974,250 is an input, not a computed value, and no repo output file has `transferHistory`. GMRA Transaction Exposure and Net Exposure: absent *(name search)* |
| R7 | Margin maintenance (GMRA paragraph 4 margin transfers) | **2** | generic only | – | – | – | No Net Exposure, Margin Transfer or Margin Maintenance type or function *(name search)*. Only the generic `MarginCallIssuance` / `MarginCallResponse` (`event-common-type.rosetta` lines 689–790) could carry a repo margin call (`callAgreementType AgreementName` can name GMRA). Same gap as CSA finding F2 |
| R8 | Repricing and adjustment | **5** | yes | yes | yes | `repo-reprice-*`, `repo-adjustment-*` | `Create_RepricePrimitiveInstruction` (`event-common-func.rosetta` line 1769) changes the cash amount. `Create_AdjustmentPrimitiveInstruction` (line 1843) changes the collateral quantity. `Qualify_Reprice` (`event-qualification-func.rosetta` line 592) and `Qualify_Adjustment` (line 11). The new price, cash or quantity are inputs. Both `.md` files state "This event does not automatically generate cash/collateral transfers" |
| R9 | Dispute | **2** | generic only | – | – | – | `MarginCallResponseTypeEnum.Dispute` (`event-common-enum.rosetta` line 97) through the generic margin call types. No repo-specific dispute construct *(name search)* |
| R10 | Collateral transfer / settlement | **4** | yes | yes | yes | partial delivery only (quantity change, no transfer) | `Create_AssetTransfer`, `Create_CashTransfer`, `ResolveTransfer` (`event-common-func.rosetta` lines 674–798). `ResolveRepurchaseTransferInstruction` (line 1430) sets intent `Repurchase`. `Create_PartialDeliveryPrimitiveInstruction` (line 1746) and `Qualify_PartialDelivery` (`event-qualification-func.rosetta` line 454). `AssetLeg.deliveryMethod` and `AssetPayout` condition `SettlementCentreRequired` (`product-template-type.rosetta` lines 865–900). No repo sample output contains a `transferHistory` |
| R11 | Substitution | **5** | yes | yes | yes | `repo-substitution-*` (5 files) | `Create_SubstitutionPrimitiveInstruction` (`event-common-func.rosetta` line 1919, `condition SecurityFinance`: collateral exists) and `Create_SubstitutionInstruction` (line 1947) replace `collateralPortfolio`. `SubstitutionProvisions` (`product-collateral-type.rosetta` line 41). `Qualify_Substitution` (`event-qualification-func.rosetta` line 821) |
| R12 | Repo interest / rate change / interim payment | **5** | yes | yes | yes | `on-demand-rate-change-*`, `on-demand-interest-payment-*` | `Create_OnDemandRateChangePrimitiveInstruction` (`event-common-func.rosetta` line 1533) with `Qualify_OnDemandRateChange` (the output is qualified `OnDemandRateChange`). `Create_OnDemandInterestPaymentPrimitiveInstruction` (line 2001) adds a payout leg. Interest calculation: `InterestCashSettlementAmount` |
| R13 | Term events: roll, repurchase, termination, pair-off, shaping | **5** | yes | yes | yes | `roll-*`, `cancellation-*`, `pair-off-*`, `shaping-*` | `Create_RollPrimitiveInstruction` (line 1466), `Create_PairOffInstruction` (line 1656), `ResolveRepurchaseTransferInstruction` (line 1430). `Qualify_Roll`, `Qualify_PairOff`, `Qualify_Shaping`, `Qualify_Repurchase` (`event-qualification-func.rosetta` lines 673, 417, 717, 637). No repurchase (maturity) sample found |
| R14 | Buy/sell-back | **4** | yes | – | qualification | none | `AssetPayoutTradeTypeEnum.BuySellBack` (`product-template-enum.rosetta` line 33), `Qualify_BuySellBack` (`product-qualification-func.rosetta` line 1799). No sample sets `tradeType`, and no file under `resources/functions` contains `BuySellBack` |
| R15 | Product qualification (repo) | **5** | – | – | qualification | all 12 repo outputs carry `RepurchaseAgreement` | `Qualify_RepurchaseAgreement` (`product-qualification-func.rosetta` line 1786) requires `payout only-element as InterestRatePayout` (line 1793) |
| R16 | Collateral inventory / positions | **2** | yes (generic) | – | – | – | Collateral is held per trade in `economicTerms -> collateral -> collateralPortfolio` (`CollateralPortfolio`, `CollateralPosition`, `CollateralBalance`, `event-common-type.rosetta` lines 732–755). No firm-level collateral inventory construct for repo |
| R17 | Custody | **2** | settlement location only | – | – | – | `settlementTerms.securitySettlementCentre` (required by `AssetPayout` condition `SettlementCentreRequired`). `PartyRoleEnum.ThirdPartyCustodian` (`base-staticdata-party-enum.rosetta` line 118). The CSA custody types are not linked to repo |
| R18 | Collateral allocation / optimisation | **0** | – | – | – | – | Nothing found *(name search)*. `Qualify_Allocation` and `Qualify_Shaping` concern trade allocation and splitting, not collateral allocation |
| R19 | Reconciliation | **0** | – | – | – | – | Nothing found *(name search)* |
| R20 | Close-out / event of default | **0** | – | – | – | – | `GlobalMasterRepoAgreement` has no default elections. No default-valuation function *(name search)* |
| R21 | Exposure netting: net exposure across all transactions *(added 2026-10-15)* | **0** | – | – | – | – | As R6/R7: no Net Exposure type or function *(name search)* |
| R22 | Settlement netting *(added 2026-10-15)* | **1** | – | – | – | pair-off samples (context) | No GMRA settlement-netting election (R1). Trade-level `StandardSettlementStyleEnum.Net` only. Pair-off (R13) closes offsetting transactions and is executable, but it is a trade event, not netting of collateral movements |
| R23 | Close-out netting on default *(added 2026-10-15)* | **0** | – | – | – | – | `GlobalMasterRepoAgreement` has no default or set-off elections (R1, R20) |
| R24 | Collateral proposal and acceptance *(added 2026-10-16)* | **2** | generic only | – | – | – | As CSA row 24: the proposed collateral fits `MarginCallResponseAction`; no acceptance or rejection type |

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
| S13 | Return (full / partial) | **5** | yes | yes | yes | `full-return-*`, `part-return-*` | `Create_Return` (`event-common-func.rosetta` line 1392), `ReturnInstruction`, `Qualify_FullReturn` (`event-qualification-func.rosetta` line 215) |
| S14 | Recall | **2** | yes | – | – | – | `RecallProvision` (`product-template-type.rosetta` line 678), `UnscheduledTransferEnum.Recall`. No recall function, instruction or qualification *(name search)* |
| S15 | Allocation / reallocation of loans | **5** | yes | yes | yes | `allocation-sec-lending-*`, `reallocation-pre-settled-*` | `Qualify_Allocation`, `Qualify_Reallocation`. This is trade allocation by an agent lender, not collateral allocation |
| S16 | Collateral allocation / optimisation | **0** | – | – | – | – | Nothing found *(name search)* |
| S17 | Inventory / positions | **2** | yes (generic) | – | – | – | As R16 |
| S18 | Pledge structure (GMSLA 2018 security interest) / custody | **1** | enum only | – | – | – | `ISLA_GMSLA_055_01` "Security Agreement Details Included". `LegalAgreementIdentification.vintage` distinguishes editions. There is no attribute that separates title-transfer from pledge GMSLA, and no GMSLA custody or control types |
| S19 | Close-out / events of default | **2** | yes | – | – | – | `EventsOfDefault`, `EventsOfDefaultElection` (automatic early termination). Clauses `ISLA_GMSLA_037`, `_038`, `_043` (default market value fallbacks). No function |
| S20 | Manufactured payments / corporate actions | **2** | yes | – | – | – | `AssetPayout.dividendTerms` (`DividendTerms`), clauses `ISLA_GMSLA_031`, `_032` |
| S21 | Product qualification | **5** | – | – | qualification | all 9 lending outputs carry `SecurityLending` | `Qualify_SecurityLending` (`product-qualification-func.rosetta` line 1812) |
| S22 | Reconciliation | **0** | – | – | – | – | Nothing found *(name search)* |
| S23 | Exposure netting: aggregation of loans and collateral *(added 2026-10-15)* | **2** | yes | – | – | – | `CollateralSpecification` `Aggregation` / `AggregationSpecificationEnum` (GMSLA paragraph 5.4, `legaldocumentation-master-isla-*.rosetta`). Not used by any function (S6) |
| S24 | Settlement netting of collateral deliveries *(added 2026-10-15)* | **2** | yes | – | – | – | Election `nettingObligationsApply` (GMSLA paragraph 5.6, `legaldocumentation-master-isla-type.rosetta` line 18); clause `ISLA_GMSLA_008` "Settlement Netting" with 4 variants (`legaldocumentation-master-enum.rosetta` lines 193, 263–266). No function |
| S25 | Close-out netting and set-off on default *(added 2026-10-15)* | **2** | yes | – | – | – | `EventsOfDefault` (S19); clause `ISLA_GMSLA_042` "Set-Off" (`_01` No Contractual Set-Off, `_02` Simple Contractual Set-Off). No function |
| S26 | Collateral proposal and acceptance *(added 2026-10-16)* | **2** | generic only | – | – | – | As CSA row 24 |

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
| T13 | Exposure netting at the agent *(added 2026-10-15)* | **0** | – | – | – | – | Nothing found *(name search)* |
| T14 | Settlement netting on agent books *(added 2026-10-15)* | **0** | – | – | – | – | Nothing found; triparty settlement itself is absent (T9) |
| T15 | Close-out netting *(added 2026-10-15)* | – | – | – | – | – | Follows the underlying repo or lending agreement (R23, S25) |
| T16 | Collateral proposal and acceptance *(added 2026-10-16)* | – | – | – | – | – | Not applicable: the agent selects collateral from the giver's inventory against the collateral profile (T7) |

## Matrix 4 — CCP / cleared margin

| # | Capability | Score | Types | Functions | Events | Samples / tests | Evidence |
|---|---|---|---|---|---|---|---|
| C1 | CCP rulebook / clearing agreement terms | **1** | enum only | – | – | – | `MasterAgreementTypeEnum` values `CMA`, `CCPClearingConditions`, `ISDAFIA_CDEA`, `JSCC` (`legaldocumentation-master-enum.rosetta` lines 6–43). No elections |
| C2 | Trade clearing (context, not margin) | **5** | yes | yes | yes | `clearing-via-novation-*`, `clearing-via-open-offer-*` (repo), `business-event/clearing` | `ClearingInstruction` (`event-common-type.rosetta` line 616: `clearingParty`, `clearerParty1/2`). `Qualify_ClearedTrade`, `Qualify_OpenOfferClearedTrade` (`event-qualification-func.rosetta` lines 116, 396) |
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
| C14 | Position netting by account *(added 2026-10-15)* | **2** | yes | – | – | – | Positions and accounts (`Account.accountType` House / Client, C4) can represent netted positions per account; no function nets trades into margin positions *(name search)* |
| C15 | Settlement netting of margin and cash flows *(added 2026-10-15)* | **0** | – | – | – | – | Nothing found *(name search)* |
| C16 | Close-out netting on member default *(added 2026-10-15)* | **0** | – | – | – | – | As C12 |
| C17 | Collateral proposal and acceptance *(added 2026-10-16)* | – | – | – | – | – | Not applicable: the member delivers collateral the CCP lists as eligible (C9); there is no bilateral proposal |

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

Findings O4–O7 (defects in CDM sample data, event qualification and the margin-ratio calculation) were
removed at the project owner's request on 2026-10-15. The remaining findings keep their numbers.

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
| Exposure netting | 0 | 0 | 2 | 0 | 2 |
| Settlement netting | 1 | 1 | 2 | 0 | 0 |
| Close-out netting | 2 | 0 | 2 | – | 0 |
| Collateral proposal / acceptance *(added 2026-10-16)* | 2 | 2 | 2 | – | – |

"–" means the row was not scored for that family.


## Flows and capabilities *(added 2026-10-16)*

As in [`cdm-csa-coverage-matrix.md`](cdm-csa-coverage-matrix.md#flows-and-capabilities-added-2026-10-16): each column of the UI
scenario grid (`ui-prototype/clickable.html`) uses several capability rows, and its CDM coverage is the weakest score
among them. "n/a" means the flow does not exist for that family.

| Flow (UI grid column) | Repo (GMRA) | Sec lending (GMSLA) | Triparty | CCP |
|---|---|---|---|---|
| Call → proposal → settle | R3, R4, R5, R6, R7, R10, R16, R21, R24 → **0** (R21) | S3, S4, S5, S6, S7, S9, S17, S23, S26 → **2** | n/a (agent allocates, T7) | C5, C6, C7, C9, C10, C14 → **0** (C5) |
| Revaluation / top-up | R4, R6, R7 → **2** | S4, S6, S7 → **2** | T4, T6 → **0** (T6) | C6, C9 → **2** |
| Return (of excess collateral) | R7, R10 → **2** | S7, S9 → **2** | T7, T9 → **0** | C7, C10 → **2** |
| Substitution | R11 → **5** | S10 → **4** | T8 → **2** | n/a |
| Dispute | R9 → **2** | S8 → **2** | n/a | n/a (calls not negotiated) |
| Default / enforcement | R20, R23 → **0** | S19, S25 → **2** | follows the underlying agreement (T15) | C12, C16 → **0** |
| Interest and income | R12 → **5** | S11, S12, S20 → **2** (S12 rebate, S20 manufactured payments) | follows the underlying agreement | C11 → **2** |
| Terms amendment | R2 → **0** | S2 → **2** | T1 → **1** | n/a (CCP rulebook) |
| Loan return / recall | n/a | S13, S14 → **2** (S14 recall) | n/a | n/a |

Trade events with their own rows and no grid column: repo repricing and adjustment (R8), roll, repurchase and
termination (R13); securities lending fee billing is under interest and income (S11). Under GMSLA, "return" in S13
means the borrower returning lent securities; the grid shows it as its own flow, separate from the return of excess
collateral.

## Cross-check (method step 5)

Checked 2026-10-15 against CDM issue searches on GitHub (`repo ICMA`, `ISLA`, `triparty`, `"initial margin" OR "CCP"
margin`; first page of results each, read as rendered pages) and three issues read in full. The 7.x release notes were
not reachable from this session. **No score changed.**

| Row(s) | External evidence | Effect |
|---|---|---|
| S14 Recall | Issue [#4213](https://github.com/finos/common-domain-model/issues/4213) "Add support for the recall of lent securities": `RecallProvision` and a Recall transfer type, Major Release 7.0, closed 2026-02-09 (PRs #4335, #4348, #4384, #4397). The issue says recall processing is built on the existing `transfer` functionality | Confirms the types (`RecallProvision`, `UnscheduledTransferEnum.Recall`). Whether the generic transfer functions process a recall end to end was not tested *(to verify)*; score stays 2 |
| S7 Marking to market | Issue [#3582](https://github.com/finos/common-domain-model/issues/3582): `ValuationScopeEnum` (Collateral, Trade) and a mandatory `Valuation.scope`, Major Release 7.0. The author states no function changes were expected | Collateral valuations from a mark to market can be recorded (`event-common-type.rosetta` line 287). No marking or call function; score stays 2 |
| S1 GMSLA terms | Issue [#4991](https://github.com/finos/common-domain-model/issues/4991): renames `masterAgreementSchedule` to `clauseLibrarySchedule` and removes "the enumerations that were added specifically for the ISLA clause library and the GMSLA"; closed 2026-10-08 via PR #5227, milestone **Major Release 8.0** | 7.6.0 is unaffected. The `ISLA_GMSLA_*` identifiers cited in S1, S3, S18, S24 and S25 will not exist in CDM 8 |
| S1, S9, S13 Lending lifecycle | Closed 7.0 issues: [#3967](https://github.com/finos/common-domain-model/issues/3967) GMSLA skeleton, [#4305](https://github.com/finos/common-domain-model/issues/4305) return of securities and collateral, [#3640](https://github.com/finos/common-domain-model/issues/3640) rate changes, [#3896](https://github.com/finos/common-domain-model/issues/3896) eligible collateral for securities lending, [#3871](https://github.com/finos/common-domain-model/issues/3871) lending fee and rebate rate types | Consistent with the scores; ISLA is the active contributor for this family |
| R1–R23 Repo | The `repo ICMA` search returned no issue about GMRA terms, margin maintenance or net exposure. Open repo-related issues concern qualification and event model details | The GMRA agreement gap has no scheduled work |
| T1–T15 Triparty | The `triparty` search returned 3 issues; none proposes triparty agreement or agent processing | Triparty has no scheduled work |
| C1–C16 CCP | The margin search returned 9 issues, all closed; all margin work is the bilateral standardised IM schedule (#3060, #3161, #3740, #4186). None concerns CCP margin, clearing member accounts or default management | CCP margin has no scheduled work |

Limits: only the first page of each search was read; issue bodies were read for #4213, #3582 and #4991 only.

## Summary

At 7.6.0, CDM covers repo and securities lending as **trade-level products**. Collateral is attached to each
trade, and repricing, adjustment, substitution, roll, rate change, return, settlement and billing are executable
primitive instructions with function test data. On those rows the two families score above the ISDA CSA. On the
**agreement side** the picture is reversed: the GMRA type is empty, and the GMSLA elections and clause library
exist but are not used by any function or sample. Margin maintenance (GMRA paragraph 4, GMSLA paragraph 5) is
absent, as the margin call workflow is for the CSA. **Triparty** arrangements appear only as a party role and a GMSLA clause, with
generic eligibility baskets. **CCP** support covers clearing a trade and not cleared margin. Collateral
allocation, optimisation and reconciliation are absent in all families.
