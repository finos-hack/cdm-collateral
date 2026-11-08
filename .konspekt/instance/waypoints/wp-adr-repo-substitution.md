```yaml
id: wp-adr-repo-substitution
kind: decision
subtype: adr
timestamp: 2026-11-08T19:59:37Z
review: proposed
provenance:
  conversationId: repo-substitution
  sourceRef: 1f591034dc560e55251b72785553d524701abbf3
  contentHash: 1f591034dc560e55251b72785553d524701abbf3
  timestamp: 2026-11-08T19:59:37Z
  confidence: 0.7
createdAt: 2026-11-08T19:59:37Z
updatedAt: 2026-11-08T19:59:37Z
```

# ADR: a repo substitution replaces all the securities of one repo at equal value, settled by a new phase of RepoSettlement

For [[task-repo-substitution]] (section C, row 6 of the workflow map), within [[wp-adr-repo-gmra-scope]], following the
project owner's choices of 2026-11-08 (source `1f591034dc560e55251b72785553d524701abbf3`: "Add a substitution phase", "At least equal value", "One chosen repo",
"Repurchase Price unchanged"):

- **Trigger and scope.** The Seller chooses one purchased repo and a substitute security with a feed price, other than the
  current one. All the repo's securities are replaced. One CDM event and one on-chain settlement.
- **Value.** The substitute quantity is the current securities' Market Value at the feed price divided by the substitute's
  feed price, rounded up to whole units. The Buyer's agreement is the eligibility check. The agreeing service rebuilds the
  event from the feed and its business date, and refuses a difference.
- **Cash.** No cash moves. The Purchase Price and the stored Repurchase Price do not change.
- **CDM.** The event is built with CDM's `Create_SubstitutionPrimitiveInstruction` and `Create_BusinessEvent`.
- **Settlement.** `RepoSettlement` gains a substitution phase. The Seller's instruction is the request and the Buyer's
  matching instruction is the agreement; the second moves both securities and updates the stored security, quantity and
  trade hash in one transaction. The Buyer can refuse, which clears the request.
- **Prototype.** A substitution request and agreement in the Repo margin card and live specs.

**Consequences.**
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-substitution.json`.
- The rules are assumptions listed in [[task-sme-repo-substitution-rules]].
