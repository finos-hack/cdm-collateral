```yaml
id: wp-adr-ccp-default
kind: decision
subtype: adr
timestamp: 2026-11-13T00:30:00Z
review: accepted
provenance:
  conversationId: ccp-risk
  sourceRef: ni:///sha-256;58vMcgZhJO932LB70K19ejZw9RWKGfpkEGe8QbQ_li8
  timestamp: 2026-11-13T00:30:00Z
  confidence: 0.45
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
    contentHash: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
createdAt: 2026-11-13T00:30:00Z
updatedAt: 2026-11-13T02:31:42Z
```
# ADR: BANK-C declares a member's default on the oracle and closes out its cleared repos at the feed price in a cdm-ext CcpDefaultManagement; CcpClearing pays the survivors it owes, covers the loss from the defaulter's IM, its contribution, BANK-C's capital and the other members' contributions, and returns the rest to the defaulter

For [[task-ccp-default]] (section C, row 29 of the workflow map), within [[wp-adr-ccp-scope]] and after
[[wp-adr-ccp-margin]]. Built in the same pass as rows 28 and 30 (source `9313093366bdd34b988e9a2baa1c53ee3f5f44cc`).
Every choice below is the maintainer's proposal.

- **Declaration.** BANK-C declares a paid member's default from its console. Its service records the default on the
  oracle when the feed does not show it yet (the same oracle record as the repo default and close-out of section C,
  row 11) and cancels an open margin round.
- **Close-out.** Each of the defaulter's cleared repos that is cleared or purchased closes out on BANK-C's business
  date at the feed price. Both legs are valued with CDM's GMRA default values (`GmraDefaultTransactionValue`, the
  Repurchase Price and the Default Market Value), which are the same on both since the legs have the same terms. For a
  purchased repo the residual, from the seller's side, is the Repurchase Price less the Default Market Value less the
  variation margin paid; a repo not yet purchased has none. The survivor is owed the residual when it is the buyer and
  its negative when it is the seller. The loss is the sum of the survivors' amounts. No securities move: each survivor
  keeps what it holds.
- **Waterfall.** The loss is covered in the rulebook's order: the defaulter's initial margin, its default fund
  contribution, BANK-C's capital, then the other members' contributions pro rata. What is left of the defaulter's
  margin and contribution, and its gain when the loss is negative, is paid to it at once, the pool fronting it.
- **CDM record.** A cdm-ext `CcpDefaultManagement`: the rulebook hash, BANK-C in the `ClearingOrganization` role, the
  defaulter, the dates, a `CcpDefaultTransaction` per repo (both legs' values, the variation margin paid, the residual
  and the survivor's amount) and a `CcpWaterfall` whose conditions check the order, that the layers cover the loss
  and what is returned. CDM has no member default, waterfall or default fund (G23).
- **On-chain.** `CcpClearing.closeOutDefault` (BANK-C, the member in default on the oracle) closes the repos as
  `ClosedOut`, applies the waterfall, pays each survivor it owes and the defaulter, and records what each survivor
  that owes has to pay; the defaulter is no longer paid and may rejoin. A survivor that owes pays with `payDefaultDue`.
- **Verification.** Each member rebuilds the document from the novations, the chain's variation margin and the prices,
  dates and resources it states, and compares the chain's waterfall, before it pays what it owes.
- **Live spec.** `flow-ccp-default`: after a margin round tUST falls to 95, past the repo's haircut (at 97 the collateral still exceeds the repurchase price and the close-out shows a gain); BANK-C declares A's default in its console;
  the loss, below A's initial margin, comes out of it, B is paid what the close-out owes it and the rest of A's margin
  and share goes back to A; B checks the close-out in its console; a round returns B's initial margin; A rejoins.
  Keeping the loss below A's initial margin leaves the default fund and the capital whole for the next run on the same
  chain.
