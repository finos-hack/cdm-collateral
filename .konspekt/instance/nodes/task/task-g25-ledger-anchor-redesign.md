```yaml
id: task-g25-ledger-anchor-redesign
type: task
title: Rework G25 as append-only ledger anchors derived from the chain
status: open
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: 67989287b51231983b6e1159a2195a185f5d16b3
  contentHash: 67989287b51231983b6e1159a2195a185f5d16b3
  timestamp: 2026-11-04T02:21:16Z
  confidence: 0.8
createdAt: 2026-11-04T02:21:16Z
updatedAt: 2026-11-04T02:21:16Z
```
# Task: rework G25 (ledger anchors)

Under [[task-cdm-gap-closure]]. Implement [[nw-ledger-anchor-redesign]] in `cdm-ext/rosetta/cdmx-collateral-ledger-*`,
and remove the attributes and functions of the rejected design ([[nw-ledger-reference-and-token-identity]]) from the
margin call, event, enforcement and substitution files and their tests. Per the project owner (2026-11-04): done
before the P2 gaps, in a separate session. G25 stays reopened in the gap register until this task is done.

Progress 2026-11-04T02:39:30Z:
- Implemented in `cdm-ext` commit 27348a5: the rejected attributes and functions removed; `LedgerAnchor`,
  `Create_LedgerAnchor`, `AnchorFor`, `AnchorStatus`, `MarginCallStepAnchorStatus`, `TransferComplete` and
  `RecordKeeperConfirmation` added ([[nw-ledger-anchor-implementation]]). Extension tests: 126 pass; the collateral
  service builds. G25 is closed (proposed, for review) in the gap register.
- Open: the collateral service does not build anchors from the gateway's events yet.
