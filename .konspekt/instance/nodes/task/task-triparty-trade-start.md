```yaml
id: task-triparty-trade-start
type: task
title: Triparty trade start: allocation by the agent and DvP of the cash
status: resolved
review: accepted
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-13T15:22:33Z
```
# Task: Triparty trade start: allocation by the agent and DvP of the cash

Row 21 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no allocation by an agent (T7, score 0), no triparty delivery method in `DeliveryMethodEnum` (T9, score 0); the repo itself qualifies with a `TripartyAgent` party.
- **Scope:** The pair agrees the repo (rows 1 to 11) and its exposure; the agent allocates collateral from the giver's balance it holds against the profile, cheapest eligible asset first within the haircuts and concentration limits (the CSA allocation), and settles the cash against the allocated collateral.
- **`cdm-ext`:** the agent's allocation as data (CDM's `CollateralPortfolio` and `CollateralBalance`) and the function that builds it from the profile and the giver's balance.
- **Prototype:** the giver deposits into `TripartySettlement`; BANK-T's service allocates; the contract delivers the cash against the allocation; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.

**Carried from [[task-triparty-terms-profile]]** (the project owner's choice of 2026-11-12, source `1ab22fca0b3d8cc65894a6f24667c190f1c1ee0e`): CDM's
`CheckCriteria` does not match the profile's ISIN criteria (defect D30), so the allocation's concentration limit is
checked by a per-ISIN concentration function in `cdm-ext`, built in this task.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the prototype's repo (1,000,000 tUSD at 4.3% for 7
days, BANK-A selling to BANK-B, `CdmRepo.execution`):

- **An allocated triparty repo is a CDM repo.** With BANK-T as a third party in the `TripartyAgent` role, the profile
  as `collateralProvisions.eligibleCollateral` and the collateral as two positions (6,000 tUST and 4,200 tAGY), CDM's
  execution event passes validation and the trade qualifies as a repurchase agreement; `RepoRepurchasePrice` gives
  the same 1,000,836. Setting `collateralPositionStatus` to `SettledAmount` changes neither.
- **Each position can state its own quantity.** With the single-security price and quantity removed from the trade's
  `priceQuantity` and each position's `AssetPayout` carrying its own quantity, the trade still validates and
  qualifies. The prototype's `CdmRepo.terms` reads the single-security form and fails on it.
- **No trade before an allocation.** A repo with the profile and no collateral position fails CDM's condition
  `CollateralCollateralExists` (it needs a collateral portfolio or an independent amount), and an independent amount
  alone would not qualify as a repurchase agreement, which needs an `AssetPayout` in a collateral position. The CDM
  trade can therefore be built only once the agent has allocated.
- **A basket underlier does not load.** A CDM `Basket` of tUST and tAGY as one position's underlier fails to
  deserialise: Rune JSON resolves the payout's underlier as an `Asset`, of which `Basket` is not an option.
- **Allocation.** The CSA allocation (`CdmAllocation.allocate`, cdm-ext `AllocateCollateral`) over the giver's balance
  at the profile's haircuts covers 1,000,000 with 10,371 tUST when the giver holds 20,000 tUST, and with 6,000 tUST and
  4,380 tAGY when it holds 6,000 tUST; it takes no concentration limit, and the second basket is 42% tAGY.
- **Settlement through the agent:** absent, as recorded in [[task-triparty-workflows]] (T7, T9).

**Design chosen 2026-11-12** (source `dfc25e3ca5487c53cf915b0e61638c428cd4e377`: "1a 2a 3a 4a 5a 6a 7a 8a 9a"), recorded in
[[wp-adr-triparty-trade-start]] (proposed); the allocation rules are questions for an SME in
[[task-sme-triparty-trade-start]].

**Built 2026-11-12** to [[wp-adr-triparty-trade-start]]:

- **cdm-ext** (`cdmx.collateral.triparty`): `TripartyRepoRequest`, `TripartyDeposit`, `TripartyValuedPosition`,
  `TripartyConcentrationBreach`, `TripartyAllocation` (conditions `NothingWhenUncovered`, `CoversWhenAllocated`);
  `ProfileCriterion`, `ProfileEligible`, `ProfileHaircut`, `ProfileLimit` find an asset's criterion by ISIN;
  `AllocateTriparty` caps an asset under a limit at the whole units within its share of the Purchase Price;
  `TripartyConcentrationBreaches` is the per-ISIN check (local fix for D30). `TripartyAllocationTest`, 7 tests.
- **Contract** `TripartySettlement`: deposit with the giver's rank, withdrawal of free collateral, request, affirmation,
  allocation by the agent, refusal of an allocation, cancellation, and `settlePurchase`, which moves the Purchase Price
  to the giver and the allocated tokens from the free account to the repo's account in one transaction; termination
  refuses while a repo is open or collateral is deposited. 2 new hardhat tests (123 pass).
- **Gateway** routes under `/ledger/v1/triparty/terms/:id/` (deposit, withdraw, free, repos) and
  `/ledger/v1/triparty/repos/:id/` (affirm, allocate, refuse-allocation, settle, cancel).
- **Service** `CdmTriparty.request`, `verifyRequest`, `allocate` (the CDM repo built with one collateral position per
  allocated asset, the agent in the `TripartyAgent` role and the profile as the eligible collateral, through
  `CdmRepo.bookExecution`), `verifyAllocation`; `CdmRepo.collateralPositions` reads the allocated form. The giver and
  the receiver recompute a proposed allocation from the free account and the feed prices; a settled allocation is
  checked on its own (validation, request hash, chain amounts, CDM positions, limits). `canPropose` now counts only
  terms where the party is the giver. `CdmTripartyTradeStartTest`, 4 tests.
- **Console**: deposit, withdraw, request, affirm, settle, refuse and cancel in the terms card; allocate in `#/live/T`.
  The profile's limit now reads "of the Purchase Price".
- **Live spec** `flow-triparty-trade-start` passes (twice on the redeployed chain, with `flow-triparty-terms`). bank-b's
  test balance targets are now 8,000 tUST and 8,000 tAGY, since each run leaves 3,000 tUST and 2,190 tAGY at the agent.
