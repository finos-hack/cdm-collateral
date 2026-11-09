```yaml
id: task-sme-repo-roll-rules
type: task
title: Confirm with a business SME the rules for a repo roll under the GMRA
status: open
review: accepted
provenance:
  conversationId: repo-roll
  sourceRef: e1c2bf5c4fd1267ffad133deb7c37373f3ac3c24
  contentHash: e1c2bf5c4fd1267ffad133deb7c37373f3ac3c24
  timestamp: 2026-11-08T23:21:41Z
  confidence: 0.6
createdAt: 2026-11-08T23:21:41Z
updatedAt: 2026-11-09T00:03:11Z
```
# Task: confirm the rules for a repo roll under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-income-rules]]. The project owner chose the design
for [[task-repo-roll]] on 2026-11-08. The details below are assumptions ([[wp-adr-repo-roll]]). Questions for the SME:

1. **Cash.** The prototype has the Seller pay the Price Differential on the roll date and keeps the Purchase Price. Is that
   correct, or is the interest added to the new Purchase Price, or the Transaction reset to the market value?
2. **Date.** The prototype rolls only on the Repurchase Date. Can a Transaction be rolled earlier, or after a missed date?
3. **Margin.** The prototype keeps the securities and does not revalue them at the roll. Must the rolled Transaction be
   priced or margined again at the roll?
4. **Rate.** The proposing party enters the new repo rate and the other party agrees to it. Is there any constraint on the
   rate?
5. **Refusal.** After a refusal the repo stays due for repurchase on the same date. Is any other consequence intended?
6. **Precedence.** A settled repurchase clears a pending roll, and a repurchase instruction stops a roll from settling. Is
   that the right precedence?
7. **New Transaction.** CDM closes the trade and opens another with the same identifier. Under the GMRA, is a roll a new
   Transaction needing its own Confirmation?
