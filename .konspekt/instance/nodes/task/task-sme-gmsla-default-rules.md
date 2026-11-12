```yaml
id: task-sme-gmsla-default-rules
type: task
title: Confirm with a business SME the rules for a GMSLA default and close-out
status: open
review: proposed
provenance:
  conversationId: gmsla-default-close-out
  sourceRef: 7959b57674d67db7e8b0388d158596713d079aea
  contentHash: 7959b57674d67db7e8b0388d158596713d079aea
  timestamp: 2026-11-12T00:05:02Z
  confidence: 0.55
createdAt: 2026-11-12T00:05:02Z
updatedAt: 2026-11-12T00:05:02Z
```
# Task: confirm the rules for a GMSLA default and close-out

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-default-close-out-rules]]. The project owner
chose the design for [[task-gmsla-default-close-out]] on 2026-11-11 ([[wp-adr-gmsla-default-close-out]]). The rules
below are assumptions stated from model memory of GMSLA 2010 paragraph 11, not checked against the text. Questions for
the SME:

1. Each loan enters as the Default Market Value of the Equivalent Securities, owed to the lender, against the value of the Equivalent Collateral the lender holds, owed to the borrower. Is that GMSLA 2010 paragraph 11, and is cash collateral owed back at its amount?
2. The prototype values securities at one oracle price on the Early Termination Date. Under paragraph 11 the non-defaulting party may use the proceeds of a sale or purchase, or quotations, at the Default Valuation Time. Which method applies when, and on which day?
3. The fee or rebate accrued from the billed-through date to the Early Termination Date, and any invoice still unpaid, enter the balance. Is that right, and does interest run on unpaid amounts?
4. Margin held under the pair's GMSLA calls is set off at its value, cash at par and securities at their Default Market Value. With aggregated marking, is that margin treated as collateral of all the loans?
5. Automatic early termination follows the defaulting party's election, and the oracle does not record the kind of default. Should only an Act of Insolvency terminate without notice?
6. Loans booked and affirmed but not delivered stay open after the close-out. Does the Event of Default terminate them too, and at what value?
7. A returned loan with a period not yet billed is not in the close-out and can still be billed. Should its unpaid rate enter the balance?
8. The prototype adds no costs of the non-defaulting party and no interest on an unpaid balance. Which apply under paragraph 11?
9. The GMSLA and GMRA close-outs between the same pair are separate statements. Is cross-agreement set-off (for example under a master netting agreement) expected?
