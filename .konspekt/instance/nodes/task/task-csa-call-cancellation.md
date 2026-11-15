```yaml
id: task-csa-call-cancellation
type: task
title: Build the margin call cancellation flow
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;zUSWoS_Is_x0i0j9LQ7oiK6y41fk_3-H9AvsdYOfhrA
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
    contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T20:45:24Z
```
# Task: build the margin call cancellation flow

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 5 of section B of the workflow map. No coverage-matrix row; only the ISO 20022 message names (colr.005/006,
findings). Needs a CDM coverage check and, where missing, the CDM side in `cdm-ext`, then the prototype flow,
contracts, gateway, services, console steps and a live spec.

## Decisions 2026-11-06T20:16:20Z

The project owner (2026-11-06, source `ff7f6cec9c7bbab4c9cd9ce61785cd5393aee845`), with the instruction to log every assumption in the SME backlog
([[task-sme-call-cancellation-rules]]):

1. The calling party withdraws an unanswered (issued) call alone. Once the call is answered, cancellation is a request
   by either party that the other accepts or refuses (ISO 20022 colr.005 and colr.006).
2. A call with a proposed or accepted proposal that has not settled can be cancelled; the proposal is voided.
3. cdm-ext extends its margin call lifecycle (`cdmx.collateral.margincall`): a `Cancelled` status, cancellation steps
   (request, accept or refuse) and a `MarginCallCancelled` qualifier.
4. A wholly disputed call can be cancelled.

Found 2026-11-06: CDM 7.7.0 has no margin call cancellation. Its only cancellation of a recorded step is the generic
`WorkflowStep` with `action` Cancel and a `previousWorkflowStep` reference (CDM's example cancels a trade booked in
error). `Qualify_Cancellation` is a repo term event. Collateral moves only at settlement in the prototype, so a call
cancelled before settlement has moved nothing.

## Progress 2026-11-06T20:38:13Z

Built on branch `call-cancellation`: cdm-ext cancellation steps in `cdmx.collateral.margincall` (commit `9469cd7`,
`CancellationTest` 11 tests) and `flow-call-cancellation` (commit `b697470`): `MarginCall.withdrawCall`,
`requestCancellation` and `decideCancellation`, gateway routes and step events, service step builders and endpoints
(`CdmCancellationTest`, 3 tests), console call actions (6 unit tests), the CALM flow, docs and task map row 5. Contract
tests 41/41, cdm-ext 169/169, service 21/21, console 68/68, live specs 11/11 on a new contract set on the same chain
(earlier set kept as `besu.pre-cancellation.json`). The rules follow the owner's decisions above and await
[[task-sme-call-cancellation-rules]]. Design choices are proposed in [[wp-adr-cancellation-blocks-call]].

## Resolved 2026-11-06T20:45:24Z

Resolved by the project owner (2026-11-06: "3. yes"), with [[wp-adr-cancellation-blocks-call]] and [[task-sme-call-cancellation-rules]] accepted in the same
decision. The owner asked why a corrected call has no link to the call it cancels; that is open as a possible
follow-up (SME question 5). Pushed on branch `call-cancellation` for review.
