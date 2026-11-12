```yaml
id: wp-adr-triparty-substitution
kind: decision
subtype: adr
timestamp: 2026-11-12T11:53:00Z
review: accepted
provenance:
  conversationId: triparty-substitution
  sourceRef: 38140e048d810e158beb273724813d18a6c01704
  contentHash: 38140e048d810e158beb273724813d18a6c01704
  timestamp: 2026-11-12T11:53:00Z
  confidence: 0.55
createdAt: 2026-11-12T11:53:00Z
updatedAt: 2026-11-12T11:53:00Z
```
# ADR: the giver asks for units of an asset back and the agent replaces them from the giver's free account until the repo is covered again, or declines; the agent can start one to remove a limit breach

For [[task-triparty-substitution]] (section C, row 23 of the workflow map), within [[wp-adr-triparty-scope]] and on the
holding of [[wp-adr-triparty-trade-start]] and [[wp-adr-triparty-revaluation]]. The project owner chose option (a) for
all ten questions on 2026-11-12 (source `38140e048d810e158beb273724813d18a6c01704`: "(a) for all"), after the CDM check
recorded in that task. The rest of this record is the maintainer's proposal.

- **Request (1a, 6a).** The giver names an asset of the repo's holding and the units it wants back. Its service builds a
  cdm-ext `TripartySubstitutionRequest` (the trade, the ISIN, the units, the requester, the date) and records its hash
  on `TripartySettlement` (`requestSubstitution`); one request may be pending per repo. The giver can withdraw it while
  it is pending.
- **Replacement (2a).** The agent returns the units to the giver's free account and replaces them from that account in
  the giver's ranking, without the returned asset, eligible assets only and within the limits (with the units of each
  asset still held), until the holding is worth at least the required value of [[wp-adr-triparty-revaluation]] (the
  Repurchase Price accrued to the agent's business date) after haircuts; the last asset rounded up to whole units. When
  the holding after the return still covers the required value, nothing replaces it.
- **Decline (3a).** When the free account cannot cover the shortfall, or the repo holds fewer units than asked, the
  agent declines: nothing moves and the declined `TripartySubstitution` is recorded on-chain.
- **Agent-started substitution (4a).** When the repo's latest revaluation or substitution recorded a breach, the agent
  can request on its own the return of the asset's units above its limit (rounded up) and substitute them the same way.
- **No affirmation (5a).** The receiver does not affirm; it and the giver recompute each substitution (8a).
- **CDM record (7a).** A cdm-ext `TripartySubstitution`: the request hash, the hash of the allocation, revaluation or
  substitution whose holding it changes, the date, the required value, the agent's inputs (the held positions and the
  free account with their ranks and the feed prices), the holdings valued before and after, the movements, the outcome
  (`Substituted`, `Declined`), the breaches, and, when substituted, the terms change of the repo's collateral
  (`Create_SubstitutionInstruction` with the trade's own Purchase Date) and CDM's workflow: the proposed step (the
  instruction, the requester, BANK-T's approval) and the accepted step with the event. cdm-ext `RepoIsSubstitution`
  qualifies it (`RepoIsCollateralRelease` when nothing replaces the returned units).
- **Verification (8a).** As for a revaluation: from the chain at the block before, the request document from the
  payload store, the same document.
- **Contract (9a).** `TripartySettlement` keeps one ordered history of the repo's holding changes (revaluations,
  substitutions and declines, each with its hash, block and kind), so each document's basis is the last change before
  it that moved or confirmed the holding. `requestSubstitution(repoId, requestHash)` (the giver, or the agent for a
  breach), `withdrawSubstitution` (the requester), `substitute(repoId, substitutionHash, tokens, amounts)` and
  `declineSubstitution(repoId, substitutionHash)` (the agent, for the pending request). A new deployment.
- **Console.** The giver requests a substitution in its repo row; the agent substitutes, declines, or swaps out an excess
  in `#/live/T`; all three see each substitution with its check.
- **Live spec (10a).** `flow-triparty-substitution`: B, with 1,500 tUST more deposited, asks for 1,000 tAGY back and
  the agent swaps in 998 tUST; then B asks for the remaining 1,190 tAGY, which its free tUST cannot replace, and the
  agent declines.

**Consequences.**
- `TripartySettlement` changes again (the history replaces `revaluationsOf`); a new deployment.
- The substitution rules are assumptions; the questions are in [[task-sme-triparty-substitution]].
