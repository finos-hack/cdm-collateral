```yaml
id: task-triparty-revaluation
type: task
title: Triparty daily revaluation by the agent, with top-up or release
status: open
review: accepted
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-12T04:13:02Z
```
# Task: Triparty daily revaluation by the agent, with top-up or release

Row 22 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no required collateral value from the agent (T6, score 0); haircuts generic (T4).
- **Scope:** The agent revalues the allocated collateral at the oracle prices against the exposure and the profile, and tops up from the giver's balance or releases the excess to it.
- **`cdm-ext`:** the agent's revaluation and its top-up or release amounts over the allocation.
- **Prototype:** BANK-T's service revalues on request; `TripartySettlement` moves the top-up or release on the agent's books; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.

**Binding switch** from [[task-triparty-trade-start]] to this task on the project owner's "Row 22 first"
(2026-11-12), on branch `triparty`.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the trade-start repo (500,000 tUSD at 5% from
2026-11-12 to 2026-11-19, 3,000 tUST and 2,190 tAGY allocated), revalued on 2026-11-15 with tUST falling from 98.4 to
96.0 and tAGY from 99.2 to 97.0:

- **Required value.** cdm-ext `RepoPurchasePrice` plus `RepoPriceDifferential` to the revaluation date gives
  500,208.33 on the allocated form; the Repurchase Price stays 500,486.11. CDM has no function for the value the agent
  requires (T6).
- **Collateral value.** At the new prices the allocation is worth 488,297.10 after haircuts, 11,911.23 short; 127 more
  tAGY cover it. The cdm-ext per-ISIN check (`TripartyConcentrationBreaches`) measured against the required value finds
  no breach after the top-up (tAGY 43.6%). CDM has no valuation of an allocation after haircuts (T4 is generic).
- **Valuation record.** CDM's valuation instruction (`Create_Valuation`) adds the agent's collateral and trade
  valuations to the trade state's `valuationHistory`; the event validates and `Qualify_ValuationUpdate` is true. CDM's
  `Valuation` holds one amount per scope (`Collateral` or `Trade`), no per-position values, no haircut and no valuing
  party; it needs a `method` (`MarkToMarket`) or a `source`, and the only source is `CentralCounterparty`.
- **Top-up and release as an event.** A changed collateral portfolio (tAGY 2,190 to 2,317, or to 1,900 for a release)
  through `Create_SubstitutionInstruction` as a terms change, or through `Create_SubstitutionPrimitiveInstruction`,
  validates, keeps the repo a repurchase agreement and keeps the cash at 500,000. CDM qualifies none of them:
  `Qualify_Substitution` and `Qualify_Adjustment` are false (D22, D20), and `Create_BusinessEvent` sets no qualifier.
  cdm-ext `RepoIsSubstitution` is true for both a top-up and a release, so it cannot tell them from a substitution.
- **Effective date.** Passed the revaluation date, `Create_SubstitutionPrimitiveInstruction` moves the trade's effective
  date to it and the Repurchase Price falls to 500,277.78; with the trade's own Purchase Date it stays 500,486.11, as in
  [[wp-adr-repo-substitution]].
- **One event.** A terms change and a valuation together validate, and `Qualify_ValuationUpdate` is then false (it needs
  the valuation alone).

**Design chosen 2026-11-12** (source `6a7359a7984c74ea1532a50e8983f72646773375`: "1. (a) across the board"), recorded in
[[wp-adr-triparty-revaluation]]; the revaluation rules are questions for an SME in [[task-sme-triparty-revaluation]].

**Built 2026-11-12** to [[wp-adr-triparty-revaluation]]:

- **cdm-ext** (`cdmx.collateral.triparty`): `TripartyRevaluation` (conditions `NothingMovesUnlessToppedUpOrReleased`,
  `MovementsWhenToppedUpOrReleased`, `CoveredAfterTopUpOrRelease`, `TopUpOnlyTopsUp`, `ReleaseOnlyReleases`,
  `AdjustmentWhenUnitsMove`), `TripartyMovement`, `TripartyRevaluationOutcomeEnum`; `TripartyRequiredValue`,
  `TripartyTopUpUsable`, `TripartyTopUpUnits`, `TripartyReleaseUnits`, `RevalueTriparty`; the qualifiers
  `RepoIsCollateralTopUp` and `RepoIsCollateralRelease` (with `RepoCollateralUnits`). `TripartyRevaluationTest`, 9 tests.
- **Contract** `TripartySettlement.revalue` (agent only, settled repo: the old holding returns to the free account and
  the new one is taken from it in one transaction) and `revaluationsOf` (each hash with its block). 2 new hardhat
  tests (125 pass).
- **Gateway** routes `/ledger/v1/triparty/repos/:id/revalue`, `/revaluations` and `/at?block=` (the repo's holding,
  the free account and the feed prices at a block).
- **Service** `CdmTriparty.revalue` (the valuation event, the terms change with the trade's own Purchase Date, the
  qualifier check), `verifyRevaluation`, `revaluationView`, `tradeAfter`; the agent's `revalue` route and business
  date; the giver's and the receiver's recomputation from the chain at the block before each revaluation. A repo read
  back from a stored document has its scoped references unresolved, so `revalue` resolves the basis trade first.
  `CdmTripartyRevaluationTest`, 5 tests.
- **Console**: `Revalue collateral` in `#/live/T`; each revaluation with its outcome, movements, breaches and check.
- **Live spec** `flow-triparty-revaluation`. bank-b's test balance targets are now 11,000 tUST and 12,000 tAGY.

**Full run 2026-11-12**, in a Claude Code cloud session set up by `docs/setup/claude-code-cloud-setup.sh` (from `main`)
on a fresh chain: `cdm-ext` 307 tests, collateral service 127, oracle service 13, 125 contract tests, gateway and
console typechecks, 136 console tests, and the live suite, 45 of 45 in 27.6 min.
