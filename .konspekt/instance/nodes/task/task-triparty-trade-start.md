```yaml
id: task-triparty-trade-start
type: task
title: Triparty trade start: allocation by the agent and DvP of the cash
status: open
review: accepted
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-12T01:11:35Z
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
