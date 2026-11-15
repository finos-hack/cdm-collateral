```yaml
id: task-sme-repo-adjustment-rules
type: task
title: Confirm with a business SME the rules for adjusting a repo under the GMRA
status: open
review: accepted
provenance:
  conversationId: repo-adjustment
  sourceRef: ni:///sha-256;kToGmmgRHioG1CwLyFJVfivO6gnZfwrlWJW_eBuTX6o
  timestamp: 2026-11-08T17:19:27Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 0dd1cef601500b689fcd3ce949a69d1c02f9647d
    contentHash: 0dd1cef601500b689fcd3ce949a69d1c02f9647d
createdAt: 2026-11-08T17:19:27Z
updatedAt: 2026-11-08T19:12:04Z
```
# Task: confirm the rules for adjusting a repo under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-reprice-rules]]. The project owner chose the design
for [[task-repo-adjustment]] on 2026-11-08. The details below are assumptions ([[wp-adr-repo-adjustment]]). Questions for
the SME:

1. **Accrued Price Differential.** The prototype has the Seller pay the amount accrued to the adjustment date in cash. Is
   it settled then, carried to the final Repurchase Price, or added to the new Purchase Price?
2. **New quantity.** Is it the Purchase Price times the Margin Ratio divided by the price, rounded up to whole units?
3. **Scope.** The prototype adjusts every open repo of the pair, one settlement each. Does paragraph 4(i)(ii) require all
   repos, and must they settle together?
4. **Minimum transfer amount.** The prototype offers an adjustment under the same minimum transfer amount as a margin call.
   Does the minimum apply to an adjustment?
5. **Instead of a call.** Is an adjustment agreed in place of a margin call, or is it a way of satisfying a call already made?
6. **Margin already held.** The prototype leaves Net Margin held unchanged, so after an adjustment the other party can call
   that margin back. Should an adjustment take the margin held into account?
