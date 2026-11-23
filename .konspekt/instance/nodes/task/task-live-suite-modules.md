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
updatedAt: 2026-11-23T00:25:00Z
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

Measured 2026-11-23, run 45086004091 (`e2e-live-stack` on `ci-live-modules`, a temporary `push` trigger since
removed): all 57 specs passed. The six module jobs started within one second of each other, so the concurrent job
limit did not delay them. Wall-clock time from the build job's start to the last module's end: 14.5 minutes. The build
job took 2.0 minutes. In every module job, bring-up (`live-e2e.sh up`) took 4.0 minutes. Spec time per module:
`repo-trade` 7.9, `gmsla` 7.3, `repo-events` 5.9, `csa` 5.2, `triparty` 4.4 and `ccp` 4.4 minutes (35.1 minutes in
total). The jobs together used about 64 runner minutes, against about 45 for the former single job. The extra minutes
come from the six bring-ups.

Decided 2026-11-23 (project owner, source `kc6PK3Vh5H0SIfpHt1oha9Qi_ZpyEwImUZuIQd0jads`): no further rebalancing ("I don;t think we need to
rebalance futher"); the workflow stays on demand only ("4. still manual"); the task is resolved once the PR is merged.

Done when the branch is merged to `main`.
