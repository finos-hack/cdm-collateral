```yaml
id: task-gateway-receipt-poll
type: task
title: Stop the gateway waiting 4 s for each transaction receipt
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  contentHash: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  timestamp: 2026-11-07T18:54:12Z
  confidence: 0.75
createdAt: 2026-11-07T18:54:12Z
updatedAt: 2026-11-07T18:54:12Z
```
# Task: stop the gateway waiting 4 s for each transaction receipt

Split from [[task-live-spec-duration]] on the project owner's instruction (2026-11-07, "all three tasks"); the
evidence is in that task's findings.

The gateway's viem client has no `pollingInterval` (`gateway/src/besu.ts:394`) and its chain definition no `blockTime`
(`besu.ts:385`), so `send()` (`besu.ts:414`) waits on viem's default 4 s poll for every receipt, against a 2 s block
period. Set a short polling interval (for example 250 ms) or wait for receipts over the existing WebSocket client. No
chain reset. Expected: about 2.5 s less per transaction, 2–3 min of the live suite. Measure the suite before and after.
