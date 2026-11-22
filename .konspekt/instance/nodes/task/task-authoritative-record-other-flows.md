```yaml
id: task-authoritative-record-other-flows
type: task
title: Apply completion by authoritative record to the repo, GMSLA and triparty flows
status: resolved
review: accepted
provenance:
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T03:05:00Z
  confidence: 0.75
createdAt: 2026-11-22T03:05:00Z
updatedAt: 2026-11-22T16:47:09Z
```
# Task: apply completion by authoritative record to the repo, GMSLA and triparty flows

Under [[goal-tokenized-collateral]]. Follow-up of [[task-authoritative-record-settlement-enforcement]], which applies
interim rules REG-1 to REG-5 ([[task-sme-registered-asset-completion]]) to the CSA flows only. tMMF moves in the
GMSLA flows (the loaned security) and in repo substitution, and those report a movement complete on the mined
transaction alone.

Done when each repo, GMSLA and triparty movement of a Registered or Claim token is complete only after the record
keeper's confirmation (`TransferComplete`), eligibility applies `EligibleUnderControl`, and a live spec shows a tMMF
movement waiting for the transfer agent in one of these flows.

Resolved 2026-11-22 (project owner), PR #84. The gateway lists the repo, securities loan and triparty transactions that
moved a Registered or Claim token, by record (`/register/movements`); the `/repos`, `/loans` and `/triparty` views
report `recordKeeper` and `settlementComplete` for those records from `TransferComplete` and the record keeper's
confirmations. `EligibleUnderControl` applies to repo booking and substitution, GMSLA collateral and its substitution,
triparty deposits and a triparty profile with tMMF, which the giver may now propose (`registeredCollateral`). Live specs:
`flow-registered-collateral-gmsla` (delivery and return of a tMMF loan) and `flow-registered-collateral-triparty`
(deposit and withdrawal of tMMF under terms whose profile includes it), each waiting for the transfer agent.

These records have no `LedgerAnchor` kind, so the anchor status passed to `TransferComplete` is the transaction's
(Complete: a movement is read from a mined transaction's logs). Project owner, 2026-11-22: anchor kinds for these
records become part of the shared `AnchoredRecordEnum` extension, with [[task-substitution-ledger-anchors]].
