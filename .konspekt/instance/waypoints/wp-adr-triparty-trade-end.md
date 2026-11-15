```yaml
id: wp-adr-triparty-trade-end
kind: decision
subtype: adr
timestamp: 2026-11-12T12:42:00Z
review: accepted
provenance:
  conversationId: triparty-trade-end
  sourceRef: ni:///sha-256;kCFINuDc5yr4LikihHp9nanqxBDuQIFznFrI3iOtqWk
  timestamp: 2026-11-12T12:42:00Z
  confidence: 0.55
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: baffa673bcccdc9dd2a5d617bd8963a25cdd4e41
    contentHash: baffa673bcccdc9dd2a5d617bd8963a25cdd4e41
createdAt: 2026-11-12T12:42:00Z
updatedAt: 2026-11-12T12:42:00Z
```
# ADR: on the Repurchase Date the agent prepares the trade end and the giver pays the Repurchase Price to the receiver against the release of the whole holding to its free account, in one transaction

For [[task-triparty-trade-end]] (section C, row 24 of the workflow map), within [[wp-adr-triparty-scope]], ending the repos
of [[wp-adr-triparty-trade-start]] as [[wp-adr-triparty-revaluation]] and [[wp-adr-triparty-substitution]] leave them.
The project owner chose option (a) for all ten questions on 2026-11-12 (source
`baffa673bcccdc9dd2a5d617bd8963a25cdd4e41`: "1. All a"), after the CDM check recorded in that task: CDM's repurchase
event closes the repo and leaves its collateral portfolio as it was, and CDM has no settlement through an agent (T9). The
rest of this record is the maintainer's proposal.

- **Preparation (1a, 2a, 5a).** On the repo's Repurchase Date (the agent's business date) the agent builds a cdm-ext
  `TripartyTradeEnd` and records its hash and the Repurchase Price on `TripartySettlement` (`prepareTradeEnd`). Refused
  before or after the date, and while a substitution request is pending. Once prepared, the repo takes no revaluation or
  substitution.
- **Settlement (1a, 3a, 4a).** The giver settles (`settleRepurchase`) with the document's hash: in one transaction the
  Repurchase Price moves from the giver to the receiver and the whole holding returns to the giver's free account under
  the terms; the repo ends `repurchased` and no longer counts as open, so the terms can be terminated once no repo is
  open and nothing is free. The giver withdraws the tokens as before.
- **CDM record (6a).** `TripartyTradeEnd`: the hash of the allocation, revaluation or substitution whose holding it ends,
  the Repurchase Date, the Repurchase Price (cdm-ext `RepoRepurchasePrice`, whole tUSD), CDM's repurchase event over the
  repo as that document left it (`ResolveRepurchaseTransferInstruction`; `Qualify_Repurchase` false, D25), one CDM
  `ScheduledTransfer` per held asset from the receiver to the giver and the cash transfer from the giver to the receiver.
  Conditions: the release covers exactly the repo's collateral portfolio, unit for unit (cdm-ext
  `TripartyReleaseCoversHolding`), and the cash moves against it.
- **Verification (7a).** The giver and the receiver rebuild the document from the basis document and the holding on-chain
  at the block before the preparation; the giver's service settles only a document it rebuilt.
- **Contract (8a).** `RepoState.Repurchased`; `prepareTradeEnd(repoId, tradeEndHash, repurchasePrice)` (the agent) and
  `settleRepurchase(repoId, tradeEndHash)` (the giver); `tradeEndOf(repoId)` (hash, price, block). A new deployment.
- **Console.** The agent's `Prepare trade end` in `#/live/T` on the Repurchase Date; the giver's `Settle repurchase`
  with the amount; the repo shown as repurchased in all three consoles.
- **Live spec (9a, 10a).** `flow-triparty-trade-end`: B's repo from flow-triparty-trade-start's setup reaches its
  Repurchase Date (the agent's business date set to it); T prepares, B settles 500,486 tUSD to A against the release of
  3,000 tUST and 2,190 tAGY and withdraws them; then every other settled repo under the B-giver terms is ended the same
  way through the services, at its own Repurchase Date, and B terminates the terms, so the runs no longer accumulate
  open repos.

**Consequences.**
- `TripartySettlement` changes again; a new deployment.
- The trade-end rules are assumptions; the questions are in [[task-sme-triparty-trade-end]].
