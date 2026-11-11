```yaml
id: task-sme-gmsla-substitution-rules
type: task
title: Confirm with a business SME the rules for substituting non-cash collateral of a loan under the GMSLA
status: open
review: accepted
provenance:
  conversationId: gmsla-substitution
  sourceRef: 48fe886bd6db13fa671e8e91d418ed0f300f1833
  contentHash: 48fe886bd6db13fa671e8e91d418ed0f300f1833
  timestamp: 2026-11-11T20:05:16Z
  confidence: 0.55
createdAt: 2026-11-11T20:05:16Z
updatedAt: 2026-11-11T20:09:55Z
```
# Task: confirm the rules for substituting non-cash collateral of a loan under the GMSLA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-recall-rules]]. The project owner chose the
design for [[task-gmsla-substitution]] on 2026-11-11 ([[wp-adr-gmsla-substitution]]). The rules below are assumptions
stated from model memory of GMSLA 2010 and not checked against the text. Questions for the SME:

1. The borrower may substitute the collateral of a loan with alternative collateral acceptable to the lender. Under GMSLA 2010, is the lender's agreement needed for each substitution, or only that the substitute be eligible under the agreed collateral schedule?
2. The substitute must be worth at least the loan's required collateral (the loaned value times the margin) at the substitution date's prices. Is that the right test, or must it equal the value of the collateral it replaces?
3. The substitute and the original collateral move in one transaction. In practice, must the borrower deliver the substitute first, with the lender returning the original afterwards, and by when?
4. A substitution replaces all the collateral of one loan. Are partial substitutions, giving a loan with mixed collateral, usual under the GMSLA?
5. The loan's fee is unchanged by a substitution. Is the fee repriced when the collateral changes, for example to a lower-grade security?
6. A substitution is allowed while a recall is pending. Is that right, or does a recall freeze the collateral until the return?

The questions are rows LSB-1 to LSB-6 of `docs/analysis/sme-question-ledger.md`.
