```yaml
id: task-gmsla-marking
type: task
title: Securities lending marking to market and margin transfer
status: open
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:16:16Z
```
# Task: securities lending marking to market and margin transfer

Row 14 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** no marking calculation (S7, score 2: G12); aggregation is an election only (S23).
- **Scope:** The pair's loans marked together (aggregation under GMSLA paragraph 5.4): the value of the loaned securities plus the margin against the collateral held, one call per pair once it passes the minimum transfer amount.
- **`cdm-ext`:** the loan exposure and the aggregated requirement in `cdm-ext`, using the margin and haircut terms of each loan.
- **Prototype:** the call settled through the existing margin-call path; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
