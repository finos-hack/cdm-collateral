```yaml
id: wp-adr-repo-reprice
kind: decision
subtype: adr
timestamp: 2026-11-08T15:59:51Z
review: accepted
provenance:
  conversationId: repo-reprice
  sourceRef: ni:///sha-256;c_Gh9lOto12yt03OyklkAXpVRKHQD_lADcmW8XbKB5s
  timestamp: 2026-11-08T15:59:51Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 729ada99275ed710b1515fb8acc6de27fa1df799
    contentHash: 729ada99275ed710b1515fb8acc6de27fa1df799
createdAt: 2026-11-08T15:59:51Z
updatedAt: 2026-11-08T16:33:21Z
```

# ADR: a reprice is an alternative to a margin call, one CDM reprice event per open repo, settled by a new phase of RepoSettlement

For [[task-repo-reprice]] (section C, row 4 of the workflow map), within [[wp-adr-repo-gmra-scope]] and alongside
[[wp-adr-repo-margin-maintenance]], following the project owner's choices of 2026-11-08 (source `729ada99275ed710b1515fb8acc6de27fa1df799`: "Add a reprice
phase", "Every open repo", "Instead of a call", "Settled at the reprice"):

- **Trigger.** The party with the Net Exposure chooses Reprice or Call margin in the Repo margin card, and the other
  party agrees to the reprice. A reprice creates no `MarginCall` record, and `CollateralControl` does not change.
- **Scope.** One CDM reprice event and one on-chain settlement per purchased repo of the pair, each with its own cash
  difference. The Net Exposure is eliminated once all have settled; the group is not one atomic transaction.
- **Economics.** The new Purchase Price is the market value at the feed price divided by the Margin Ratio
  (`RepoPurchasePriceForMarketValue`). The securities do not move. The cash difference is the old Purchase Price plus the
  Price Differential accrued to the reprice date, less the new Purchase Price. The replacement trade accrues from the
  reprice date to the original Repurchase Date on the new Purchase Price.
- **CDM.** The event is built with CDM's `Create_RepricePrimitiveInstruction` and `Create_BusinessEvent`, and checked with
  `cdm-ext` `RepoIsReprice`, because CDM's `Qualify_Reprice` cannot be true for a repo (defect D20).
- **Settlement.** `RepoSettlement` gains a reprice phase. Both parties instruct with the same CDM hash and amounts; the
  second instruction moves the cash difference and updates the stored prices and trade hash in one transaction. A party
  may replace its own instruction until the other has instructed, so a moved feed price does not strand an offer.
- **Prototype.** A Reprice action in the Repo margin card and a live spec.

**Consequences.**
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-reprice.json`.
- The rules are assumptions listed in [[task-sme-repo-reprice-rules]].
