```yaml
id: task-ci-live-e2e-stack
type: task
title: Run the live e2e flows in CI against a full backend stack
status: open
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: f7db748fb298ba32f7c8171c31c9c9009bf8ce0d
  contentHash: f7db748fb298ba32f7c8171c31c9c9009bf8ce0d
  timestamp: 2026-10-25T01:56:01Z
  confidence: 0.8
createdAt: 2026-10-25T01:56:01Z
updatedAt: 2026-10-25T01:56:01Z
```
# Task: run the live e2e flows in CI against a full backend stack

The live Playwright flows in `console/e2e/live.spec.ts` ([[artifact-e2e-live-harness]])
drive the real stack (collateral services → ledger gateways → Besu). CI's `console`
workflow starts only the console, so the flows are currently skipped there by a
service-health guard (commit `b317dfc`); CI coverage of the console relies on the
self-contained mock scenario specs (`scenarios.spec.ts`).

Stand up the full stack in CI so the live flows actually run:

- Start the Besu QBFT network (the `besu/` docker compose).
- Deploy the contracts (`npm run deploy:besu` in `contracts/`).
- Build the collateral service jar (JDK 21) and bring up the stack (`orchestrate.mjs`:
  store + two gateways + two services), which also provisions the store bearer tokens.
- Run `test:e2e` with the stack reachable; the health guard then runs the flows instead
  of skipping them.

This is a heavier CI job (containers, contract deploy, Java build) than the current
console-only workflow — likely a separate workflow or job rather than an addition to
`console.yml`. Deferred; not part of the first end-to-end cycle ([[nw-e2e-first-cycle-scope]],
[[task-e2e-wiring]]).
