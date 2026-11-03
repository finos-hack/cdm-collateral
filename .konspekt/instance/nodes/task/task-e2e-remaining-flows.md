```yaml
id: task-e2e-remaining-flows
type: task
title: Wire the four remaining CALM flows into the live stack, each with a live e2e test
status: open
review: proposed
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: a0a131229621583bdc928c4ec7e06c59defc6b9b
  contentHash: a0a131229621583bdc928c4ec7e06c59defc6b9b
  timestamp: 2026-11-01T15:57:23Z
  confidence: 0.85
createdAt: 2026-11-01T15:57:23Z
updatedAt: 2026-11-03T03:25:20Z
```
# Task: wire the four remaining CALM flows into the live stack

Scope (a) from the 2026-11-01 coverage check (source excerpt): the four CALM flows in
`architecture/prototype.architecture.json` that have no live e2e test yet. Child of [[task-e2e-wiring]], which set
"all five flows" as its scope; only `flow-im-margin-call-pledge` is covered in `console/e2e/live.spec.ts` today.

| Flow | Present | Missing |
|---|---|---|
| `flow-return` | `CollateralControl.returnCollateral` / `returnByTransfer`; `POST /api/v1/calls/{id}/return` | live e2e test; check console wiring |
| `flow-default-enforcement` | `CollateralControl.enforce`; `OracleFeed.setDefault` | gateway and service routes, console action, live e2e test |
| `flow-oracle-update` | `OracleFeed.publishPrice` | Java oracle service + mock market data (layer 3 of [[task-e2e-wiring]]), live e2e test |
| `flow-revaluation-top-up` | nothing | revaluation, top-up call, live e2e test; depends on `flow-oracle-update` |

Split agreed with the project owner on 2026-11-01: scope (b), `flow-return` and `flow-default-enforcement`, goes
to a Claude Code cloud session first. `flow-oracle-update` and `flow-revaluation-top-up` follow afterwards.

Revaluation top-up modelling, interim (project owner, 2026-11-01): the top-up is a **margin call**. The secured
party issues an ordinary IM call that then follows `flow-im-margin-call-pledge`, as the CALM flow description
already states. Final confirmation is with a business SME: [[task-revaluation-top-up-modelling]].

Done when each of the four flows has a live Playwright test in `console/e2e/live.spec.ts` that asserts on-chain
state through the gateway, and `e2e-live-stack.yml` passes with all of them running.

Re-parented on 2026-11-03 from [[task-e2e-wiring]] (resolved with a narrowed scope) to [[goal-end-to-end-flow]] by the project owner (source `2d89f9ce09676a084c6672f5a9ba1b887d6112c5`).
