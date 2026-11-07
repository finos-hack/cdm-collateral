```yaml
id: task-live-read-latency
type: task
title: Cut the read latency of the live stack: log scans, console refresh and event relay
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  contentHash: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  timestamp: 2026-11-07T18:54:12Z
  confidence: 0.75
createdAt: 2026-11-07T18:54:12Z
updatedAt: 2026-11-07T21:14:36Z
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

Accepted by the project owner on 2026-11-07 (source `fe94d24c8393576eafa827a5ced53840580becbe`: "1. accept the speed task").

**Built 2026-11-07** on branch `live-speed` (commit `8a44f91`; source `cf9a296128848aa5cdf9ffde53124e8bcd1672f4`: "5. go ahead"):

1. **Log index.** One in-memory index per contract in the gateway, extended on each read by the blocks mined since the
   last read, in place of the rescans from the deploy block. It catches up on read; the task text said to extend it
   from the WebSocket subscription, and catching up on read gives the same bound on read cost without depending on
   the socket. Mined receipts are cached, and concurrent reads reach Besu as JSON-RPC batches. In the service, `/state`
   reads proposals in parallel and `/interest` caches each verified statement by hash.
2. **Console refresh.** One refresh in flight; requests that arrive meanwhile are merged into one more pass. The pledgor
   no longer requests the revaluation panel. Unit test `task-live-read-latency` in `LiveConsole.test.tsx`.
3. **Event relay.** The service records an event, signals the consoles, then runs the slow folds (SettleCall,
   SubstitutionSettled) on the fold executor and signals again when they finish.

Measured on a fresh contract set (about 1,000 blocks old), median of three idle reads: `/substitutions` 1.2 s to
0.1 s, `/interest` 1.3-1.4 s to 0.03 s, `/nettings` 0.28 s to 0.05 s, `/state` 1.0 s to 0.47 s, gateway `party-calls`
0.46 s to 0.11 s. The full live suite took 5.2 min (15/15) against 5.0 min after [[task-gateway-receipt-poll]]: at this
chain age block waits and UI steps dominate the suite. The old reads grew with chain age (3-4 s on an older contract
set in the timing study); the new ones read only the blocks since the last read.

The project owner resolved the task on 2026-11-07 (source `1f18f384e0b534a4a82dd24e1d9303362296d64e`: "1. yes").
