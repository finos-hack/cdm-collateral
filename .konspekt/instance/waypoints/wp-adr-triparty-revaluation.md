```yaml
id: wp-adr-triparty-revaluation
kind: decision
subtype: adr
timestamp: 2026-11-12T04:13:02Z
review: accepted
provenance:
  conversationId: triparty-revaluation
  sourceRef: 6a7359a7984c74ea1532a50e8983f72646773375
  contentHash: 6a7359a7984c74ea1532a50e8983f72646773375
  timestamp: 2026-11-12T04:13:02Z
  confidence: 0.55
createdAt: 2026-11-12T04:13:02Z
updatedAt: 2026-11-12T04:13:02Z
```
# ADR: the agent revalues a settled triparty repo at the feed prices against the Repurchase Price accrued to the date; it tops up from the giver's free account in the giver's ranking or releases from the lowest-ranked asset, and TripartySettlement moves the units in one transaction

For [[task-triparty-revaluation]] (section C, row 22 of the workflow map), within [[wp-adr-triparty-scope]] and on the
allocation of [[wp-adr-triparty-trade-start]]. The project owner chose option (a) for all ten questions on 2026-11-12
(source `6a7359a7984c74ea1532a50e8983f72646773375`: "1. (a) across the board"), after the CDM check recorded in that
task: CDM can record the agent's valuation and the changed collateral as valid events, and has no function for the
value required, no valuation after haircuts and no qualification of a top-up or a release. The rest of this record is
the maintainer's proposal.

- **Required value (1a).** The Purchase Price plus the Price Differential accrued to the revaluation date (cdm-ext
  `RepoPurchasePrice`, `RepoPriceDifferential` over the CDM repo), rounded to the cent. The haircuts take the place of
  the GMRA margin ratio, as at trade start.
- **Valuation.** Each held asset at the oracle feed price less the profile's haircut, as at trade start.
- **No threshold (2a).** A shortfall of any size is topped up; an excess is released in whole units, so the value after
  a release stays at or above the required value and the residual excess is less than one unit of the asset released
  last.
- **Top-up (3a, 5a).** From the giver's free account under the terms, in the giver's ranking, eligible assets only, an
  asset under a limit capped at the whole units whose value after haircuts, with the units of that asset already held,
  stays within its limit of the required value; the last asset rounded up to whole units. When the free account cannot
  cover the shortfall, nothing moves and the revaluation is recorded as uncovered.
- **Release (4a).** From the held asset with the highest rank number (the giver's last choice) first, in whole units
  rounded down; the next asset is released only once the one before it is released in full.
- **Limits (6a).** A breach caused by a price move alone is recorded in the revaluation and left; substitution (row 23)
  removes it. A top-up never adds a breach.
- **CDM record (7a).** A cdm-ext `TripartyRevaluation` document: the hash of the allocation or earlier revaluation it
  follows, the date, the required value, the agent's inputs (the held positions and the free account with their ranks
  and prices), the held positions valued before and after, the movements, the outcome (`Unchanged`, `TopUp`, `Release`,
  `Uncovered`), the breaches, and two CDM events over the repo: the agent's valuation (`Create_Valuation`,
  `MarkToMarket`, the collateral and the trade valued in the base currency) and, when units move, the terms change
  (`Create_SubstitutionInstruction` with the trade's own Purchase Date, so the accrual does not restart). New cdm-ext
  qualifiers `RepoIsCollateralTopUp` and `RepoIsCollateralRelease` tell a top-up (no asset decreases, at least one
  increases) and a release (no asset increases or is added, at least one decreases) from a substitution, which CDM's
  `Qualify_Substitution` and `Qualify_Adjustment` do not (D20, D22).
- **Verification (8a).** The giver's and the receiver's services recompute the revaluation from the chain at the block
  before it: the repo's held tokens, the giver's free account and ranks, and the feed prices, read at that block
  through the gateway (as `escrow-at` does for flow-substitution); the document must be the same.
- **Contract (9a).** `TripartySettlement.revalue(repoId, revaluationHash, tokens, amounts)`, callable by the agent
  only on a settled repo: the new holding replaces the old, the difference moves between the giver's free account and
  the repo's account in one transaction, and the hash is appended to the repo's revaluations with its block. An
  unchanged or uncovered revaluation records its hash and moves nothing. A new deployment.
- **Console.** The agent revalues a settled repo in `#/live/T` and sees the outcome with its values; the giver and the
  receiver see each revaluation with its check.
- **Live spec (10a).** `flow-triparty-revaluation`: BANK-B as the giver repos 500,000 tUSD to BANK-A as in
  flow-triparty-trade-start, with 1,000 tAGY left free; the tAGY price falls and the agent tops up from the free tAGY;
  the price rises and the agent releases tAGY; the prices are restored.

**Consequences.**
- `TripartySettlement` gains `revalue` and the revaluation history; a new deployment.
- The revaluation rules are assumptions; the questions are in [[task-sme-triparty-revaluation]].
