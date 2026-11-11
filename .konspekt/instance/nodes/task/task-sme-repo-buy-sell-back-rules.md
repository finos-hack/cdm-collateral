```yaml
id: task-sme-repo-buy-sell-back-rules
type: task
title: Confirm with a business SME the rules for a buy/sell-back under the GMRA
status: open
review: proposed
provenance:
  conversationId: repo-buy-sell-back
  sourceRef: a778f993a5a736fc18ae08c6df925fd62a81d0f5
  contentHash: a778f993a5a736fc18ae08c6df925fd62a81d0f5
  timestamp: 2026-11-11T01:42:28Z
  confidence: 0.6
createdAt: 2026-11-11T01:42:28Z
updatedAt: 2026-11-11T01:42:28Z
```
# Task: confirm the rules for a buy/sell-back under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-pair-off-rules]]. The project owner chose the
design for [[task-repo-buy-sell-back]] on 2026-11-11: a trade type chosen at booking, income lowering the sell-back
price, the repo flows except interim interest, and pair-off only within one type. The details below are assumptions
([[wp-adr-repo-buy-sell-back]]). Questions for the SME:

1. **Deduction.** The income lowers the sell-back price by the income amount plus interest at the repo rate (ACT/360)
   from the income date to the Repurchase Date. Is that the GMRA Buy/Sell Back Annex formula, and which rate applies?
2. **Fixed amount.** The deduction is fixed when the Seller agrees it, to the Repurchase Date of that time. Is it
   recomputed if the Transaction is later repriced or adjusted?
3. **Who enters income.** The Buyer enters the income per unit and date and the Seller agrees. Is that how the income
   is agreed in practice?
4. **Margin.** A buy/sell-back's Transaction Exposure uses the accrued Repurchase Price less the full deduction. Should
   the interest part of the deduction accrue to the valuation date instead?
5. **Flows.** Margin maintenance, repricing, adjustment, substitution, roll and pair-off apply as for a repo; interim
   interest does not. Is that right for a buy/sell-back under the Annex, and for an undocumented one?
6. **Roll.** At a roll the Seller pays the Price Differential less the deduction, the Buyer pays any excess, and the
   deduction resets. Is that correct?
7. **Pair-off.** Only two trades of the same type pair off. Can a repo and a buy/sell-back be paired off?
8. **Clean and dirty prices.** The tokenized securities accrue no coupon, so the prototype quotes no accrued interest
   in the purchase and sell-back prices. For coupon securities, how are the clean price and accrued interest stated?
