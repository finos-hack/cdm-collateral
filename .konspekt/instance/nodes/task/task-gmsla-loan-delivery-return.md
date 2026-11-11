```yaml
id: task-gmsla-loan-delivery-return
type: task
title: Securities loan delivery against collateral, and full and partial return
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
# Task: securities loan delivery against collateral, and full and partial return

Row 13 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** CDM's settlement workflows fail CDM validation on CDM's own samples; only the execution qualifies; the return event has no instruction and no return qualification can hold (S9, S13; defects D26 and D4).
- **Scope:** A loan of a security token from lender to borrower against cash collateral (tUSD) or non-cash collateral (for example tUST against a tMMF loan), delivered in one transaction; full and partial return of the loaned securities against redelivery of the collateral.
- **`cdm-ext`:** the loan and return events built from CDM's lower-level functions (`Create_Return`, `Create_BusinessEvent`) with the instruction filled in, in the trade shape `Qualify_SecurityLending` accepts (one `AssetPayout` and a `CollateralPortfolio`); a return qualification if CDM's cannot hold.
- **Prototype:** a new `SecuritiesLoan` contract for delivery against collateral and return; loans held by both services as CDM trades; gateway, service, console and a live spec that leaves the shared balances as it found them.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
