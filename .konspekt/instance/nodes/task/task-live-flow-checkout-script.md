```yaml
id: task-live-flow-checkout-script
type: task
title: Run the live flows automatically from a checkout script against a running stack
status: resolved
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 63a74d22e99006def5aa9c99394ffb01ca95f605
  contentHash: 63a74d22e99006def5aa9c99394ffb01ca95f605
  timestamp: 2026-11-01T16:22:08Z
  confidence: 0.75
createdAt: 2026-11-01T16:22:08Z
updatedAt: 2026-11-01T22:01:07Z
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

## Progress (2026-11-01)

The three open questions, settled in the plan the project owner approved on 2026-11-01:
- **Where:** a `check` subcommand of `scripts/live-e2e.sh`.
- **Reporting:** Playwright's list reporter, one line per flow (each live spec is named after its flow id), exit code
  passed through.
- **CI:** not called from CI; [[wp-adr-live-stack-local-ui-driven]] stands.

`check` fails at once if the stack is not up, installs Playwright's Chromium if absent, and runs
`console/e2e/live.spec.ts` with `E2E_REQUIRE_STACK=1` against the console on 5173 (`E2E_BASE_URL` overrides it);
extra arguments go to Playwright. Verified on the Windows host (`docs/runbook-e2e.md` section 10): the down-stack
failure, argument passthrough and exit code work. On that long-lived chain `flow-vm-margin-call-transfer` failed
because the pledgor's free tUSD (4,185,000) is below the VM test's per-run amount (up to 9,999,000). That is test
data running out; this task does not fix it. Not run: `check` inside the dev container (Chromium there may need OS
packages).


## Resolution (2026-11-01)

Accepted and resolved by the project owner after the Windows-host verification above. Two things were outside this
task when it was resolved: the live specs running the pledgor's balances out on a long-lived chain
([[task-live-spec-balance-aware-amounts]]), and running `check` inside the dev container.
