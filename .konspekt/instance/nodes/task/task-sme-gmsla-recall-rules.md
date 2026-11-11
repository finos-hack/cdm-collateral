```yaml
id: task-sme-gmsla-recall-rules
type: task
title: Confirm with a business SME the rules for recalling loaned securities under the GMSLA
status: open
review: proposed
provenance:
  conversationId: gmsla-recall
  sourceRef: 72146b83411def7096cb21b1d196e0988e884c38
  contentHash: 72146b83411def7096cb21b1d196e0988e884c38
  timestamp: 2026-11-11T19:17:49Z
  confidence: 0.55
createdAt: 2026-11-11T19:17:49Z
updatedAt: 2026-11-11T19:17:49Z
```
# Task: confirm the rules for recalling loaned securities under the GMSLA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-marking-rules]]. The project owner chose the
design for [[task-gmsla-recall]] on 2026-11-11 ([[wp-adr-gmsla-recall]]). The rules below are assumptions stated from
model memory of GMSLA 2010 and not checked against the text. Questions for the SME:

1. The lender recalls all or part of a loan by notice, and the borrower must return the securities by the end of the standard settlement time for them. Is two business days after the notice the right date for the prototype's securities, and is the notice date the day the notice is given or the next business day after a cut-off time?
2. A recall is recorded as a notice and does not change the loan; the loan ends only when the securities are returned. Is that how a recall works under GMSLA 2010, or does the notice itself terminate the loan for the recalled quantity?
3. The lender may withdraw a recall before the securities are returned. Is a withdrawal usual, and does it need the borrower's agreement?
4. When the borrower misses the date, the prototype only shows the recall as overdue. What may the lender do, and from when: a buy-in, a default notice, or both (row 19)?
5. The collateral stays with the lender until the return, which redelivers it in proportion. Is that right, or is collateral released when the recall is made?
6. A borrower's own return of part of a recalled loan reduces the quantity still recalled. Is that how a partial return during a recall is treated?
