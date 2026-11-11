```yaml
id: task-sme-gmsla-fee-rules
type: task
title: Confirm with a business SME the rules for billing and paying the lending fee under the GMSLA
status: open
review: proposed
provenance:
  conversationId: gmsla-lending-fee
  sourceRef: 1577efddfacbb1f2fedacd57705e2f766a8b44bc
  contentHash: 1577efddfacbb1f2fedacd57705e2f766a8b44bc
  timestamp: 2026-11-11T23:29:22Z
  confidence: 0.6
createdAt: 2026-11-11T23:29:22Z
updatedAt: 2026-11-11T23:29:22Z
```
# Task: confirm the rules for billing and paying the lending fee under the GMSLA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-rebate-rules]]. The project owner chose the
design for [[task-gmsla-lending-fee]] on 2026-11-11 ([[wp-adr-gmsla-lending-fee]]). The rules below are assumptions
stated from model memory of GMSLA 2010 and market practice, not checked against the text. Questions for the SME:

1. The lending fee accrues on the market value of the loaned securities, without the margin. CDM's billing function charges it on the market value times the margin (the collateral requirement). Under GMSLA 2010 practice, is the fee charged on the loan value or on the collateral value?
2. The prototype values the loaned securities at one price per invoice, the feed price on the billing date, because its feed keeps no history. In practice, is the fee accrued daily on each day's market value, and which price source and time are used?
3. The fee accrues ACT/360, the start day counted and the end day not, at a fixed rate agreed at booking. Is that the usual convention for a USD-denominated lending fee, and are fee rates renegotiated during an open loan?
4. The lender issues the fee invoice and the borrower pays on agreement, in USD cash. In practice, who issues the fee statement, how often, and how is a disputed amount handled?
5. A substitution of the collateral does not change the fee. Is that right, or does the fee depend on the type of collateral held?
6. A returned loan can still be billed for the period up to its return date. Is the final fee usually settled with the return, or billed with the next periodic statement?

The questions are rows FEE-1 to FEE-6 of `docs/analysis/sme-question-ledger.md`.
