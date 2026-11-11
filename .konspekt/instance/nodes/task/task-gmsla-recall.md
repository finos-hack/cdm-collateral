```yaml
id: task-gmsla-recall
type: task
title: Recall of loaned securities
status: resolved
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T20:43:22Z
```
# Task: recall of loaned securities

Row 15 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** terms only (S14, score 2: G18): `RecallProvision` and a `Recall` transfer type; no recall function or event; CDM issue #4213.
- **Scope:** The lender recalls all or part of a loan by notice; the borrower returns the securities by the intended settlement date; the collateral is redelivered.
- **`cdm-ext`:** a recall notice type and event, and the link to the return of `task-gmsla-loan-delivery-return`.
- **Prototype:** recall on `SecuritiesLoan`, the notice in both services and the console; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran CDM over loans in the prototype's shape (100,000 tMMF lent by BANK-A
to BANK-B against tUSD or tUST, margin 1.02):

- **`RecallProvision`** (`isRecallable`, an `intendedSettlementDate` two business days after the notice) on the loan's
  `TerminationProvision` passes CDM validation on both loans.
- **A transfer of type `Recall`** of 40,000 tMMF from the borrower to the lender, through `Create_BusinessEvent` over a
  transfer instruction, passes validation and qualifies only as `SecurityTransfer`. A transfer of type `Return`
  qualifies the same way. Either adds one entry to the trade's transfer history and leaves the loaned quantity at
  100,000 and the trade open.
- CDM has no recall notice, no recall qualification and no effect of a recall on the loan. The return that ends a
  recalled loan is the quantity-change event of [[task-gmsla-loan-delivery-return]].

**Design chosen 2026-11-11** (source `72146b83411def7096cb21b1d196e0988e884c38`: "1a 2a 3a 4a 5a 6a 7a 8a 9a"), recorded in [[wp-adr-gmsla-recall]]
(proposed); the rules are questions for an SME in [[task-sme-gmsla-recall-rules]].

**Resolved 2026-11-11**: PR #62 merged (source `1dba795152ed770e8a520fdf4466d1d453bb6406`).
