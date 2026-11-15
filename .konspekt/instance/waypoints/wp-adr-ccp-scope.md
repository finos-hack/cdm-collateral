```yaml
id: wp-adr-ccp-scope
kind: decision
subtype: adr
timestamp: 2026-11-12T18:25:00Z
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.55
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
    contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-12T18:25:00Z
```
# ADR: CCP clearing of the prototype's repo through a new test party BANK-C, with daily VM and IM, member default management with a default fund waterfall, and porting between members; one task per workflow

For [[task-ccp-workflows]] (section C, row 26 of the workflow map), following the project owner's choices of 2026-11-12
(source `323cd915721b60bb6900bbb2d1774d669f8870ac`: "Good with your proposals - all (a)"), after the CDM check recorded in that task:

- **Product (1a).** The prototype's GMRA repo, cleared at the CCP; the trade, the cash leg and the repo functions reuse
  rows 1 to 11. Cleared derivatives are out of scope.
- **The CCP (2a).** A fourth test party, BANK-C, with its own Besu account and its own instance of the collateral service
  and gateway, started by `live-e2e.sh` beside BANK-T. A new contract holds the CCP's books: the cleared repos, the
  members' margin and the default fund.
- **Clearing (3a).** BANK-A and BANK-B book a bilateral repo as today and submit it; BANK-C accepts it and the repo is
  novated into two repos with BANK-C (CDM's split into party changes with the `Clearing` intent, keyed by CDM's
  `GlobalKeyProcessStep`).
- **Margin (4a).** Daily variation margin on each member's cleared repos and initial margin at a fixed percentage of the
  exposure, both as CDM `MarginCallIssuance` from BANK-C (`ClearingOrganization`) under the CCP rulebook, settled in
  tUSD.
- **Default (5a).** The oracle records a member's default; BANK-C closes out the defaulter's cleared repos at the feed
  prices, applies its IM, then the default fund in the order: the defaulter's IM, the defaulter's default fund
  contribution, BANK-C's own capital, the other members' contributions.
- **Porting (6a).** A member's cleared repo moves to another member by agreement (CDM party change, `Novation`
  intent); no client accounts.
- **CDM gaps.** No CCP agreement type, CCP margin model, default management, waterfall or default fund (G23);
  `Qualify_ClearedTrade` and `Qualify_Novation` false for these events. Recorded on the tasks; no `defects.md` entry
  unless a CDM function fails.
- **Process (7a).** One task per workflow under [[task-ccp-workflows]], in this build order, each with its own live
  spec; the task map's section C has one row per workflow, rows 26 to 30.

1. [[task-ccp-membership]]: CCP membership and rules: BANK-C, its rulebook, the members' default fund contributions.
2. [[task-ccp-clearing]]: CCP clearing of a bilateral repo by novation to BANK-C.
3. [[task-ccp-margin]]: CCP daily variation margin and initial margin.
4. [[task-ccp-default]]: CCP member default: close-out and the default fund waterfall.
5. [[task-ccp-porting]]: Porting a cleared repo from one member to another.

**Consequences.**
- A fourth party in the live stack: `live-e2e.sh`, the orchestrator, the deployment and the console gain BANK-C.
- A fourth settlement contract beside `RepoSettlement`, `SecuritiesLoan` and `TripartySettlement`.
