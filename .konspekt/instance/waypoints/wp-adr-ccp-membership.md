```yaml
id: wp-adr-ccp-membership
kind: decision
subtype: adr
timestamp: 2026-11-12T19:01:00Z
review: accepted
provenance:
  conversationId: ccp-membership
  sourceRef: 041be7509af8f3a7990e6b1056c58cb4967eb42a
  contentHash: 041be7509af8f3a7990e6b1056c58cb4967eb42a
  timestamp: 2026-11-12T19:01:00Z
  confidence: 0.55
createdAt: 2026-11-12T19:01:00Z
updatedAt: 2026-11-12T19:01:00Z
```
# ADR: BANK-C runs on a fifth Besu node; it publishes a cdm-ext CCP rulebook and its capital on a new CcpClearing contract; each member affirms the rulebook and pays its default fund share in one transaction, and may leave when it clears nothing

For [[task-ccp-membership]] (section C, row 26 of the workflow map), within [[wp-adr-ccp-scope]]. The project owner
chose option (a) for all eight questions on 2026-11-12 (source `041be7509af8f3a7990e6b1056c58cb4967eb42a`: "(A) for each"). The rest of this record is the
maintainer's proposal.

- **The node (1a).** A fifth Besu node `ccp`, a non-validator that joins the four-validator QBFT network through the
  bootnode; its node key, generated on its first start, is BANK-C's account. Gateway 8204, collateral service 8004
  (`PARTY_ID=C`), console `#/live/C`. The node `bank-c` stays BANK-T's.
- **Rulebook (2a, 4a).** A cdm-ext `CcpRulebook`: CDM's `LegalAgreement` of type `Other` ("CCP rulebook") between
  BANK-C and the members, the IM rate (5% of a cleared repo's cash amount), daily variation margin, the default fund
  (1,000,000 tUSD) with each member's share (500,000 for BANK-A and BANK-B), BANK-C's own capital (250,000 tUSD) and
  the effective date. BANK-C records its hash on a new `CcpClearing` contract.
- **Capital (5a).** BANK-C pays its capital into `CcpClearing` in the transaction that publishes the rulebook.
- **Joining (3a).** Each member affirms the rulebook's hash and pays its share in one transaction, and is a member once
  paid; the rulebook is in effect once every member named in it has paid.
- **Leaving (6a).** A member with no cleared repo leaves and gets its share back; the rulebook stays published and the
  member can rejoin by paying again.
- **Verification (7a).** Each member's service rebuilds the rulebook from the same inputs before it affirms (the same
  hash, the CDM agreement validates), as for triparty terms.
- **Live spec (8a).** `flow-ccp-membership`: BANK-C publishes the rulebook and pays its capital; BANK-A and BANK-B affirm
  and pay; the fund holds 1,250,000 tUSD; BANK-B leaves and rejoins. A rulebook an earlier run left in effect is reused.
