```yaml
id: task-sme-repo-default-close-out-rules
type: task
title: Confirm with a business SME the rules for a GMRA default and close-out
status: open
review: accepted
provenance:
  conversationId: repo-default-close-out
  sourceRef: e1f2afbe9b0618c7020e6ec16844cce661c77ef2
  contentHash: e1f2afbe9b0618c7020e6ec16844cce661c77ef2
  timestamp: 2026-11-11T13:07:05Z
  confidence: 0.55
createdAt: 2026-11-11T13:07:05Z
updatedAt: 2026-11-11T13:09:45Z
```
# Task: confirm the rules for a GMRA default and close-out

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-buy-sell-back-rules]]. The project owner chose
the design for [[task-repo-default-close-out]] on 2026-11-11: CDM's termination event per Transaction, oracle prices as
Default Market Values, a net balance over every Transaction, margin and unpaid income, a Default Notice or automatic
early termination, and only the balance settled. The details below are assumptions ([[wp-adr-repo-default-close-out]]),
stated from model memory of GMRA 2011 paragraph 10 and not checked against the text. Questions for the SME:

1. **Values.** Each Transaction enters as the Repurchase Price accrued to the Early Termination Date, owed by the
   Seller, against the Default Market Value of the Equivalent Securities, owed by the Buyer. Is that paragraph 10(c)?
2. **Default Market Value.** The prototype uses one market price at the Default Valuation Time. Under paragraph 10(e)
   the non-defaulting party may use the net proceeds of a sale or purchase, or quotations. Which method applies when?
3. **Default Valuation Time.** The elections hold a time and a business day calendar. Which day: the Early Termination
   Date, or a number of dealing days after it?
4. **Automatic early termination.** The oracle records a default without its kind, and with the election set every
   default terminates without notice. Should only an Act of Insolvency do so?
5. **Margin.** Cash Margin is owed back at its amount and Margin Securities at their Default Market Value. Is accrued
   Net Margin interest also included?
6. **Unpaid income.** Agreed income that was due and not paid enters the balance. Does interest on it apply?
7. **Buy/sell-back.** A buy/sell-back enters at its Repurchase Price less the income deduction. Is that right under
   the Buy/Sell Back Annex when the income date falls after the Early Termination Date?
8. **Costs and interest on the balance.** The prototype adds no costs of the non-defaulting party and no interest on
   an unpaid balance. Which apply?
