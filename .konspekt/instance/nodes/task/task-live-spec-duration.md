```yaml
id: task-live-spec-duration
type: task
title: Find out why each live spec takes 30 seconds to a minute
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: 844ed07f9135d9e47306d591ccfec3e236390623
  contentHash: 844ed07f9135d9e47306d591ccfec3e236390623
  timestamp: 2026-11-07T18:27:28Z
  confidence: 0.7
createdAt: 2026-11-07T18:27:28Z
updatedAt: 2026-11-07T18:32:00Z
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
