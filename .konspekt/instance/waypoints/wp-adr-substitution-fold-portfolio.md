```yaml
id: wp-adr-substitution-fold-portfolio
kind: decision
subtype: adr
timestamp: 2026-11-06T14:41:19Z
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 3ed9a6ece72bb47fe574147df6e1dd2aae5fafee
  contentHash: 3ed9a6ece72bb47fe574147df6e1dd2aae5fafee
  timestamp: 2026-11-06T14:41:19Z
  confidence: 0.65
createdAt: 2026-11-06T14:41:19Z
updatedAt: 2026-11-06T14:41:19Z
```
# ADR: substitution steps fold over the escrow read at the block before each step; consent always required

For `flow-substitution` ([[task-csa-substitution]], G16), each step (request, consent or refusal, settle) is one CDM
`SubstitutionInstruction` carried in the payload store and anchored by its hash on-chain
([[wp-adr-cdm-payload-carrier]]). Each service folds the steps through cdm-ext `Create_CollateralSubstitution`. The
function's `portfolio` input is built from the escrow and the feed prices at the end of the block before the step's
block, read by each party from its own node; its balance is the escrow's value after haircuts in whole USD. The event
date and timestamp are the step's block time. Each service keeps the portfolio it read in its store and reuses it for
later folds. The control contract requires the secured party's consent for every substitution, and the CDM elections
used in the fold say the same (Paragraph 13 (f)(ii) consent for the pledgor, Party1).

**Context.** Both parties must fold the same inputs to reach the same state hash, without exchanging the portfolio.
The chain state at a fixed block is the same on every QBFT node. The Besu nodes serve state for a bounded number of
recent blocks only (the default storage settings in `besu/docker-compose.yml`; the limit was not checked on these
nodes), so the portfolio is read once and kept.

**Consequences.**
- A service that was not running within that block window after a step cannot build the step's portfolio, and its fold
  reports the error; re-running a node as an archive node, or carrying the portfolio in the payload store, would
  remove that limit.
- The fold validates the substitution's own CDM conditions (originals held, value proviso, consent, order); the contract
  checks holdings and values again at the feed prices of the settling block.
- The agreement's Substitution election is fixed in the prototype; a pledgor election without consent is not modelled
  on-chain.
