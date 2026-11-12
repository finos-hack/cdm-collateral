```yaml
id: task-triparty-reporting
type: task
title: The triparty agent's report to both parties
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
# Task: The triparty agent's report to both parties

Row 25 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no report or reconciliation by an agent (T12, score 0); `CollateralStatusEnum` and `CollateralBalance` hold positions as data (T10).
- **Scope:** The agent reports to the giver and the receiver the exposure, the collateral allocated with its values and haircuts, and the giver's unallocated balance; each party checks the report against its own records.
- **`cdm-ext`:** a triparty report type over CDM's `CollateralPortfolio`.
- **Prototype:** BANK-T's service builds the report and its hash goes on-chain; both parties' services verify it; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.
