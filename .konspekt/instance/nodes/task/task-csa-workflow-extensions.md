```yaml
id: task-csa-workflow-extensions
type: task
title: Implement the ISDA CSA workflows that have no prototype flow yet
status: resolved
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: ni:///sha-256;Hz-Wy1LX7MxZHrtHdKdGAvW6iIBnWud1M1UwzNVDAys
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
    contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-07T21:18:31Z
```
# Task: implement the ISDA CSA workflows that have no prototype flow yet

Section B of the workflow map (`docs/analysis/cdm-workflow-task-map.md`), from
[[investigation-cdm-workflow-task-map]]. Build order set by the project owner on 2026-11-03: the CSA cycle first, then
the other agreement families. This task is the CSA part that the prototype does not cover yet:

1. close-out netting on default (G15);
2. substitution (G16, D5);
3. interest on cash collateral (G17);
4. amendment of agreement terms;
5. margin call cancellation (no coverage-matrix row);
6. settlement netting (no gap ID);
7. collateral allocation and optimisation (G34);
8. reconciliation (G35): first decide whether it is in scope (business case §8 item 3).

Each workflow needs the CDM side (the gap closed in `cdm-ext`, as [[task-cdm-gap-closure]] does for the margin call
lifecycle), a flow in `architecture/prototype.architecture.json`, the contracts, gateway, services and console
steps, and a live spec. Work starts after the rest of the core cycle ([[nw-core-cycle-first]]); the order of the
list above is set in [[nw-csa-extension-order]]. Splitting this task into one task per workflow is still open.

## State — pickup for 2026-11-04 (written 2026-11-04T03:18:25Z)

The project owner set the next session's work (2026-11-03): continue the ISDA CSA cycle here, before the other
agreement families of the task map's section C (repo, lending, triparty, CCP). Order follows the task map sections
(`docs/analysis/cdm-workflow-task-map.md`), not the gap register's priority column.

Where things stand:
- Section A of the task map is done except two-way initial margin (`task-two-way-initial-margin`, open). All six
  live specs pass locally on 2026-11-04, including `flow-oracle-update` and `flow-revaluation-top-up`.
- Rows 1 and 2 above have their CDM side in `cdm-ext` for the CSA (G15 close-out under the ISDA 2002 MA, G16 CSA
  substitution; [[task-cdm-gap-closure]]) but no prototype flow, contract, gateway, service, console step or live
  spec yet.
- Rows 3 to 8 have neither side yet. Row 3 (interest on cash collateral, G17) is the first with no CDM work done.
- G25 (ledger anchors) is done: PR #23 merged; PR #24 (service and gateway anchors, resolution of
  `task-g25-ledger-anchor-redesign`) waits for merge.

Open at pickup:
1. Check that PR #24 is merged; branch from `main`. The owner first named the branch `P2`; confirm the name now
   that the scope is CSA section B.
2. Decide where to start: the prototype flows for rows 1 and 2 (their CDM side exists), or row 3 (G17), which
   needs its CDM side first.
3. Update the task map: section A shows `flow-oracle-update` and `flow-revaluation-top-up` as unbuilt with no
   live spec (stale since PR #11), and section B rows 1 and 2 do not show their CDM side.
4. Still open from before: splitting this task into one task per workflow.

## Progress 2026-11-06T13:19:22Z

- Split into one task per workflow on the project owner's instruction ("yes, a task per flow"):
  [[task-csa-close-out-netting]], [[task-csa-substitution]], [[task-csa-interest-on-cash]], [[task-csa-amendment]],
  [[task-csa-call-cancellation]], [[task-csa-settlement-netting]], [[task-csa-allocation]],
  [[task-csa-reconciliation]] (each `review: proposed`). This task stays open as their parent.
- PR #24 merged; work continues on branch `P2` from `main` at `d2ad03b`. The owner chose to build rows 1 and 2 first
  (G15 close-out, G16 substitution), whose CDM side exists, and to update the task map on `P2`.

## Section B closed 2026-11-07

All eight rows are built, with a live spec each, and merged: close-out netting and substitution (#25), interest on
cash (#26), amendment (#27), cancellation (#28) and replacement (#32), settlement netting (#35), allocation (#36),
reconciliation (#37); every row task is resolved. The project owner resolved this task (source `fd15e5535b198d08fc024585cf53a29c2edc27ec`: "Go ahead and
resolve the parent. Close section B."). Still open on their own: [[task-csa-allocation-optimisation]] (cost-based
basket, a follow-up to row 7) and the SME confirmations of the rules each row assumed.
