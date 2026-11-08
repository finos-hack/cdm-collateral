```yaml
id: wp-adr-repo-adjustment
kind: decision
subtype: adr
timestamp: 2026-11-08T17:19:27Z
review: proposed
provenance:
  conversationId: repo-adjustment
  sourceRef: 0dd1cef601500b689fcd3ce949a69d1c02f9647d
  contentHash: 0dd1cef601500b689fcd3ce949a69d1c02f9647d
  timestamp: 2026-11-08T17:19:27Z
  confidence: 0.7
createdAt: 2026-11-08T17:19:27Z
updatedAt: 2026-11-08T17:19:27Z
```

# ADR: an adjustment is an alternative to a margin call, one CDM adjustment event per open repo, settled by a new phase of RepoSettlement

For [[task-repo-adjustment]] (section C, row 5 of the workflow map), within [[wp-adr-repo-gmra-scope]] and alongside
[[wp-adr-repo-reprice]], following the project owner's choices of 2026-11-08 (source `0dd1cef601500b689fcd3ce949a69d1c02f9647d`: "Add an adjustment phase",
"Every open repo", "Instead of a call", "Settled in cash"):

- **Trigger.** The party with the Net Exposure chooses Adjust in the Repo margin card and the other party agrees. An
  adjustment creates no `MarginCall` record, and `CollateralControl` does not change.
- **Scope.** One CDM adjustment event and one on-chain settlement per purchased repo of the pair. The group is not one
  atomic transaction.
- **Economics.** The Purchase Price does not change. The new quantity is the Purchase Price times the Margin Ratio divided
  by the feed price, rounded up to whole units. The Seller delivers the difference when the quantity rises and the Buyer
  returns it when the quantity falls. The Seller pays the Buyer the Price Differential accrued to the adjustment date in
  cash, in the same transaction. The replacement trade accrues from the adjustment date to the original Repurchase Date.
- **CDM.** The event is built with CDM's `Create_AdjustmentPrimitiveInstruction` and `Create_BusinessEvent`.
- **Settlement.** `RepoSettlement` gains an adjustment phase. Both parties instruct with the same CDM hash and amounts; the
  second instruction moves the securities difference and the cash and updates the stored quantity, Repurchase Price and
  trade hash in one transaction. A party may replace its own instruction until the other has instructed.
- **Prototype.** An Adjust action in the Repo margin card and live specs.

**Consequences.**
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-adjustment.json`.
- The rules are assumptions listed in [[task-sme-repo-adjustment-rules]].
