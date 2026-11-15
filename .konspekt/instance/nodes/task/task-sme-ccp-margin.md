```yaml
id: task-sme-ccp-margin
type: task
title: Confirm with a business SME the CCP's daily variation margin and initial margin
status: open
review: accepted
provenance:
  conversationId: ccp-risk
  sourceRef: ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8
  timestamp: 2026-11-13T00:30:00Z
  confidence: 0.5
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
    contentHash: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
createdAt: 2026-11-13T00:30:00Z
updatedAt: 2026-11-13T02:31:42Z
```
# Task: confirm the CCP's daily variation margin and initial margin

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-ccp-clearing]]. [[task-ccp-margin]] is built to
[[wp-adr-ccp-margin]]. How often BANK-C calls, what it margins and how the members pay are assumptions stated from
model memory of repo CCP practice. Questions for the SME (ledger rows CVM-1 to CVM-5 in
`docs/analysis/sme-question-ledger.md`):

1. BANK-C issues one round per business date when it chooses, and the members pay that day. Do repo CCPs also call intraday, and what is the payment deadline?
2. Variation margin is GMRA Transaction Exposure at the repo's Margin Ratio. Do repo CCPs margin the exposure with the haircut, or the mark-to-market without it, and do they pay price alignment interest on variation margin?
3. Initial margin is a flat 5% of the Purchase Prices of a member's open cleared repos. Which initial margin models do repo CCPs use (VaR, haircut schedules), and on which base?
4. Each member pays or receives one net amount of variation and initial margin per round, in tUSD. Do CCPs net the two, or settle them separately, for example variation margin in cash and initial margin in securities?
5. Variation margin passes to the other member only when the round settles, after every member that owes has paid. How do CCPs pay variation margin out, and what happens when a member does not pay on time?
