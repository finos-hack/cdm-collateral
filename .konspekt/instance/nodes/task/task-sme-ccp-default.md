```yaml
id: task-sme-ccp-default
type: task
title: Confirm with a business SME the CCP's management of a member default and its waterfall
status: open
review: accepted
provenance:
  conversationId: ccp-risk
  sourceRef: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
  contentHash: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
  timestamp: 2026-11-13T00:30:00Z
  confidence: 0.45
createdAt: 2026-11-13T00:30:00Z
updatedAt: 2026-11-13T02:31:42Z
```
# Task: confirm the CCP's management of a member default and its waterfall

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-ccp-margin]]. [[task-ccp-default]] is built to
[[wp-adr-ccp-default]]. How BANK-C closes out, in which order it covers the loss and what the survivors and the
defaulter receive are assumptions stated from model memory of CCP default management. Questions for the SME (ledger
rows CDF-1 to CDF-5 in `docs/analysis/sme-question-ledger.md`):

1. BANK-C closes out all the defaulter's cleared repos at once at the feed price on its business date. Do repo CCPs instead hedge and auction the defaulter's positions over several days, and how is the close-out price set?
2. The loss is covered by the defaulter's initial margin, its default fund contribution, the CCP's capital, then the other members' contributions pro rata. Is this order standard for repo CCPs, how much capital does a CCP put in before the members' contributions, and do the rulebooks also give an assessment power?
3. The survivors' repos are closed out: each survivor keeps the securities or cash it holds and the residual is settled in cash. Do CCPs close the survivors' positions out, or keep them open and give them a new counterparty through the auction?
4. What is left of the defaulter's margin and contribution is paid to it at once. When and to whom is a defaulter's surplus returned (an insolvency practitioner, after the default management period)?
5. The defaulter may rejoin at once by paying its share again. What process do CCPs apply to a member after its default, and when may it clear again?
