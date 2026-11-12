```yaml
id: task-triparty-trade-start
type: task
title: Triparty trade start: allocation by the agent and DvP of the cash
status: open
review: proposed
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-12T00:36:54Z
```
# Task: Triparty trade start: allocation by the agent and DvP of the cash

Row 21 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no allocation by an agent (T7, score 0), no triparty delivery method in `DeliveryMethodEnum` (T9, score 0); the repo itself qualifies with a `TripartyAgent` party.
- **Scope:** The pair agrees the repo (rows 1 to 11) and its exposure; the agent allocates collateral from the giver's balance it holds against the profile, cheapest eligible asset first within the haircuts and concentration limits (the CSA allocation), and settles the cash against the allocated collateral.
- **`cdm-ext`:** the agent's allocation as data (CDM's `CollateralPortfolio` and `CollateralBalance`) and the function that builds it from the profile and the giver's balance.
- **Prototype:** the giver deposits into `TripartySettlement`; BANK-T's service allocates; the contract delivers the cash against the allocation; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.
