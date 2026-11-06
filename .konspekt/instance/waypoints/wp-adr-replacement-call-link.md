```yaml
id: wp-adr-replacement-call-link
kind: decision
subtype: adr
timestamp: 2026-11-06T21:44:40Z
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 0ca6129cd3db0942293f5dfb317e913ab0b7eb71
  contentHash: 0ca6129cd3db0942293f5dfb317e913ab0b7eb71
  timestamp: 2026-11-06T21:44:40Z
  confidence: 0.6
createdAt: 2026-11-06T21:44:40Z
updatedAt: 2026-11-06T21:44:40Z
```
# ADR: a replacement call names the cancelled call in CDM and on-chain; one replacement per cancelled call

For `flow-call-replacement` ([[task-csa-call-replacement]]), within the owner's choice of 2026-11-06 to link a corrected call to the call
it replaces (details are assumptions awaiting [[task-sme-call-cancellation-rules]], question 5):

- cdm-ext: `IssueCallInstruction.replacesCall` (optional) names the cancelled call's CDM identifier, and
  `MarginCallState.replacesCall` carries it through the fold. A call cannot name itself (condition
  `NotItsOwnReplacement`). `ReplacementAllowed(issue, replaced)` holds when the replaced call is the one named, is
  `Cancelled`, and has the same direction, pledgor and secured party. The check needs the other call's state, so it is
  a function the service runs before it publishes the step, not a condition inside one call's fold.
- Contract: a separate `issueReplacementCall` leaves `issueCall` and the `CallIssued` event unchanged, so existing event
  readers keep working; it emits `CallIssued` and then `CallReplaced(replacedCallId, callId)`. It requires the cancelled
  call to have the same caller, called party and kind (IM, VM or Return), and keeps one replacement per cancelled call
  (`replacementOf`, `replaces`).
- Service and console: the replacement keeps the cancelled call's kind and called party; only the amount is entered.

**Consequences.**
- The CDM fold of one call cannot tell whether a cancelled call already has a replacement; the ledger enforces it.
- A replacement can itself be cancelled and replaced, which gives a chain of links, one per call.
- The replacement is a new call with its own deadline and its own lifecycle; nothing from the cancelled call (response,
  proposals) carries over.
