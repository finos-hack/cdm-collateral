```yaml
id: task-sme-gmsla-loan-delivery-return-rules
type: task
title: Confirm with a business SME the rules for securities loan delivery and return under the GMSLA
status: open
review: proposed
provenance:
  conversationId: gmsla-loan-delivery-return
  sourceRef: 0459d62f952baa979a166c76641c678927e782b0
  contentHash: 0459d62f952baa979a166c76641c678927e782b0
  timestamp: 2026-11-11T16:38:28Z
  confidence: 0.55
createdAt: 2026-11-11T16:38:28Z
updatedAt: 2026-11-11T16:38:28Z
```
# Task: confirm the rules for securities loan delivery and return under the GMSLA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-gmsla-terms-baseline]]. The project owner chose the
design for [[task-gmsla-loan-delivery-return]] on 2026-11-11 ([[wp-adr-gmsla-loan-delivery-return]]). The rules below
are assumptions stated from model memory of GMSLA 2010 and not checked against the text. Questions for the SME:

1. The initial collateral is the Market Value of the Loaned Securities at the booking date's price times the loan's margin, rounded up. Is that the Required Collateral Value under GMSLA 2010, and is it priced on the trade date or the settlement date?
2. On a partial return the lender redelivers collateral in proportion to the quantity returned, in the same settlement. Is that usual, or is the excess collateral returned only through the next mark?
3. Open loans may be returned on any business day, and the prototype settles a return when both parties instruct it. What notice of return does the borrower give, and what is the standard settlement period?
4. A cash-collateral loan states a rebate rate, and a loan against securities states a fee rate, both fixed at booking. Are both agreed per loan, and can a rate change during the loan?
5. Collateral passes to the lender by outright title transfer, as under GMSLA 2010. Should the prototype also support the GMSLA 2018 security interest (pledge) variant?
6. A full return is qualified as a full return and not as a termination. Is the end of a loan by full return treated differently from its early termination (for example on recall or default)?
