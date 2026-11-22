```yaml
id: task-console-record-keeper-completion
type: task
title: Show completion by the record keeper in the party consoles
status: resolved
review: accepted
provenance:
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T03:05:00Z
  confidence: 0.7
createdAt: 2026-11-22T03:05:00Z
updatedAt: 2026-11-22T15:20:15Z
```
# Task: show completion by the record keeper in the party consoles

Under [[goal-tokenized-collateral]]. Since [[task-authoritative-record-settlement-enforcement]] the services report
whether a step or an enforcement of a Registered or Claim token is complete (`cdm-state` `settlementComplete` and
`recordKeeper`, `/calls/{id}/enforcement`, `/register/breaks`), but the consoles do not show it: a tMMF pledge reads
"settled on-chain" while the transfer agent has not confirmed.

Done when a party's console shows, for a call that moved a Registered or Claim token, whether the record keeper has
confirmed, and shows a register break, and a live spec checks it in the UI.

Resolved 2026-11-22 (project owner): the live console reads `cdm-state`, `/calls/{id}/enforcement` and
`/register/breaks` for calls that moved a Registered or Claim token, shows in the call row whether the record keeper
has confirmed the step and the enforcement, and shows each register against the ledger with its breaks.
`flow-registered-collateral` checks both consoles while the transfer agent is paused and after it confirms (local
live suite: 54 passed).
