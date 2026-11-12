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
updatedAt: 2026-11-12T01:07:01Z
```
# Task: Triparty daily revaluation by the agent, with top-up or release

Row 22 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no required collateral value from the agent (T6, score 0); haircuts generic (T4).
- **Scope:** The agent revalues the allocated collateral at the oracle prices against the exposure and the profile, and tops up from the giver's balance or releases the excess to it.
- **`cdm-ext`:** the agent's revaluation and its top-up or release amounts over the allocation.
- **Prototype:** BANK-T's service revalues on request; `TripartySettlement` moves the top-up or release on the agent's books; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.
