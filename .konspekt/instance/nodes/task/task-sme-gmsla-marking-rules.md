```yaml
id: task-sme-gmsla-marking-rules
type: task
title: Confirm with a business SME the rules for marking securities loans under the GMSLA
status: open
review: proposed
provenance:
  conversationId: gmsla-marking
  sourceRef: e56a84b64d6211be054d63c35b84556e556a0feb
  contentHash: e56a84b64d6211be054d63c35b84556e556a0feb
  timestamp: 2026-11-11T18:15:49Z
  confidence: 0.55
createdAt: 2026-11-11T18:15:49Z
updatedAt: 2026-11-11T18:15:49Z
```
# Task: confirm the rules for marking securities loans under the GMSLA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-loan-delivery-return-rules]]. The project owner
chose the design for [[task-gmsla-marking]] on 2026-11-11 ([[wp-adr-gmsla-marking]]). The rules below are assumptions
stated from model memory of GMSLA 2010 and not checked against the text. Questions for the SME:

1. Loans are marked together per pair (GMSLA paragraph 5.4): each party's requirement as lender less the collateral it holds, the two directions netted to one figure. Is that how aggregated marking is computed, and is margin from earlier calls netted in the same figure?
2. Either party may call: a lender short of collateral calls for more, and a borrower over-collateralised calls for the excess back. Is that usual, and is the call made by notice to the other party?
3. A call is made only when the net figure exceeds the calling party's minimum transfer amount. Does the GMSLA minimum transfer amount apply this way, and is there also a rounding of the amount called?
4. Collateral is valued at its market price without a haircut, the loan's margin being the buffer. Is a haircut on non-cash collateral applied as well under GMSLA 2010?
5. The margin delivered on a call stays with the pair and is netted at the next mark; a return of a loan redelivers only that loan's own collateral. Is margin attributed to individual loans in practice?
6. Prices are the feed prices on the business date, and a call settles by the next business day. What are the usual valuation time and settlement period for a margin call under the GMSLA?
