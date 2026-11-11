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
updatedAt: 2026-11-11T18:15:49Z
```
# Task: securities lending marking to market and margin transfer

Row 14 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** no marking calculation (S7, score 2: G12); aggregation is an election only (S23).
- **Scope:** The pair's loans marked together (aggregation under GMSLA paragraph 5.4): the value of the loaned securities plus the margin against the collateral held, one call per pair once it passes the minimum transfer amount.
- **`cdm-ext`:** the loan exposure and the aggregated requirement in `cdm-ext`, using the margin and haircut terms of each loan.
- **Prototype:** the call settled through the existing margin-call path; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11.** A temporary test ran CDM's marking-related functions on loans in the prototype's shape
(100,000 tMMF lent by BANK-A to BANK-B against tUSD or tUST, margin 1.02):

- **`Create_ExposureFromTrades`** puts the loans' positions in a portfolio and gives no aggregate value, valuation or
  calculation time. CDM computes no exposure.
- **`SecurityFinanceCashSettlementAmount`** gives quantity × the trade's booked price × `marginPercentage` (USD 102,000
  for either loan; 40,800 for 40,000 shares). It has no price input, so it cannot mark a loan to a later price, and it
  reverses the payer and receiver it is given (D29).
- **A valuation instruction** (`ValuationInstruction`, method `MarkToMarket`, scope `Trade` or `Collateral`) through
  `Create_BusinessEvent` passes CDM validation on both loans, qualifies as `ValuationUpdate`, and adds the valuation
  to the trade's valuation history. CDM can record a mark on each loan; it does not compute one.

**Design chosen 2026-11-11** (source `e56a84b64d6211be054d63c35b84556e556a0feb`: "1a 2a 3a 4a 5a 6a 7a 8a"), recorded in [[wp-adr-gmsla-marking]]
(proposed); the rules are questions for an SME in [[task-sme-gmsla-marking-rules]].

