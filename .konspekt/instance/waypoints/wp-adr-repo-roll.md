```yaml
id: wp-adr-repo-roll
kind: decision
subtype: adr
timestamp: 2026-11-08T23:21:41Z
review: accepted
provenance:
  conversationId: repo-roll
  sourceRef: e1c2bf5c4fd1267ffad133deb7c37373f3ac3c24
  contentHash: e1c2bf5c4fd1267ffad133deb7c37373f3ac3c24
  timestamp: 2026-11-08T23:21:41Z
  confidence: 0.7
createdAt: 2026-11-08T23:21:41Z
updatedAt: 2026-11-09T01:10:42Z
```

# ADR: a repo rolls on its Repurchase Date through CDM's roll, the Seller pays the Price Differential, and either party proposes

For [[task-repo-roll]] (section C, row 8 of the workflow map), within [[wp-adr-repo-gmra-scope]], following the project
owner's choices of 2026-11-08 (source `e1c2bf5c4fd1267ffad133deb7c37373f3ac3c24`: "Seller pays interest", "Repurchase Date only", "New date and rate", "Either;
other agrees/refuses"):

- **Event.** CDM's `Create_RollPrimitiveInstruction` closes the trade and opens one with the new Repurchase Date and repo
  rate, starting on the old Repurchase Date. The securities and the Purchase Price do not change. CDM's `Qualify_Roll` is
  the check. This row adds nothing to `cdm-ext`; it uses `RepoAccruedPriceDifferential` and `RepoRepurchasePrice` from earlier
  rows. The new rate is written into the price quantity input in `CdmRepo.java` (the project owner's correction and choice, source `df618606288384e0af8e1f8f8c3c0d2dffca752c`).
- **Cash.** The Seller pays the Buyer the Price Differential to the old Repurchase Date, net of interim interest already
  paid. The contract derives it as the stored Repurchase Price less the Purchase Price.
- **Date.** A roll happens only when the business date is the Repurchase Date. `Qualify_Roll` is false for a roll during
  the term.
- **Agreement.** Either party enters the new Repurchase Date and the rate, which defaults to the current one. The other
  party's service rebuilds the event from the proposed terms and instructs the same hash, or the party refuses and the repo
  stays due for repurchase.
- **Settlement.** `RepoSettlement` gains a roll phase, which moves the cash and updates the trade hash and Repurchase Price
  in one transaction when the second instruction matches.
- **Prototype.** Actions in the Repos card and live specs.

**Consequences.**
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-roll.json`.
- The rules are assumptions listed in [[task-sme-repo-roll-rules]].
