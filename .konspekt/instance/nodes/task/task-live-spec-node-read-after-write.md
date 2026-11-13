```yaml
id: task-live-spec-node-read-after-write
type: task
title: Make a party's service read a counterparty's new on-chain record only once its own node has the block
status: resolved
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
  contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.6
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-12T21:30:00Z
```
# Task: make a party's service read a counterparty's new on-chain record only once its own node has the block

Under [[goal-end-to-end-flow]], cross-cutting with [[task-live-spec-balance-aware-amounts]]. The project owner asked for
a dedicated task on 2026-11-12 (source `323cd915721b60bb6900bbb2d1774d669f8870ac`: "Yes, a dedicated task would be good").

**Observed.** In the full live run of [[task-triparty-reporting]] (2026-11-12, 47 of 48), `flow-settlement-netting`
failed once: right after BANK-A issued a margin call, BANK-B's service answered it and its gateway's `getCall` reverted
as for an unknown call (custom error `0x3c935374`), because BANK-B's node did not yet have the block BANK-A's node
had mined. The spec passed on its own straight after (41.2 s).

**Observed again** in the full live run of [[task-ccp-membership]] (2026-11-12, 47 of 49, with the fifth node `ccp`
running): `flow-repo-reprice` (the first spec of that name) failed when BANK-B's service affirmed a repo BANK-A had
just booked ("repo … is not booked"), and `flow-gmsla-marking` failed when BANK-A's service delivered a loan BANK-B had
just affirmed ("loan … is not affirmed"). Both specs passed on their own straight after (1.1 min, 57.8 s). Whether the
fifth node's load raises the rate is not known: one run is not enough to compare.

**To do.** Find where a service acts on a counterparty's record by id (calls, repos, terms, loans) as soon as it learns
the id, and make it wait for its own node to reach the block of the record (or retry an unknown-record revert for a
bounded time) before it reads; then confirm with repeated runs of the affected specs.

**Fixed 2026-11-12** (the project owner chose "fix now" on 2026-11-12, source
`ed13c2c2260ce411f1846f9cda1127297ac063bf`). The gateway handles every request but `/ledger/v1/health` only once its
node has the highest block any node in the registry has announced (`BesuAdapter.catchUpWithPeers`). It subscribes to
new heads on every node over WebSocket (`eth_subscribe newHeads`) and keeps the highest; a request waits only while its
own node is below that head, polling every 25 ms for at most 10 s, and makes no RPC call otherwise. A service's read,
and a write whose gas estimate reads the record, then see a record the other party has just written on its own node.
The fix is in the gateway, so every service route and fold gets it without a change to the services.

- **Residual window.** The writer's node pushes its new head to this gateway at the same time as it answers the
  writer's receipt poll; the reader's request travels the writer's gateway, the writer's service and the reader's
  service first. That ordering held in the runs below; it is not guaranteed.
- **First design, replaced.** Asking every peer for `eth_blockNumber` on each request added 10 to 20 ms a request; the
  services call the gateway in sequence, so the cost added up. Measured on a 2-CPU runner where services A and B use
  about 40% CPU each folding the chain history, so spec times also depend on chain length; compare runs on a fresh chain.
- **Verified.** The three affected specs (`flow-settlement-netting`, both `flow-repo-reprice`, `flow-gmsla-marking`)
  passed three times each in one run (12 of 12) with the first design. With the subscription design the full live
  suite passed 49 of 49 on a fresh chain in 30.5 min (30.7 min for the run before the fix).
