```yaml
id: task-triparty-trade-end
type: task
title: Triparty trade end: release of the collateral against repayment
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
# Task: Triparty trade end: release of the collateral against repayment

Row 24 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no settlement through the agent (T9, score 0); the repurchase event is CDM's (row 3, defect D25).
- **Scope:** On the Repurchase Date the agent releases the allocated collateral to the giver's balance against the repurchase price paid to the receiver.
- **`cdm-ext`:** the release event over the allocation, beside CDM's repurchase event.
- **Prototype:** the contract settles the repayment against the release; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.
