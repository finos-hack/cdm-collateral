```yaml
id: task-gateway-receipt-poll
type: task
title: Stop the gateway waiting 4 s for each transaction receipt
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  contentHash: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  timestamp: 2026-11-07T18:54:12Z
  confidence: 0.75
createdAt: 2026-11-07T18:54:12Z
updatedAt: 2026-11-07T20:52:50Z
```
# Task: stop the gateway waiting 4 s for each transaction receipt

Split from [[task-live-spec-duration]] on the project owner's instruction (2026-11-07, "all three tasks"); the
evidence is in that task's findings.

The gateway's viem client has no `pollingInterval` (`gateway/src/besu.ts:394`) and its chain definition no `blockTime`
(`besu.ts:385`), so `send()` (`besu.ts:414`) waits on viem's default 4 s poll for every receipt, against a 2 s block
period. Set a short polling interval (for example 250 ms) or wait for receipts over the existing WebSocket client. No
chain reset. Expected: about 2.5 s less per transaction, 2–3 min of the live suite. Measure the suite before and after.

Accepted by the project owner on 2026-11-07 (source `fe94d24c8393576eafa827a5ced53840580becbe`: "1. accept the speed task").

**Built 2026-11-07** on branch `live-speed` (commit `1413a64`; source `ae1744d7ebd05addf2d84102c8c1dd7f4eecb5c2`: "start the speed tasks"):

- A 250 ms receipt poll (`GATEWAY_RECEIPT_POLL_MS`). One transaction through gateway A took 4.03-4.04 s (five
  samples) before and 0.9-2.1 s after; the 2 s block period is now the floor.
- The full live suite on a fresh contract set took 8.4 min before (first run on the `csa-reconciliation` set) and
  5.0 min after, 15/15. A first run after only the poll change took 4.3 min with one failure, below.
- The log scans read the chain head with `cacheTime: 0`. viem had cached the block number for one polling interval,
  so a fold could miss a step the contract already showed: the intermittent `flow-call-cancellation` CI failure
  ("Agreed" for a call cancelled on-chain) on main and on PRs since 2026-11-06, which the project owner reported on
  PR #37.
- Sends run one at a time per gateway with the next nonce tracked locally. With the short poll,
  `flow-agreement-amendment` failed once on "Nonce provided for the transaction is lower than the current nonce": the
  node's pending nonce right after a receipt was still the used one (inferred from the error, not reproduced).

The project owner resolved the task on 2026-11-07 (source `cf9a296128848aa5cdf9ffde53124e8bcd1672f4`: "3. yes"). The scan fix alone also went to PR #37
(commit `cb56fc6`, "1. a").
