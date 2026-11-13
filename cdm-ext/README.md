# Local CDM extension (`cdmx`)

Extensions to the FINOS Common Domain Model for collateral management, written in the Rune DSL and generated like
CDM itself (decisions `wp-adr-cdm-local-extensions`, `wp-adr-cdm-extension-rune`), to Java (`wp-adr-java-cdm-stack`).
Not part of FINOS CDM and not proposed to FINOS. Gaps are numbered as in
[`../docs/analysis/gap-register.md`](../docs/analysis/gap-register.md).

Built on CDM **7.7.0** (`org.finos.cdm:cdm-java` on Maven Central) with CDM's own toolchain:
`org.finos.rune:rune-maven-plugin` **10.15.1** (CDM 7.7.0's DSL version) with `RosettaStandaloneSetup`.

## Contents

| File | What |
|---|---|
| `rosetta/cdmx-collateral-proposal-type.rosetta` | G2: `CollateralProposal`, `CollateralProposalDecision`, `CollateralProposalStatusEnum`, with conditions |
| `rosetta/cdmx-collateral-proposal-func.rosetta` | G2: `ProposalCoversAgreedAmount`, `DecideCollateralProposal` |
| `rosetta/cdmx-collateral-margincall-type.rosetta` | G1, G3, G4, G6: `MarginCallState` (call, response, agreed and disputed amounts, proposals, settlement, step records), one instruction type per step, status and step enums; cancellation (`Cancelled` status, withdrawal, cancellation requests and their decisions, `task-csa-call-cancellation`); a return's `SettleCallInstruction.returnedMarginType` states whether it released escrowed IM (`RegIM`) or paid VM back (`VM`), for the escrow positions of the ledger reconciliation (`task-csa-reconciliation`) |
| `rosetta/cdmx-collateral-margincall-func.rosetta` | `Create_MarginCallState` (applies the one step the call waits for), `NextMarginCallStep`, `CancellationStepAllowed` (withdrawal while unanswered, a cancellation request once answered and not settled), one `Apply…` function per step; an accepted cancellation voids a proposal not delivered (`VoidProposal`) |
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
| `rosetta/cdmx-collateral-substitution-type.rosetta`, `-func.rosetta` | G16: `Create_CollateralSubstitution` (`CollateralSubstitution` event: request, consent, settlement under ISDA CSA Paragraph 4(d); portfolio updated on settlement), `Create_SubstitutionState`, `SubstitutionNeedsConsent` (CDM `Substitution` elections), four `Qualify_` functions with `Qualify_CollateralSubstituted` replacing CDM's `Qualify_Substitution` for CSA collateral (D5) |
| `rosetta/cdmx-collateral-interest-type.rosetta`, `-func.rosetta` | G17: `Create_CollateralInterestStatement` (`CollateralInterestStatement` for one Interest Period on cash collateral: daily accrual, rounding, withholding tax, write-off, and the split into transfer and collateral adjustment by CDM's `CollateralInterestHandlingParameters`), `CollateralInterestAccrual`, `CollateralInterestRate` (fixed, or floating with floor, cap, spread, compressible spread and the negative interest election), `CashCollateralDay`, `InterestAccrualDay` |
| `rosetta/cdmx-collateral-netting-type.rosetta`, `-func.rosetta` | Settlement netting (`task-csa-settlement-netting`, CSA matrix row 22, no gap ID): `Create_SettlementNetting` (`SettlementNettingStatement`: the `SettlementObligation`s due between two parties on one day in one currency, each a VM `DeliveryAmount`, a VM `ReturnAmount` or an `InterestAmount`, summed per direction to one net transfer, its payer and receiver); an Interest Amount only under CDM's `netInterestWithMarginCalls`, and with at least one margin movement. `SettleCallInstruction.nettingIdentifier` names the netting a call settled in |
| `rosetta/cdmx-collateral-allocation-type.rosetta`, `-func.rosetta` | G34 collateral allocation (`task-csa-allocation`, `wp-adr-allocation-scope`): `AllocateCollateral` fills an agreed amount from the pledgor's ranked `AllocationCandidate`s (holding, unit price, eligibility, haircut), eligible assets only, in rank order, the last asset rounded up to whole units; the `CollateralAllocation` is absent of positions when the inventory cannot cover the amount. No concentration limits |
| `rosetta/cdmx-collateral-reconciliation-type.rosetta`, `-func.rosetta` | G35 reconciliation (`task-csa-reconciliation`, `wp-adr-reconciliation-scope`): `ReconcilePortfolios` matches two parties' `PortfolioSnapshot`s (trades and each party's valuation, a `NettingSet`) by UTI and reports a trade missing on one side, different key terms (`ExtractTradeKeyTerms`: product, notional, dates, fixed rate, floating index, fixed rate payer) or valuations that do not offset within a tolerance, with each party's exposure; `ReconcileWithLedger` compares the facts a party's records state with the ledger's (missing on either side, value differs). Key terms and tolerance await `task-sme-reconciliation-rules` |
| `rosetta/cdmx-collateral-amendment-type.rosetta`, `-func.rosetta` | Amendment of agreement terms (`task-csa-amendment`): `Create_CollateralAgreementAmendment` (`CollateralAgreementAmendment`: the IM CSA elections amended through CDM's `Create_AgreementEvent`, intent `AmendedTerms`; the eligibility schedule after per-asset `HaircutChange`s), `Qualify_AgreementTermsChange` and `QualifiedAgreementEvent` (CDM leaves the agreement event unqualified), `ApplyHaircutChanges` (replaces the matching `AssetIdentifier` criterion; CDM's `CloneEligibleCollateralWithChangedTreatment` overwrites the first criterion, D18), `MinimumTransferAmountFor`, `HaircutFor`, `InitialMarginElections`, `AssetIdentifierCriterion` |
| `rosetta/cdmx-collateral-dispute-type.rosetta`, `-func.rosetta` | G3: `Create_Dispute` (`Dispute` record from the call's amounts), `ResolveDispute` (by agreement, or by recalculation after the Resolution Time; additional amount due) |
| `rosetta/cdmx-collateral-ledger-type.rosetta`, `-func.rosetta` | G24: `TokenizedAsset` (network, contract, standard, DTI, authoritative record), `TokenForAsset`, `AssetForToken`. G25: `LedgerAnchor`, an append-only record built from chain data by `Create_LedgerAnchor` (the hash of the record's instruction and its `LedgerTransaction`s, each Mined, Final or Reverted); `AnchorFor`, `AnchorStatus` (Missing, Pending, Complete, Failed), `MarginCallStepAnchorStatus`; `TransferComplete` with `RecordKeeperConfirmation` for Registered and Claim tokens (provisional, pending the SME). CDM events and states hold no ledger data |
| `rosetta/cdmx-collateral-triparty-revaluation-type.rosetta`, `-func.rosetta` | Triparty revaluation (`task-triparty-revaluation`, `wp-adr-triparty-revaluation`, T4, T6): `RevalueTriparty` values a settled repo's holding at the feed prices after the profile's haircuts against `TripartyRequiredValue` (Purchase Price plus the Price Differential accrued to the date, to the cent); a shortfall is topped up from the giver's free account in the giver's ranking, an asset under a limit capped with the units already held; an excess is released from the asset with the highest rank number, whole units rounded down; nothing moves when the free account cannot cover the shortfall (`Uncovered`); breaches after the revaluation are recorded. `TripartyRevaluation` holds the inputs, the holdings before and after, the movements, the outcome and the CDM valuation and terms-change events. `RepoIsCollateralTopUp` and `RepoIsCollateralRelease` tell a top-up and a release from a substitution, which CDM's qualifiers do not (D20, D22) |
| `rosetta/cdmx-collateral-triparty-substitution-type.rosetta` (functions in `cdmx-collateral-triparty-revaluation-func.rosetta`) | Triparty substitution (`task-triparty-substitution`, `wp-adr-triparty-substitution`, T8): `TripartySubstitutionRequest` (the trade, the ISIN and units asked back, the requester: the giver, or the agent for an excess over a limit); `SubstituteTriparty` returns the units to the free account and tops the rest of the holding up from the free account in the giver's ranking, without the returned asset and within the limits, until it covers the required value, or declines (`Declined`) when it cannot or the repo holds fewer units. `TripartySubstitution` holds the inputs, the holdings before and after, the movements, the outcome, the breaches, the CDM terms change and CDM's proposed and accepted workflow steps |
| `rosetta/cdmx-collateral-triparty-trade-end-type.rosetta` (function `TripartyReleaseCoversHolding` in `cdmx-collateral-triparty-revaluation-func.rosetta`) | Triparty trade end (`task-triparty-trade-end`, `wp-adr-triparty-trade-end`, T9): `TripartyTradeEnd` holds CDM's repurchase event over the repo (D25), one CDM `ScheduledTransfer` per held asset from the receiver to the giver and the Repurchase Price from the giver to the receiver, on the Repurchase Date; its conditions require the release to be the repo's collateral portfolio unit for unit, which CDM's repurchase event leaves in the closed trade |
| `rosetta/cdmx-collateral-triparty-report-type.rosetta` | Triparty reporting (`task-triparty-reporting`, `wp-adr-triparty-reporting`, T10, T12): `TripartyReport` for one terms on a date, with a `TripartyRepoReport` per settled repo (the exposure, the valued holding, the value after haircuts, the coverage, the breaches and CDM's `CollateralPortfolio` of the holding with its balances after and before haircuts) and the giver's free collateral as a `CollateralPortfolio` without a balance; conditions tie the value, the coverage and the post-haircut balance to the valued positions |
| `rosetta/cdmx-collateral-ccp-type.rosetta` | CCP membership (`task-ccp-membership`, `wp-adr-ccp-membership`, G23): `CcpRulebook` with the CCP in CDM's `ClearingOrganization` role, a `CcpMember` per clearing member (its default fund share and its agreement with the CCP as CDM's `LegalAgreementBase` of type `Other`, "CCP rulebook"; `LegalAgreementBase` has exactly two contractual parties, so there is one agreement per member), the initial margin rate, the variation margin period, the default fund and the CCP's capital; conditions that the shares make the fund, the members are distinct and not the CCP, each agreement names the CCP and its member (function `CcpMembersWithoutTheCcp`), and every amount is in the base currency |
| `rosetta/cdmx-collateral-ccp-clearing-type.rosetta` | CCP clearing (`task-ccp-clearing`, `wp-adr-ccp-clearing`, G23): `CcpNovation` holds the rulebook hash, the bilateral trade hash, the CCP in CDM's `ClearingOrganization` role and CDM's clearing event, a split with intent `Clearing` in three branches (a party change of each counterparty to the CCP and a quantity change to zero that closes the bilateral trade); its conditions require `Qualify_ClearedTrade` and the CCP on both open trades (function `CcpTradesWithoutTheCcp`) |
| `rosetta/cdmx-collateral-ccp-margin-type.rosetta` | CCP margin (`task-ccp-margin`, `wp-adr-ccp-margin`, G23): `CcpMarginStatement` is a member's margin for a business date: a `CcpVariationMarginLine` per cleared repo (GMRA Transaction Exposure at the Margin Ratio less the variation margin paid, from the seller's side; none once repurchased), the initial margin at the rulebook's rate of the open repos' Purchase Prices less what is held, the net, and CDM's `MarginCallIssuance` with `VM` and `NonRegIM` exactly when the member pays them (functions `CcpRepoExposure`, `CcpMemberVariationMargin`, `CcpInitialMarginRequired`, `CcpLinesWithoutTheMember`, `CcpCallCount`, `CcpCallAmount`) |
| `rosetta/cdmx-collateral-ccp-default-type.rosetta` | CCP member default (`task-ccp-default`, `wp-adr-ccp-default`, G23): `CcpDefaultManagement` holds the close-out of each of the defaulter's cleared repos (`CcpDefaultTransaction`: both legs' GMRA default values, the residual after the variation margin paid and the survivor's amount) and the `CcpWaterfall` over the loss in the rulebook's order, with what is returned to the defaulter (functions `CcpWaterfallLayer`, `CcpTransactionsWithoutTheDefaulter`) |
| `rosetta/cdmx-collateral-ccp-porting-type.rosetta` | CCP admission and porting (`task-ccp-porting`, `wp-adr-ccp-porting`, G23): `CcpAdmission` admits a member to the rulebook in effect with its `CcpMember`; `CcpPorting` holds CDM's party change of one cleared leg to the receiving member with intent `Novation` and the payment at the oracle's price; its conditions check the intent, the two members, the receiving member on the one open leg and the payment |
| `rosetta/cdmx-collateral-gmra-type.rosetta`, `-func.rosetta` | GMRA 2011 terms and their amendment (`task-repo-gmra-terms`, `wp-adr-repo-gmra-terms`, G19, G20): `GmraTerms` holds the Annex I elections next to CDM's `LegalAgreement`, whose `GlobalMasterRepoAgreement` has no attributes; `GmraTermsAmendment`, `Create_GmraTermsAmendment`, `Qualify_GmraTermsChange`, `GmraMinimumTransferAmountFor` |
| `rosetta/cdmx-collateral-repo-type.rosetta`, `-func.rosetta` | Repo purchase and repurchase (`task-repo-purchase-repurchase`, `wp-adr-repo-purchase-repurchase`): `RepoSettlement` of each leg on CDM's `TradeState`; the prices `RepoPurchasePrice`, `RepoPriceDifferential`, `RepoRepurchasePrice`; the settlement records `RepoManufacturedIncome`, `BuySellBackIncome` and `RepoPairOffSettlement` |
| `rosetta/cdmx-collateral-repo-margin-type.rosetta`, `-func.rosetta` | GMRA margin maintenance (`task-repo-margin-maintenance`, G12, D2), repricing, adjustment, substitution and income: `RepoNetExposure`, `RepoMarginCallAmount`, `RepoPurchasePriceForMarketValue` (D2), `RepoIsReprice` and `RepoIsAdjustment` (D20), `RepoAdjustmentInstruction` (D21), `RepoIsSubstitution` (D22), `RepoManufacturedIncomeAmount`, `RepoNetMarginInterestStatement` |
| `rosetta/cdmx-collateral-repo-pairoff-func.rosetta` | Pair-off of two offsetting repos (`task-repo-pair-off`, `wp-adr-repo-pair-off`, D24): `RepoPairOffEvent`, `RepoIsPairOff`, `RepoPairOffNetAmount` |
| `rosetta/cdmx-collateral-repo-bsb-func.rosetta` | Buy/sell-back economics (`task-repo-buy-sell-back`, G33): `RepoIsBuySellBack`, `BuySellBackIncomeDeduction`, `BuySellBackSellBackPrice` |
| `rosetta/cdmx-collateral-repo-default-type.rosetta`, `-func.rosetta` | GMRA Event of Default and close-out, paragraph 10 (`task-repo-default-close-out`, G15): `GmraDefaultNotice`, `GmraCloseOutStatement` with each Transaction's Default Market Value, held margin and unpaid income; `GmraCloseOutNetAmount` |
| `rosetta/cdmx-collateral-gmsla-type.rosetta`, `-func.rosetta` | GMSLA 2010 terms and their amendment (`task-gmsla-terms`, `wp-adr-gmsla-terms`, G19, G21, D28): `GmslaTerms` (condition `IsGmsla`) with the elections CDM's type lacks, `GmslaTermsAmendment`, `Create_GmslaTermsAmendment`, `GmslaMinimumTransferAmountFor` |
| `rosetta/cdmx-collateral-gmsla-loan-type.rosetta`, `-func.rosetta` | Securities loan delivery and return (`task-gmsla-loan-delivery-return`, G18, G33, D4, D26): `GmslaLoan`, `GmslaLoanSettlement`, `GmslaRequiredCollateral`, `GmslaReturnCollateral`, `Qualify_GmslaReturn` |
| `rosetta/cdmx-collateral-gmsla-mark-type.rosetta`, `-func.rosetta` | Marking to market (`task-gmsla-marking`, G12, D29): `GmslaMarkStatement`, `GmslaLoanRequirement`, `GmslaNetExposure`, `GmslaMarginCallAmount` |
| `rosetta/cdmx-collateral-gmsla-recall-type.rosetta`, `-func.rosetta` | Recall of loaned securities (`task-gmsla-recall`, G18): `GmslaRecallNotice`, `GmslaRecallWithdrawal`, `GmslaRecallSettlementDate`, `GmslaRecallOverdue`, `GmslaRecallRemaining` |
| `rosetta/cdmx-collateral-gmsla-substitution-type.rosetta`, `-func.rosetta` | Substitution of non-cash collateral (`task-gmsla-substitution`, G16): `GmslaLoanSubstitution`, `GmslaIsSubstitution` |
| `rosetta/cdmx-collateral-gmsla-invoice-type.rosetta`, `-func.rosetta` | Rebate and lending fee invoices (`task-gmsla-rebate`, `task-gmsla-lending-fee`, G17, D27): `GmslaLoanInvoice`, `GmslaInvoicePeriod`, `GmslaInvoiceTotal` |
| `rosetta/cdmx-collateral-gmsla-default-type.rosetta`, `-func.rosetta` | GMSLA Event of Default and close-out, paragraph 11 (`task-gmsla-default-close-out`, G15): `GmslaDefaultNotice`, `GmslaCloseOutStatement`, `GmslaCloseOutNetAmount` |
| `rosetta/cdmx-collateral-triparty-type.rosetta`, `-func.rosetta` | Triparty terms and the agent's allocation (`task-triparty-terms-profile`, `task-triparty-trade-start`, G22, D30): `TripartyTerms`, `TripartyRepoRequest`, `TripartyDeposit`, `TripartyAllocation`; `AllocateTriparty` against the collateral profile, `ProfileCriterion` and `TripartyConcentrationBreaches` by ISIN |
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
| `src/test/java/cdmx/SubstitutionTest.java` | G16: tUST swapped for money market fund tokens without and with a consent election; refusal; consent only where needed; the other party's election; substitute value, held items, identifier and step order checks; Rune JSON round trip |
| `src/test/java/cdmx/InterestTest.java` | G17: a month on USD 10m of cash at SOFR minus 10 bp, ACT/360; changing balances; negative interest, the zero rate floor, compressible spread, floor; fixed rate; daily and period-end rounding; withholding tax; Adjust, rollover and write-off limits; the Standard and TransferIfDeliveryAmountBelowMTA alternatives; day, currency, compounding and observation checks; Rune JSON round trip |
| `src/test/java/cdmx/NettingTest.java` | Settlement netting: a delivery and a return net to one transfer; either party as payer; an Interest Amount under the election; movements that offset; the election required; interest alone, different days, currencies or parties, and a call netted twice rejected; obligation checks; a SettleCall step naming the netting |
| `src/test/java/cdmx/AllocationTest.java` | G34: allocation in rank order (not list order); the last asset rounded up; one asset alone; exact fit; ineligible, empty and fully haircut holdings skipped; nothing suggested when the inventory cannot cover; currency, rank and amount checks; type conditions; Rune JSON round trip |
| `src/test/java/cdmx/ReconciliationTest.java` | G35: key terms of CDM's sample EUR swap; the partyA/partyB views reconcile; a valuation difference within and above the tolerance; different notional and fixed rate, and a swapped payer, named as differing terms; a trade on one side only, in both directions; the same result for both parties and a JSON round trip; pair, tolerance and snapshot checks; records against the ledger: agreeing facts, each kind of break, one value per fact |
| `src/test/java/cdmx/CancellationTest.java` | Withdrawal of an unanswered call; request and acceptance or refusal after a response, one at a time, decided by the other party; proposals voided; wholly disputed calls cancelled, settled ones not; qualifiers; Rune JSON round trip |
| `src/test/java/cdmx/AmendmentTest.java` | Amendment on CDM's sample 2018 NY law IM CSA: MTA change through CDM's agreement event (qualified, agreement before unchanged); haircut change keeping the concentration limit; asset excluded and added; elections and haircuts together; no-change, same-elections, duplicate-asset and effective-date checks; D18 shown; Rune JSON round trip |
| `src/test/resources/cdm-samples/01-2018-NY-Law-IM-CSA.json` | CDM's published sample IM CSA, unchanged: `examples/samples/legal-agreements/Isda-Credit-Support-Annex-Docs/IM-CSA-Sample-Data/01-2018-NY-Law-IM-CSA/` at common-domain-model tag `7.7.0`, under the Community Specification License 1.0 (FINOS). Read with CDM's `RosettaObjectMapper` (the sample is in CDM's earlier JSON form) |
| `src/test/java/cdmx/DisputeTest.java` | G3: im-dispute (USD 0.5m of USD 12.4m disputed); resolution by agreement and by recalculation; Resolution Time, range, once-only, undisputed call and party checks; Rune JSON round trip |
| `src/test/java/cdmx/LedgerTest.java` | G24, G25: tUST and tMMF tokens on the prototype Besu network both ways; unknown and duplicate tokens; record keeper and standard checks; instruction hash (keccak256 over Rune JSON) stable across a round trip; a settled step anchored from chain events, the same anchor for both parties, the event unchanged; no anchor without the hash on-chain; anchor status from the transactions; an enforcement anchored on its instruction; Bearer against Registered completion; Rune JSON round trip |
| `src/test/java/cdmx/ReclaimTest.java` | Two-way initial margin: the pledgor's reclaim on default (`wp-adr-two-way-im`) |
| `src/test/java/cdmx/ReplacementTest.java` | A call that replaces a cancelled call (`task-csa-call-replacement`) |
| `src/test/java/cdmx/GmraTermsTest.java`, `RepoTest.java`, `RepoMarginTest.java`, `PairOffTest.java`, `BuySellBackTest.java`, `DefaultCloseOutTest.java` | Repo under the GMRA: terms, prices, margin maintenance with repricing, adjustment and substitution, pair-off, buy/sell-back, default close-out |
| `src/test/java/cdmx/GmslaTermsTest.java`, `GmslaLoanTest.java`, `GmslaMarkTest.java`, `GmslaRecallTest.java`, `GmslaDefaultTest.java` | Securities lending under the GMSLA: terms, delivery and return, marking, recall, default close-out |
| `src/test/java/cdmx/TripartyTermsTest.java`, `TripartyAllocationTest.java`, `TripartyRevaluationTest.java`, `TripartySubstitutionTest.java` | Triparty: terms and profile, the agent's allocation, revaluation, substitution |
| `src/test/java/cdmx/CcpRulebookTest.java`, `CcpNovationTest.java`, `CcpRiskTest.java` | CCP: the rulebook, clearing by novation, margin, member default and porting |
| `src/test/java/cdmx/Data.java` | Rune JSON builders for test data |
| `src/test/java/cdmx/Cdm.java` | CDM Java runtime for the tests: Guice injector with `CdmRuntimeModule`, `RuneJsonObjectMapper`, `RosettaTypeValidator` |

## Build and test

```bash
cd cdm-ext && ./mvnw test      # needs Java 21; the wrapper fetches Maven 3.9.11; about 30 s with dependencies cached
```

`target/` (ignored by git) holds CDM's unpacked `.rosetta` files, the generated Java and the build.

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
transfers. Balance updates (G5) are in `cdmx.collateral.portfolio`; dispute resolution (G3) is in `cdmx.collateral.dispute`, next to the call.

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

