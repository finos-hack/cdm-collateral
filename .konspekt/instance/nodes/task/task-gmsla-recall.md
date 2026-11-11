```yaml
id: task-gmsla-recall
type: task
title: Recall of loaned securities
status: open
review: proposed
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:11:27Z
```
# Task: recall of loaned securities

Row 15 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** terms only (S14, score 2: G18): `RecallProvision` and a `Recall` transfer type; no recall function or event; CDM issue #4213.
- **Scope:** The lender recalls all or part of a loan by notice; the borrower returns the securities by the intended settlement date; the collateral is redelivered.
- **`cdm-ext`:** a recall notice type and event, and the link to the return of `task-gmsla-loan-delivery-return`.
- **Prototype:** recall on `SecuritiesLoan`, the notice in both services and the console; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
