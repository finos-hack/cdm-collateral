```yaml
id: task-sme-two-way-im-rules
type: task
title: Confirm with a business SME the rules for two-way initial margin and the pledgor's reclaim on default
status: open
review: proposed
provenance:
  conversationId: two-way-initial-margin
  sourceRef: 57ae0e7cbeb65ec44ba5e313131802c0d6f53c10
  contentHash: 57ae0e7cbeb65ec44ba5e313131802c0d6f53c10
  timestamp: 2026-11-07T21:24:29Z
  confidence: 0.6
createdAt: 2026-11-07T21:24:29Z
updatedAt: 2026-11-07T21:24:29Z
```
# Task: confirm the rules for two-way initial margin and the pledgor's reclaim on default

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-enforcement-event-definition]]. The project owner
chose the design for [[task-two-way-initial-margin]] on 2026-11-07. The details below are the maintainer's assumptions
([[wp-adr-two-way-im]]). Questions for the SME:

1. **Reclaim clause.** Which paragraph of the 2018 NY law IM CSA, and of the control agreement with the custodian,
   gives the pledgor its collateral back when the secured party is the Defaulting Party? Is it the Pledgor's Rights and
   Remedies paragraph?
2. **What starts it.** The prototype lets the pledgor reclaim as soon as the oracle feed records the secured party's
   default. Does it need a notice, a waiting period, or a designated Early Termination Date first?
3. **Whole leg.** The prototype returns the whole leg at once. Can the custodian hold back part of it, for example
   for amounts the pledgor owes on the other leg, or does segregation forbid that?
4. **Order with close-out.** The non-defaulting party enforces or closes out the defaulting party's leg and reclaims
   its own in separate steps. Is any order between them required?
5. **CSA roles.** In one IM CSA with both parties posting, is each party's Substitution election, Minimum Transfer
   Amount and eligibility schedule stated per party (Party1, Party2) as the prototype assumes?
