```yaml
id: task-live-flow-checkout-script
type: task
title: Run the live flows automatically from a checkout script against a running stack
status: open
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 63a74d22e99006def5aa9c99394ffb01ca95f605
  contentHash: 63a74d22e99006def5aa9c99394ffb01ca95f605
  timestamp: 2026-11-01T16:22:08Z
  confidence: 0.75
createdAt: 2026-11-01T16:22:08Z
updatedAt: 2026-11-01T16:22:08Z
```
# Task: run the live flows automatically as a checkout script

Requested by the project owner on 2026-11-01. For now the live flows stay manual: they are driven by hand in
the console, as [[wp-adr-live-stack-local-ui-driven]] decided, and `e2e-live-stack.yml` checks only that the
stack starts and is healthy ([[task-ci-live-e2e-stack]]). This task adds a checkout script that runs the live
flows automatically against a stack that is already running: the Playwright live specs in
`console/e2e/live.spec.ts` with `E2E_REQUIRE_STACK=1`, so that a down stack fails the run.

Open: whether this is a subcommand of `scripts/live-e2e.sh` (next to `build`, `up`, `status`, `down`) or a separate
script; how it reports per-flow results; and whether CI later calls it, which would revise the ADR. Covers every
flow with a live spec, including those added under [[task-e2e-remaining-flows]].
