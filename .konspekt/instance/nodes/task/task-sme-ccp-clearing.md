```yaml
id: task-sme-ccp-clearing
type: task
title: Confirm with a business SME the clearing of a bilateral repo by novation to the CCP
status: open
review: proposed
provenance:
  conversationId: ccp-clearing
  sourceRef: 0072e61cda902e466726ca3c65c8c1ad61b3f089
  contentHash: 0072e61cda902e466726ca3c65c8c1ad61b3f089
  timestamp: 2026-11-12T23:30:00Z
  confidence: 0.5
createdAt: 2026-11-12T23:30:00Z
updatedAt: 2026-11-12T23:30:00Z
```
# Task: confirm the clearing of a bilateral repo by novation to the CCP

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-ccp-membership]]. [[task-ccp-clearing]] is built to
[[wp-adr-ccp-clearing]]. When a repo is submitted, who submits it, what BANK-C checks and how the legs settle are
assumptions stated from model memory of repo CCP practice. Questions for the SME (ledger rows CCC-1 to CCC-5 in
`docs/analysis/sme-question-ledger.md`):

1. The repo is submitted after both parties affirm it and before the purchase settles. Do repo CCPs accept trades for clearing before the start leg settles, after it, or both (for example forward-starting repos)?
2. The seller submits and the buyer affirms the submission. Do both members submit, does a trading venue or matching service submit, or does one party give up the trade?
3. The CCP checks only that both are paid members and the security is eligible. Which further checks does a CCP make at acceptance (credit limits, initial margin posted first, settlement eligibility)?
4. The purchase and the repurchase settle in one transaction between the members, the CCP netting to zero. Do CCPs settle each leg against the CCP's own accounts, or net members' obligations and settle once per day?
5. A refused repo stays bilateral and may be submitted again. What happens to a trade the CCP rejects under the members' agreements?
