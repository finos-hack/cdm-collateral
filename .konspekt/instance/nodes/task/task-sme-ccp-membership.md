```yaml
id: task-sme-ccp-membership
type: task
title: Confirm with a business SME CCP membership, the rulebook and the default fund
status: open
review: accepted
provenance:
  conversationId: ccp-membership
  sourceRef: ni:///sha-256;Q3FCu-uTUmAF5KOP3mhMpPBE4mJ2cn6PTpZ012TENfo
  timestamp: 2026-11-12T19:40:00Z
  confidence: 0.5
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 041be7509af8f3a7990e6b1056c58cb4967eb42a
    contentHash: 041be7509af8f3a7990e6b1056c58cb4967eb42a
createdAt: 2026-11-12T19:40:00Z
updatedAt: 2026-11-12T20:48:00Z
```
# Task: confirm CCP membership, the rulebook and the default fund

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-triparty-reporting]]. [[task-ccp-membership]] is built
to [[wp-adr-ccp-membership]]. The rulebook's terms (a flat 5% initial margin, daily variation margin, an equal
1,000,000 default fund, 250,000 of CCP capital) and the joining and leaving rules are assumptions stated from model
memory of repo CCP practice, not checked against a CCP rulebook. Questions for the SME (ledger rows CCM-1 to CCM-6 in
`docs/analysis/sme-question-ledger.md`):

1. The rulebook is one document with a bilateral membership agreement per member under it. Do CCP repo services document membership as a rulebook plus a clearing membership agreement per member, and which terms sit in each?
2. The initial margin is a flat 5% of each cleared repo's cash amount. How do repo CCPs set initial margin (per security class, VaR or SPAN-type models), and is it per trade or per portfolio?
3. The default fund is fixed in the rulebook (1,000,000 split equally). How are default fund contributions sized and resized, and how often?
4. The CCP's own capital is paid in once, when the rulebook is published. Where does the CCP's capital sit in the default waterfall, and is it held with the default fund?
5. The rulebook is in effect once every named member has paid, and stays in effect when a member leaves. What are the CCP's admission conditions, and is the service suspended when a member's contribution falls short?
6. A member that clears no repo may leave and get its contribution back at once. What notice period and conditions apply to a member's resignation and the return of its contribution?
