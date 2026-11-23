```yaml
id: task-live-suite-modules
type: task
title: Split the live suite into modules that run on their own stacks
status: open
review: accepted
provenance:
  conversationId: live-suite-modules
  sourceRef: ni:///sha-256;GRkTUKGNjCeVEe7hf28ZFA5epuRvXl3cMIJGVauf7cw
  timestamp: 2026-11-22T23:56:25Z
  confidence: 0.9
createdAt: 2026-11-22T23:56:25Z
updatedAt: 2026-11-22T23:56:25Z
```
# Task: split the live suite into modules that run on their own stacks

Under [[goal-end-to-end-flow]], linked to [[task-ci-live-e2e-stack]] and [[task-ci-actions-minutes]]. The 57 live specs
were one file, `console/e2e/live.spec.ts` (about 5,000 lines), run one after another on one chain; a full run takes
about 40 minutes. The project owner said on 2026-11-22 that 40 minutes is too long, that the GitHub Actions minutes
limit comes from the GitHub plan and does not change the choice, that bring-up takes a fraction of the run, that the
repo module is to be split further if possible, and that a CI run is to show whether the runners start at the same
time (source `GRkTUKGNjCeVEe7hf28ZFA5epuRvXl3cMIJGVauf7cw`: "40 min is too long", "4. if possible - yes", "3. run the
test and find out?").

Built on branch `ci-live-modules`:

- `console/e2e/live/harness.ts` holds every helper, constant and view type of the former file, unchanged and exported,
  and `liveStackGate()`, which registers the stack gate (`E2E_REQUIRE_STACK`) in each spec file.
- One spec file per module, the specs in their former order: `csa` (18: the CSA margin cycle, call lifecycle,
  amendment, allocation, reconciliation, two-way IM, registered tMMF, provenance), `repo-trade` (9: GMRA terms,
  purchase and repurchase, margin maintenance, reprice, adjustment, substitution), `repo-events` (9: income, roll,
  pair-off, buy/sell-back, default close-out), `gmsla` (9), `triparty` (7) and `ccp` (5). Specs that act on every open
  repo or loan of the pair stay in the module that opens them.
- `scripts/live-e2e.sh check [module...]` runs the named modules, or all, with `--workers=1`: the files share one chain
  and the test parties locally.
- `e2e-live-stack.yml`: a build job compiles the two service jars once and uploads them; a matrix job per module
  (`fail-fast: false`) downloads them, brings up its own stack and runs only that module. The `modules` input of
  `workflow_dispatch` selects a subset.

Done when a CI run passes every module, the per-module job times are recorded here, and the modules are rebalanced if
one module's time is far above the others.
