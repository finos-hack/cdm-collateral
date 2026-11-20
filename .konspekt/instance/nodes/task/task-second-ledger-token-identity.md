```yaml
id: task-second-ledger-token-identity
type: task
title: Represent tokenized collateral on a second ledger to test that token identity is ledger-neutral
status: open
review: accepted
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ
  timestamp: 2026-11-20T20:06:53Z
  confidence: 0.7
createdAt: 2026-11-20T20:06:53Z
updatedAt: 2026-11-20T21:22:45Z
```
# Task: represent tokenized collateral on a second ledger

Under [[goal-tokenized-collateral]]. `TokenizedAsset` and `LedgerReference` (G24, G25, [[task-cdm-gap-closure]]) keep
ledger identity as data, but only Besu is represented, so nothing shows that the model fits a ledger that is not
EVM-based. DTCC also runs Canton. Requirement: [[concept-asr-ledger-neutrality]].

To decide: which ledger (Canton or another), and whether the work stops at data (sample `TokenizedAsset` and
`LedgerReference` records with tests) or includes a running ledger in the prototype.

Done when at least one tokenized asset and one ledger reference for the second ledger are represented without
changing the types, or the types are changed and the reason is recorded.
