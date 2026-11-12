```yaml
id: task-live-spec-duration
type: task
title: Find out why each live spec takes 30 seconds to a minute
status: resolved
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: 844ed07f9135d9e47306d591ccfec3e236390623
  contentHash: 844ed07f9135d9e47306d591ccfec3e236390623
  timestamp: 2026-11-07T18:27:28Z
  confidence: 0.7
createdAt: 2026-11-07T18:27:28Z
updatedAt: 2026-11-12T00:00:26Z
```
# Task: find out why each live spec takes 30 seconds to a minute

Under [[goal-end-to-end-flow]], linked to [[task-ci-live-e2e-stack]]. The project owner asked on 2026-11-07 what takes
so long. On the 2026-11-07 local run of `console/e2e/live.spec.ts` the 14 specs took 7.6 minutes: 12 s
(`flow-oracle-update`) to 1.0 min (`flow-revaluation-top-up`), most 25–45 s. A run on a busier machine took 11.3
minutes. Known facts to start from:

- Besu QBFT block period is 2 s (`besu/qbftConfigFile.json`); each on-chain step waits at least one block for its
  receipt, and a flow has several sequential steps (issue, agree, propose, accept, pledge).
- The console refreshes on gateway events with a 10 s fallback poll (`console/src/components/LiveConsole.tsx`); a missed
  event costs up to 10 s per step.
- Specs run one at a time on the shared chain.

To do: time each step of two or three specs (UI action, gateway call, transaction mined, service fold, console
update), find where the time goes, and propose changes (for example a shorter block period for the test network,
fewer sequential transactions per flow, or waiting on events instead of polling). Record the findings here before
changing anything.

## Findings, 2026-11-07 (reviewed by the project owner, source `bd141dbb1d4a0af39adbee338b1c51f72f79914b`)

Three specs, each run once with Playwright `--trace on` plus a log of Besu blocks and SSE events. No code changed. On
this run, IM pledge took 1.1 min, substitution 2.2 min and revaluation top-up 1.5 min, slower than the baseline
above. Time by category (s, IM / substitution / revaluation): waiting for transaction receipts 24 / 40 / 56 (of which
the block wait is about 1 s a transaction); slow reads and console refresh about 25 / 78 / 20; settle processing
before the service passes the event on about 6 / 10 / 8; explicit sleeps 0. Specs never waited on the 10 s fallback poll.

1. **4 s receipt poll.** The gateway's viem client has no `pollingInterval` (`gateway/src/besu.ts:394`) and the chain
   definition has no `blockTime` (`besu.ts:385`), so viem polls every 4 s, and `send()` waits on that poll for each
   receipt (`besu.ts:414`). Every single-transaction POST took 4.04 s, and transactions sent back to back were mined
   exactly 4 s apart, although the block period is 2 s.
2. **Slow reads.** Every gateway read rescans `eth_getLogs` from the deploy block in 4000-block windows
   (`besu.ts:691-829`). Service endpoints chain several scans plus one gateway call per item (`App.java:583`, `660`,
   `1560`): idle, `/substitutions` takes 4.3 s and `/revaluation` 3.4 s. The console fires 8 GETs per refresh
   (`LiveConsole.tsx:55-66`), against Chrome's 6 connections per host, one of them held by SSE. In substitution, 19 s
   passed between the consent event reaching service A and A's Settle button appearing.
3. **Fold before relay.** The service folds a settlement into CDM (`App.java:134-150`) before forwarding the event
   to the console, so SettleCall reached the console 3.5–8.3 s after the chain event.

Inferred, not verified: each 4000 blocks of chain age (about 2.2 h) adds an `eth_getLogs` call to every scan, which
may explain the slower run. Candidate changes (estimated savings): a 250 ms receipt poll or receipts over WebSocket
(about 2.5 s a transaction, 2–3 min of the suite); an incremental log index in the gateway (most of the read time);
one console refresh in flight at a time; relay first, then fold (3–8 s a settlement); a 1 s block period, worth it
only after the receipt poll is fixed, and it needs a chain reset. The raw traces are outside the repo, in this
session's scratchpad.

The project owner resolved the task on 2026-11-11 (source `9331a6a4b0aafc5103c06651a1a61309c35e4f3e`: "4. b"): of its three parts, [[task-gateway-receipt-poll]] and [[task-live-read-latency]] are resolved; the deferred [[task-test-chain-block-period]] carries the rest.
