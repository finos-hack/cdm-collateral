```yaml
id: task-sme-ccp-porting
type: task
title: Confirm with a business SME the admission of a member and the porting of a cleared repo
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
# Task: confirm the admission of a member and the porting of a cleared repo

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-ccp-default]]. [[task-ccp-porting]] is built to
[[wp-adr-ccp-porting]]. How BANK-C admits a member and how a member moves a cleared repo to another member are
assumptions stated from model memory of CCP practice. Questions for the SME (ledger rows CPT-1 to CPT-5 in
`docs/analysis/sme-question-ledger.md`):

1. BANK-C admits a member to its rulebook in effect with a separate admission document, and the rulebook is unchanged. How do CCPs admit a member (an accession agreement, an amendment of the rulebook), and which checks come first?
2. A member moves its leg of a cleared repo to another member when the two agree and the CCP approves. Do repo CCPs allow such member-to-member transfers, or is porting used only for client positions when a clearing member defaults?
3. The receiving member pays the leaving member the leg's value at the feed price, with the variation margin paid. How is a transferred position priced and paid for: at market, at the original terms, or with no payment between the members?
4. The variation margin paid stays with the repo, and the initial margin does not move: the next round calls the receiving member's and returns the leaving member's. Is margin transferred with a ported position?
5. Either the receiving member or the CCP may refuse, and a leg may be ported only once. What criteria does a CCP apply to accept a transfer, and are repeated transfers limited?
