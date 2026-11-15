```yaml
id: wp-adr-ccp-margin
kind: decision
subtype: adr
timestamp: 2026-11-13T00:30:00Z
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
# ADR: BANK-C issues a margin round on its business date with a cdm-ext CcpMarginStatement per member; variation margin passes between the members through CcpClearing and initial margin stays in it; each member rebuilds its statement and pays its net

For [[task-ccp-margin]] (section C, row 28 of the workflow map), within [[wp-adr-ccp-scope]] and after
[[wp-adr-ccp-clearing]]. The project owner asked for rows 28 to 30 to be built in one pass without design questions
(source `9313093366bdd34b988e9a2baa1c53ee3f5f44cc`: "do all 3 in one shot, then test locally, then PR"). Every choice
below is the maintainer's proposal.

- **When.** BANK-C issues one round at a time on its business date, from its console. A round is open until every
  member that owes has paid; the next round can be issued only after it settles. Round ids are
  `keccak(ccp, businessDate, round count)`, so a business date can have more than one round.
- **What is counted.** Every cleared repo that is purchased, and every repurchased repo with variation margin still
  paid. The variation margin of a repo is CDM's GMRA Transaction Exposure (`RepoTransactionExposure`) at the repo's
  Margin Ratio and the feed price, rounded to whole tUSD, less what was paid on it before, from the seller's side; a
  repurchased repo's exposure is zero, so its round returns all of it.
- **Initial margin.** The rulebook's rate (5%) of the Purchase Prices of the member's cleared or purchased repos,
  rounded up, less what BANK-C holds for it. It falls to zero when the member clears nothing, and the round returns it.
- **CDM record.** A cdm-ext `CcpMarginStatement` per member: a `CcpVariationMarginLine` per repo, the initial margin
  base, required, held and amount, the net, and CDM's `MarginCallIssuance` from BANK-C, one with `RegMarginTypeEnum`
  `VM` when the member pays variation margin and one with `NonRegIM` when it posts initial margin, under an agreement of
  type `Other` ("CCP rulebook").
- **On-chain.** `CcpClearing.issueMargin` records each member's statement hash and its variation and initial margin,
  and each repo's change. A member whose net is positive pays it with `payMargin`; the last payment settles the round,
  which pays each member owed. Variation margin passes from one member to the other, so BANK-C nets to zero on it;
  initial margin stays in `CcpClearing`. A member holding initial margin cannot leave. BANK-C may cancel an open round
  when a member in it is in default on the oracle.
- **Verification.** Each member rebuilds its own statement from the chain's repos and margin and the prices the
  statement states, which must be the feed's while the round is open, and checks its hash and the chain's amounts
  before it pays.
- **Live spec.** `flow-ccp-margin`: tUST falls to 97; BANK-C issues in its console; A owes variation margin, which goes
  to B, and each owes 5,000 tUSD of initial margin; both check and pay in their consoles; tUST returns to 98.40 and the
  next round moves the variation margin back; after the repurchase a round returns the rest and the initial margin.
