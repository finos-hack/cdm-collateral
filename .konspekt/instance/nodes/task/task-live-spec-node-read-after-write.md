```yaml
id: task-live-spec-node-read-after-write
type: task
title: Make a party's service read a counterparty's new on-chain record only once its own node has the block
status: open
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
  contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.6
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-12T18:25:00Z
```
# Task: make a party's service read a counterparty's new on-chain record only once its own node has the block

Under [[goal-end-to-end-flow]], cross-cutting with [[task-live-spec-balance-aware-amounts]]. The project owner asked for
a dedicated task on 2026-11-12 (source `323cd915721b60bb6900bbb2d1774d669f8870ac`: "Yes, a dedicated task would be good").

**Observed.** In the full live run of [[task-triparty-reporting]] (2026-11-12, 47 of 48), `flow-settlement-netting`
failed once: right after BANK-A issued a margin call, BANK-B's service answered it and its gateway's `getCall` reverted
as for an unknown call (custom error `0x3c935374`), because BANK-B's node did not yet have the block BANK-A's node
had mined. The spec passed on its own straight after (41.2 s).

**To do.** Find where a service acts on a counterparty's record by id (calls, repos, terms, loans) as soon as it learns
the id, and make it wait for its own node to reach the block of the record (or retry an unknown-record revert for a
bounded time) before it reads; then confirm with repeated runs of the affected specs.
