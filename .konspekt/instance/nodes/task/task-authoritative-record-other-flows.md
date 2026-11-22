```yaml
id: task-authoritative-record-other-flows
type: task
title: Apply completion by authoritative record to the repo, GMSLA and triparty flows
status: open
review: proposed
provenance:
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T03:05:00Z
  confidence: 0.75
createdAt: 2026-11-22T03:05:00Z
updatedAt: 2026-11-22T03:05:00Z
```
# Task: apply completion by authoritative record to the repo, GMSLA and triparty flows

Under [[goal-tokenized-collateral]]. Follow-up of [[task-authoritative-record-settlement-enforcement]], which applies
interim rules REG-1 to REG-5 ([[task-sme-registered-asset-completion]]) to the CSA flows only. tMMF moves in the
GMSLA flows (the loaned security) and in repo substitution, and those report a movement complete on the mined
transaction alone.

Done when each repo, GMSLA and triparty movement of a Registered or Claim token is complete only after the record
keeper's confirmation (`TransferComplete`), eligibility applies `EligibleUnderControl`, and a live spec shows a tMMF
movement waiting for the transfer agent in one of these flows.
