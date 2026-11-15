```yaml
id: task-e2e-remaining-flows
type: task
title: Wire the four remaining CALM flows into the live stack, each with a live e2e test
status: resolved
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: ni:///sha-256;z4qwA40-Y54EmPO4WRezCnDdqzgYiNRfOsJfVtXDRj0
  timestamp: 2026-11-01T15:57:23Z
  confidence: 0.85
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: a0a131229621583bdc928c4ec7e06c59defc6b9b
    contentHash: a0a131229621583bdc928c4ec7e06c59defc6b9b
createdAt: 2026-11-01T15:57:23Z
updatedAt: 2026-11-03T17:30:00Z
```
# Task: wire the four remaining CALM flows into the live stack

Scope (a) from the 2026-11-01 coverage check (source excerpt): the four CALM flows in
`architecture/prototype.architecture.json` that have no live e2e test yet. Child of [[task-e2e-wiring]], which set
"all five flows" as its scope; only `flow-im-margin-call-pledge` is covered in `console/e2e/live.spec.ts` today.

| Flow | Present | Missing |
|---|---|---|
| `flow-return` | `CollateralControl.returnCollateral` / `returnByTransfer`; `POST /api/v1/calls/{id}/return` | live e2e test; check console wiring |
| `flow-default-enforcement` | `CollateralControl.enforce`; `OracleFeed.setDefault` | gateway and service routes, console action, live e2e test |
| `flow-oracle-update` | done 2026-11-03: oracle mock market data and price publishing, gateway price routes, live spec | — |
| `flow-revaluation-top-up` | done 2026-11-03: revaluation endpoint, operator console, top-up call from the secured party console, live spec | — |

Split agreed with the project owner on 2026-11-01: scope (b), `flow-return` and `flow-default-enforcement`, goes
to a Claude Code cloud session first. `flow-oracle-update` and `flow-revaluation-top-up` follow afterwards.

Revaluation top-up modelling, interim (project owner, 2026-11-01): the top-up is a **margin call**. The secured
party issues an ordinary IM call that then follows `flow-im-margin-call-pledge`, as the CALM flow description
already states. Final confirmation is with a business SME: [[task-revaluation-top-up-modelling]].

Done when each of the four flows has a live Playwright test in `console/e2e/live.spec.ts` that asserts on-chain
state through the gateway, and `e2e-live-stack.yml` passes with all of them running.

Re-parented on 2026-11-03 from [[task-e2e-wiring]] (resolved with a narrowed scope) to [[goal-end-to-end-flow]] by the project owner (source `2d89f9ce09676a084c6672f5a9ba1b887d6112c5`).

## State — 2026-11-03: where the next session starts

- Scope (b) is implemented on branch `origin/e2e-return-default` (cloud session, 2026-11-01, commits
  `2e0e130`..`2336c1e`; its notes are `nw-return-default-flows-wired` and `nw-live-spec-balance-depletion` on that
  branch, both proposed): gateway events and routes for return, enforce and default; a default-notice oracle service
  (`services/oracle`, 8100); the mkt gateway (8200) in the stack; console "Declare default & enforce"; live specs for
  `flow-return` and `flow-default-enforcement`. Not merged; never run in `e2e-live-stack.yml` or a codespace.
- A trial merge into the `e2e-wiring` line (now `main` at `09bb91a`, PR #10) conflicts only in the append-only
  konspekt logs (`changes/changed.md`, `commands/executed.md`, `edges/edges.md`, `transitions/transitions.md`;
  resolve by keeping both sides' rows); code merges cleanly.
- Next steps agreed with the project owner: branch from `main`, merge `origin/e2e-return-default`, add 8100 and 8200
  to `forwardPorts`, run unit tests (console, `mvn test` for collateral and oracle, gateway), run all four live specs
  in codespace `clean_try` over `gh codespace ssh`, open a PR. Then `flow-oracle-update` and
  `flow-revaluation-top-up`.
- Two local, unpushed commits on `e2e-wiring` (`6ac0121`, `481e5b3`) add a failure-only Besu-logs step to
  `e2e-live-stack.yml`. Pushing them needs the `workflow` scope on gh's token
  (`gh auth refresh -h github.com -s workflow`); carry them into the scope (b) PR. PR #10's first `live-stack` run
  failed with a deploy transaction never confirmed and passed on rerun; that step is to capture the cause next time.
- Proposed entities to disposition next session: this task, `artifact-react-console`, `artifact-e2e-runbook`,
  `task-revaluation-top-up-modelling`, `task-live-spec-balance-aware-amounts`.

## Progress — 2026-11-03

- Scope (b) merged in PR #11: `flow-return` and `flow-default-enforcement` have live specs that pass locally on
  Windows after `live-e2e.sh reset`.
- `flow-oracle-update` implemented on branch `flow-oracle-update`
  ([[wp-adr-oracle-prices-on-request-ratings-offchain]]): mock market data and price publishing in
  `services/oracle`, `POST /ledger/v1/oracle/prices` (operator gateway only) and `GET /ledger/v1/prices[/:token]` in
  the gateway, and a live spec. Oracle unit tests: 13 pass. Live: the new spec passes; a full `check` on the same
  chain then failed only `flow-vm-margin-call-transfer`, on pledgor balance depletion
  ([[task-live-spec-balance-aware-amounts]]).
- `flow-revaluation-top-up` implemented on branch `flow-revaluation-top-up`
  ([[wp-adr-revaluation-outstanding-im-from-calls]], [[nw-revaluation-top-up-excluded]]):
  - `GET /api/v1/revaluation` in the collateral service;
  - `GET /ledger/v1/settlement-history` in the gateway;
  - the operator console `#/live/operator`;
  - a revaluation card with a top-up button in the secured party console;
  - a live spec.
  Console vitest: 62 pass. After `reset`, all six live specs pass. On the used chain, one `flow-return` run read the
  two parties' CDM state hashes before both had folded the same steps, so the spec now polls until they match.
- CI runs the specs ([[wp-adr-ci-runs-live-specs]], PR #16): the `e2e-live-stack` run 41681112529 passed all six
  live specs on a fresh runner chain (3.4 min). Every "Done when" condition is met once PR #16 merges.
