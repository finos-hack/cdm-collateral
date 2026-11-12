```yaml
id: task-triparty-substitution
type: task
title: Triparty substitution by the agent
status: open
review: accepted
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-12T01:07:01Z
```
# Task: Triparty substitution by the agent

Row 23 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Data only (T8, score 2): `CollateralPortfolio` can hold a reallocated portfolio; the repo substitution event (R11) is instructed by the trade parties.
- **Scope:** The giver asks for allocated collateral back; the agent replaces it with other eligible collateral of at least the required value from the giver's balance.
- **`cdm-ext`:** the agent's substitution over the allocation.
- **Prototype:** BANK-T's service substitutes; the contract swaps the assets on the agent's books; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.
