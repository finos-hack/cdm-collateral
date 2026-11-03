```yaml
id: task-repo-gmra-workflows
type: task
title: Implement the repo (GMRA) collateral workflows
status: open
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.75
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-03T15:18:20Z
```
# Task: implement the repo (GMRA) collateral workflows

Section C of the workflow map (`docs/analysis/cdm-workflow-task-map.md`), from [[investigation-cdm-workflow-task-map]]. Starts after the ISDA CSA cycle
([[task-csa-workflow-extensions]]), per the build order the project owner set on 2026-11-03; the order among the four
agreement families is set in [[nw-agreement-family-order]] (business case §8 item 2).

Workflows in the analysis for repo (GMRA): terms, margin maintenance, reprice, adjustment, roll, repurchase, pair-off, buy/sell-back, substitution, income. Main CDM gaps: G20 (agreement terms), G12 (net exposure, inverted margin ratio), G33 (buy/sell-back qualification only), G19 (amendment). Scope per workflow, prototype flows and live specs are
to be defined when this task starts.
