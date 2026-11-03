# Local CDM extension (`cdmx`)

Extensions to the FINOS Common Domain Model for collateral management, written in the Rune DSL and generated like
CDM itself (decisions `wp-adr-cdm-local-extensions`, `wp-adr-cdm-extension-rune`), to Java (`wp-adr-java-cdm-stack`).
Not part of FINOS CDM and not proposed to FINOS. Gaps are numbered as in
[`../docs/cdm-development/gap-register.md`](../docs/cdm-development/gap-register.md).

Built on CDM **7.7.0** (`org.finos.cdm:cdm-java` on Maven Central) with CDM's own toolchain:
`org.finos.rune:rune-maven-plugin` **10.15.1** (CDM 7.7.0's DSL version) with `RosettaStandaloneSetup`.

## Contents

| File | What |
|---|---|
| `rosetta/cdmx-collateral-proposal-type.rosetta` | G2: `CollateralProposal`, `CollateralProposalDecision`, `CollateralProposalStatusEnum`, with conditions |
| `rosetta/cdmx-collateral-proposal-func.rosetta` | G2: `ProposalCoversAgreedAmount`, `DecideCollateralProposal` |
| `rosetta/cdmx-collateral-margincall-type.rosetta` | G1, G3, G4, G6: `MarginCallState` (call, response, agreed and disputed amounts, proposals, settlement, step records), one instruction type per step, status and step enums |
| `rosetta/cdmx-collateral-margincall-func.rosetta` | `Create_MarginCallState` (applies the one step the call waits for), `NextMarginCallStep`, one `Apply…` function per step |
| `rosetta/cdmx-collateral-event-type.rosetta` | G1, G4: `CollateralEvent` (one applied step: instruction, before and after state, qualifier, transfers) |
| `rosetta/cdmx-collateral-event-func.rosetta` | `Create_CollateralEvent`, `QualifyCollateralEvent` and nine `Qualify_…` functions |
| `rosetta/cdmx-collateral-transfer-func.rosetta` | G4: `Create_CollateralTransfer` (one collateral position as a settled CDM `TransferState`) |
| `rosetta/cdmx-collateral-valuation-func.rosetta` | G7 (defect D1): `CorrectedPostedCreditSupportItemAmount` (additional haircut applied, absent haircuts count as zero) and `CorrectedUndisputedAdjustedPostedCreditSupportAmount`, `CorrectedDeliveryAmount`, `CorrectedReturnAmount` built on it |
| `rosetta/cdmx-collateral-portfolio-func.rosetta` | G5: `ApplyCollateralEvent` (CDM `CollateralPortfolio` after one event: positions netted per asset, one settled post-haircut `CollateralBalance` from pledgor to secured party), `NetCollateralPosition`, `HeldQuantity` |
| `rosetta/cdmx-collateral-concentration-type.rosetta`, `-func.rosetta` | G8: `ConcentrationLimitBreaches` (CDM `ConcentrationLimit`s of an `EligibleCollateralSpecification` evaluated on the value after haircuts of the collateral held and proposed; criteria matched with CDM `CheckCriteria`; limits per asset, per issuer or untyped), `ValuedCollateral`, `ConcentrationLimitBreach` |
| `rosetta/cdmx-collateral-exposure-type.rosetta`, `-func.rosetta` | G10: `NettingSet` (one mark-to-market value per transaction, from a valuation party), `NettedExposure` (the secured party's Exposure, opposite signs offset) |
| `rosetta/cdmx-collateral-valuation-vm-func.rosetta` | G9: `CreditSupportAmountVM`, `DeliveryAmountVM`, `ReturnAmountVM` (2016 VM CSA, on the G7 valuation of the credit support held) |
| `rosetta/cdmx-collateral-closeout-type.rosetta`, `-func.rosetta` | G15: `EarlyTerminationAmount` (ISDA 2002 MA Section 6(e)(i): Close-out Amounts and Unpaid Amounts netted), `CloseOutNetting` (`CloseOutStatement`: collateral applied under security interest, or netted as an Unpaid Amount under title transfer; amount payable), `CloseOutAmount`, `UnpaidAmount`, `CollateralArrangementEnum` |
| `rosetta/cdmx-collateral-enforcement-type.rosetta`, `-func.rosetta` | G14: `Create_CollateralEnforcement` (`CollateralEnforcement` event: positions taken out of the `CollateralPortfolio` and transferred to the secured party), `EnforcementEventOccurred` (CDM `SecurityAgreementElections -> enforcementEvent`), `Qualify_CollateralEnforced`, `DefaultNotice`, `EnforcementInstruction`, `EventOfDefaultEnum` |
| `pom.xml`, `mvnw`, `mvnw.cmd`, `.mvn/` | Maven build (wrapper pins Maven 3.9.11): unpacks CDM's `.rosetta` files from the `cdm-java` jar (to resolve references), generates Java for `cdmx.*` only (`src/main/resources/rune-config.yml`), compiles, runs the tests |
| `src/test/java/cdmx/ProposalTest.java` | Proposal functions, pre-conditions, type conditions, Rune JSON round trip |
| `src/test/java/cdmx/MarginCallTest.java` | The console scenarios (im-call, im-dispute, im-return) through the lifecycle; wrong order, amounts and currencies rejected; earlier states unchanged; CDM's full validation of the settled state |
| `src/test/java/cdmx/EventTest.java` | The same scenarios as events: qualifiers, transfers on delivery and return, CDM's full validation of every event |
| `src/test/java/cdmx/ValuationTest.java` | G7: D1 in CDM 7.7.0 against the corrected value; absent haircuts; disputed values; Delivery and Return Amounts (IM) with rounding, MTA and disputes; currency check |
| `src/test/java/cdmx/PortfolioTest.java` | G5: delivery and return settle into the portfolio; netting per asset; full release; steps before settlement; over-release rejected; CDM validation and Rune JSON round trip |
| `src/test/java/cdmx/ConcentrationTest.java` | G8: im-dispute (all-fund proposal over the 50% limit, the accepted mix within it); held collateral counted; per-asset and per-issuer limits; inclusive bounds; exclusion criteria; market-data limits and other currencies rejected |
| `src/test/java/cdmx/VariationMarginTest.java` | G9, G10: vm-call and vm-return from a netting set; offsetting trades; negative exposure; threshold; MTA; rounding; disputes; currency and party checks |
| `src/test/java/cdmx/CloseOutTest.java` | G15: im-default (pledged collateral applied, surplus owed back); shortfall; netting of trades and Unpaid Amounts; negative Early Termination Amount; title transfer with the Credit Support Balance as an Unpaid Amount; party and currency checks; Rune JSON round trip |
| `src/test/java/cdmx/EnforcementTest.java` | G14: im-default (all pledged tUST moved to BANK-B, realised value applied in the close-out); partial enforcement; Enforcement Event by election (Early Termination Date, Failure to Pay); pledgor, secured party, exclusive control, quantity and balance checks; Rune JSON round trip |
| `src/test/java/cdmx/Data.java` | Rune JSON builders for test data |
| `src/test/java/cdmx/Cdm.java` | CDM Java runtime for the tests: Guice injector with `CdmRuntimeModule`, `RuneJsonObjectMapper`, `RosettaTypeValidator` |

## Build and test

```bash
cd cdm-ext && ./mvnw test      # needs Java 21; the wrapper fetches Maven 3.9.11; about 30 s with dependencies cached
```

`target/` (ignored by git) holds CDM's unpacked `.rosetta` files, the generated Java (84 files) and the build.

Notes on the Java runtime:

- A failed condition raises `ConditionValidator.ConditionException` carrying the condition's description (not its
  name); conditions the tests check all have a description.
- An absent list attribute reads as `null`.
- Rune JSON: a document needs the top-level `@type`; a choice value (`Asset`, `Transfer`) is written as the chosen
  option with its own `@type` (`"asset": {"@type": "cdm.base.staticdata.asset.common.Security", ...}`), as in
  CDM's samples and `docs/serialization.md`.
- The model version is written as `"@version": "${project.version}"`: the extension's version is not set yet.

## Python build (retired 2026-10-18)

Until 2026-10-18 the extension was generated with the Rune Python generator 10.15.1.0 and run on the published
`finos-cdm` 7.7.0 package. It needed a runtime workaround layer and Rune written around generator defects, and CDM's
full validation of positions failed; Python and Java Rune JSON differ for choice types (defects D14, D15, D16 in
[`../docs/analysis/defects.md`](../docs/analysis/defects.md)). The Java spike passed the same 23 tests with none of
that, and the project moved to Java (`wp-adr-java-cdm-stack`). The Python build, its tests and the workaround module
(`build.sh`, `tests/`) are kept at commit `e1a2e6f` as a reproduction for the CDM Python maintainers.

| Check (2026-10-18) | Python | Java |
|---|---|---|
| Generation of the four `cdmx` namespaces | passes | passes, no warnings |
| The 23 tests | pass with the workaround layer and the Rune written around D15 | pass with no workarounds |
| CDM's own conditions on positions with an asset | fail in CDM's generated code (`PriceQuantityTriangulation`) | pass |
| Build and test time | about 80 s generation plus 18–25 s tests | about 30 s from clean, 10 s again |

The Rune keeps the forms chosen for the Python generator (listed below); they are valid Rune and work in Java.
Whether some can be simplified for Java is not checked.

## Margin call lifecycle (G1, G3, G4, G6)

CDM 7.7.0 runs multi-step processes as an instruction composition: a state record, one instruction per step, a
function that applies a step and one that names the next step. Its state type is a closed CDM choice, so the
extension mirrors the pattern in `cdmx.collateral.margincall` instead of extending it.

| Step (`MarginCallStepEnum`) | Instruction | Allowed when | Effect |
|---|---|---|---|
| IssueCall | `IssueCallInstruction` (CDM `MarginCallIssuance` + Delivery or Return) | no state yet | status Issued |
| RespondToCall | CDM `MarginCallResponse` | Issued | agreed and disputed amounts; Agreed, PartiallyAgreed or Disputed |
| ProposeCollateral | `CollateralProposal` (G2) | delivery call, agreed, nothing pending or accepted | proposal added |
| DecideProposal | `DecideProposalInstruction` | a proposal pending | proposal Accepted or Rejected (rejected: propose again) |
| SettleCall | `SettleCallInstruction` | delivery: a proposal accepted; return: agreed | Settled; any disputed amount stays recorded |

Each step takes its timestamp as an input, so the ledger's block time can be used and tests are deterministic. The call names its pledgor and secured party in
CDM's `MarginCallBase -> partyRole` (condition `PledgorAndSecuredParty`); they are the payer and receiver of the
transfers. Not covered yet: balance updates (G5) and dispute resolution beyond recording the disputed amount (G3).

## Events, qualification and transfers (G1, G4)

CDM records a lifecycle step as a `BusinessEvent`: the instruction, the state after it, an `eventQualifier` set by
qualification functions (`Qualify_…`), and transfers. `BusinessEvent` records trade states (`TradeState`), and CDM's
`Create_Transfer` builds transfers from a trade; a margin call has no trade, and `EventIntentEnum` has no collateral
value. `cdmx.collateral.event` therefore has its own event type of the same shape, and `cdmx.collateral.transfer`
builds CDM's own `TransferState`.

`Create_CollateralEvent(before, stepIdentifier, eventDate, timestamp, instruction)` applies the step with
`Create_MarginCallState` and returns a `CollateralEvent` with `before`, `after`, `eventQualifier` and, for a
settlement, one transfer per collateral position:

| Step | `eventQualifier` | Transfers |
|---|---|---|
| IssueCall | `MarginCallIssued` | none |
| RespondToCall | `MarginCallAgreed`, `MarginCallPartiallyAgreed` or `MarginCallDisputed` | none |
| ProposeCollateral | `CollateralProposed` | none |
| DecideProposal | `CollateralProposalAccepted` or `CollateralProposalRejected` | none |
| SettleCall, delivery | `CollateralDelivered` | each position of the accepted proposal, pledgor → secured party |
| SettleCall, return | `CollateralReturned` | each released position, secured party → pledgor |

Each transfer is a CDM `TransferState` holding an `UnscheduledTransfer` (quantity, asset, settlement date = event
date, payer and receiver) with status `Settled`. CDM's `UnscheduledTransferEnum` has no collateral delivery or return
value (its `Return` is the securities-lending return), so `transferType` stays absent. The transfers pass all of
CDM's own conditions (tested).

## Rune forms chosen for the retired Python generator (defect D15)

| Behaviour in generated Python | Written as |
|---|---|
| A function's pre-conditions run before its aliases are assigned, so a condition using an alias sees nothing | Conditions spell out the full paths |
| `set a -> b -> c` on an absent `b` does not create `b` | Constructor expression `B { c: …, ... }` |
| A single item given to a list attribute in a constructor is not wrapped in a list | `[item]` |
| `add` to an absent list fails; list literals do not flatten | `set` the list from a `filter` (always a list), then `add` |
| A function called inside `filter` or `extract` is not imported (from the same namespace or another) | Paths written out instead of the helper; `Create_CollateralTransfer` kept in its own namespace |
| `if … then … else` inside `extract` builds closures that miss `item` | Update written as "others, then the changed one"; one `extract` per branch |
| `set next: state` followed by `set next -> attribute` writes through to the caller's `state` (seen when the state is also stored in an event) | Each step builds a new object with a constructor |
| `if … then …` without `else` returns `True` when the condition is false | `else empty` written out |
| An `empty` function result is `[]`, not `None` | Callers treat both as "nothing" (Java returns `null`) |

The caller's objects are not changed by a step, and an event's `before` state equals the previous event's `after` state (tested).

