```yaml
id: task-substitution-ledger-anchors
type: task
title: Build ledger anchors for collateral substitutions
status: open
review: accepted
provenance:
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T03:05:00Z
  confidence: 0.8
createdAt: 2026-11-22T03:05:00Z
updatedAt: 2026-11-22T03:15:57Z
```
# Task: build ledger anchors for collateral substitutions

Under [[goal-tokenized-collateral]]. G25 ([[task-cdm-gap-closure]]) anchors margin call steps and, since
[[task-authoritative-record-settlement-enforcement]], enforcements. `AnchoredRecordEnum` has `Substitution`, and the
substitution events carry the CDM hash, but the collateral service builds no substitution anchor.

Done when the service builds the `LedgerAnchor` of each substitution record from the chain events, both parties build
the same anchor, the substitution state reports its status, and the flow-substitution live spec checks it.
