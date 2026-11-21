```yaml
id: task-sme-document-provenance
type: task
title: Confirm with a business SME who keeps each link from a token to its asset, and what counts as evidence
status: open
review: proposed
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4
  timestamp: 2026-11-21T21:42:22Z
  confidence: 0.7
createdAt: 2026-11-21T21:42:22Z
updatedAt: 2026-11-21T21:42:22Z
```
# Task: who keeps each link from a token to its asset, and what counts as evidence

Under [[goal-tokenized-collateral]], for [[task-document-provenance]] (gap G41). The provenance record would hold each
document's hash on the ledger and the document itself off it. Questions for the SME:

1. For each link from a pledged token back to its underlying asset (the security or loan agreement, the registry
   entry, the SPV's constitution, the token terms, the valuation), who keeps the authoritative copy? Would a hash of
   that copy anchored on the ledger, with the copy held off the ledger, be accepted as evidence of the link by a court,
   a regulator or an auditor?
2. Which of those links must a secured party verify before it accepts a tokenized asset as collateral, and when must
   it verify them again: at each pledge, at each revaluation, or only when a document is amended?

These are PROV-1 and PROV-2 in `docs/analysis/sme-question-ledger.md`.
