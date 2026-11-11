```yaml
id: task-gmsla-rebate
type: task
title: Rebate on cash collateral
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
# Task: rebate on cash collateral

Row 17 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** no rebate function (S12, score 2): `PriceSubTypeEnum.Rebate` only.
- **Scope:** The lender pays the borrower a rebate at the agreed rate on cash collateral held, billed for a period and paid in tUSD.
- **`cdm-ext`:** the rebate amount and billing records in `cdm-ext`, producing CDM's `BillingRecord` and `SecurityLendingInvoice` (defect D27).
- **Prototype:** a rebate invoice agreed by both services and paid on-chain; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
