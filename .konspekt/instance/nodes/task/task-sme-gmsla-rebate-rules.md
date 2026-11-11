```yaml
id: task-sme-gmsla-rebate-rules
type: task
title: Confirm with a business SME the rules for billing and paying the rebate on cash collateral under the GMSLA
status: open
review: accepted
provenance:
  conversationId: gmsla-rebate
  sourceRef: 7aad715d9ef96f8f93b411878275c88a846e99a8
  contentHash: 7aad715d9ef96f8f93b411878275c88a846e99a8
  timestamp: 2026-11-11T20:39:13Z
  confidence: 0.55
createdAt: 2026-11-11T20:39:13Z
updatedAt: 2026-11-11T22:32:46Z
```
# Task: confirm the rules for billing and paying the rebate on cash collateral under the GMSLA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-substitution-rules]]. The project owner chose
the design for [[task-gmsla-rebate]] on 2026-11-11 ([[wp-adr-gmsla-rebate]]). The rules below are assumptions stated
from model memory of GMSLA 2010 and market practice, not checked against the text. Questions for the SME:

1. The rebate is billed from the last billed date to the business date, at any time the borrower chooses. Under GMSLA 2010 practice, is the rebate settled monthly, and on which day (e.g. the first business days of the next month)?
2. The rebate accrues daily on the cash collateral actually held, ACT/360, the start day counted and the end day not. Is that the usual accrual convention for a USD cash rebate?
3. The borrower issues the invoice and the lender pays on agreement. In practice, who issues the rebate statement, and how is a disputed amount handled?
4. The invoice total is the sum of the daily accruals per sub-period, rounded half-up once (to whole tUSD in the prototype, whose cash token has no decimals). Is rounding per invoice the usual practice, or per day?
5. Negative rebate rates are refused. Are negative rebates (the borrower pays) used for USD cash collateral, and should the prototype support them?
6. A returned loan can still be billed for the period up to its return date. Is the final rebate usually settled with the return, or billed with the next periodic statement?

The questions are rows RBT-1 to RBT-6 of `docs/analysis/sme-question-ledger.md`.
