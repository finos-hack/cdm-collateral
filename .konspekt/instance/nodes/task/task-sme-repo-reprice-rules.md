```yaml
id: task-sme-repo-reprice-rules
type: task
title: Confirm with a business SME the rules for repricing a repo under the GMRA
status: open
review: accepted
provenance:
  conversationId: repo-reprice
  sourceRef: 729ada99275ed710b1515fb8acc6de27fa1df799
  contentHash: 729ada99275ed710b1515fb8acc6de27fa1df799
  timestamp: 2026-11-08T15:59:51Z
  confidence: 0.6
createdAt: 2026-11-08T15:59:51Z
updatedAt: 2026-11-08T16:33:21Z
```
# Task: confirm the rules for repricing a repo under the GMRA

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-repo-margin-exposure]]. The project owner chose the
design for [[task-repo-reprice]] on 2026-11-08. The details below are assumptions ([[wp-adr-repo-reprice]]). Questions
for the SME:

1. **Accrued Price Differential.** The prototype settles the amount accrued to the reprice date in the cash difference.
   Is it settled then, or carried to the final Repurchase Price?
2. **New Purchase Price.** Is it the market value of the securities divided by the Margin Ratio?
3. **Scope.** The prototype reprices every open repo of the pair, one settlement each. Does paragraph 4(i)(i) require all
   repos, and must they settle together?
4. **Minimum transfer amount.** The prototype offers a reprice under the same minimum transfer amount as a margin call.
   Does the minimum apply to a reprice?
5. **Instead of a call.** Is a reprice agreed in place of a margin call, or is it a way of satisfying a call already made?
6. **Margin already held.** The prototype sets each repriced Transaction Exposure to about zero and leaves Net Margin held
   unchanged, so after a reprice the other party can call that margin back. Should a reprice take the margin held into account?
