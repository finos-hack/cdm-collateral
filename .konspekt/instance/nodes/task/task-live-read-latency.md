```yaml
id: task-live-read-latency
type: task
title: Cut the read latency of the live stack: log scans, console refresh and event relay
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
# Task: cut the read latency of the live stack

Split from [[task-live-spec-duration]] on the project owner's instruction (2026-11-07, "all three tasks"); the
evidence is in that task's findings.

Three changes, measured before and after:

1. **Log index.** Each gateway read rescans `eth_getLogs` from the deploy block in 4000-block windows
   (`besu.ts:691-829`), and service endpoints chain scans with one gateway call per item (`App.java:583`, `660`,
   `1560`). Keep an incremental index in the gateway, extended from the WebSocket subscription, so a read no longer
   grows with chain age.
2. **Console refresh.** `LiveConsole.tsx:55-66` fires 8 GETs per refresh with no guard against overlap. Keep one
   refresh in flight, drop stale results, and fetch only the panels shown.
3. **Event relay.** The service folds a settlement into CDM before relaying the event (`App.java:134-150`). Relay first,
   then fold, so the console sees settlements 3–8 s sooner.
