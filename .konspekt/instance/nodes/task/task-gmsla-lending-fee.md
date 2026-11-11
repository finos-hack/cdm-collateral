```yaml
id: task-gmsla-lending-fee
type: task
title: Lending fee on loans against non-cash collateral
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
# Task: lending fee on loans against non-cash collateral

Row 18 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** CDM's invoice has no amounts on CDM's own sample (S11; defect D27).
- **Scope:** The borrower pays the lender a fee at the agreed rate on the value of the loaned securities, billed for a period and paid in tUSD.
- **`cdm-ext`:** the fee amount and billing records in `cdm-ext`, producing CDM's `BillingRecord` and `SecurityLendingInvoice` (defect D27).
- **Prototype:** a fee invoice agreed by both services and paid on-chain; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
