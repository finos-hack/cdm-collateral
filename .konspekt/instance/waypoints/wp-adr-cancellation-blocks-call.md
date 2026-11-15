```yaml
id: wp-adr-cancellation-blocks-call
kind: decision
subtype: adr
timestamp: 2026-11-06T20:38:13Z
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;_EDA_sLSOq7nP4KkQVQTufTZ4VumGB755txW2M7KJmc
  timestamp: 2026-11-06T20:38:13Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: ff7f6cec9c7bbab4c9cd9ce61785cd5393aee845
    contentHash: ff7f6cec9c7bbab4c9cd9ce61785cd5393aee845
createdAt: 2026-11-06T20:38:13Z
updatedAt: 2026-11-06T20:45:24Z
```
# ADR: a pending cancellation request blocks the call; acceptance voids its live proposal on-chain

For `flow-call-cancellation` ([[task-csa-call-cancellation]]), within the owner's rules of 2026-11-06 (assumptions awaiting
[[task-sme-call-cancellation-rules]]):

- `MarginCall` keeps the pending requester on the call (`cancellationRequestedBy`). While it is set, `propose`,
  `decideProposal` and `markSettled` revert, so no collateral can move while a cancellation is being decided. The cdm-ext
  lifecycle matches: `NextMarginCallStep` is `DecideCancellation` while a request is pending.
- One request at a time. Only the party that did not request decides; the cdm-ext step names the deciding party
  (`decidedBy`) and its condition rejects the requester.
- On acceptance the call becomes `Cancelled` on-chain and in the CDM state, and the live proposal (proposed or
  accepted) becomes `Cancelled` in both. A refusal leaves the call where it was, and a later request is allowed.
- A withdrawal states its reason (`WithdrawCallInstruction.reason` is required); a request and a refusal may state one.
- Each step is a cdm-ext `MarginCallInstruction` anchored by its hash on the step event (`CallWithdrawn`,
  `CancellationRequested`, `CancellationDecided`), so both services fold and anchor it like the other steps.

**Context.** CDM 7.7.0 has no margin call cancellation; its generic `WorkflowStep` cancel records that a step is void,
not a request and decision between the parties.

**Consequences.**
- A request left undecided blocks the call indefinitely; there is no timeout (SME question 2).
- A cancelled call is not replaced automatically; a corrected call is a new call with no link to the cancelled one (SME
  question 5).
- A settled call cannot be cancelled; the way back is a return call.
