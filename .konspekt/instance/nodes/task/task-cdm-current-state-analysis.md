```yaml
id: task-cdm-current-state-analysis
type: task
title: CDM current state analysis
status: open
review: accepted
provenance:
  conversationId: cdm-data-taxonomy
  sourceRef: c06f71f1e33136d841554b3edcac893f013a932a
  contentHash: c06f71f1e33136d841554b3edcac893f013a932a
  timestamp: 2026-10-15T12:24:36Z
createdAt: 2026-10-15T12:24:36Z
updatedAt: 2026-10-15T12:32:58Z
```
# Task: CDM current state analysis

Analyse the current state of the Common Domain Model as the data foundation for
`goal-data-cdm-taxonomies-specs`.

CDM code source: the Rosetta (Rune DSL) model at
https://github.com/finos/common-domain-model/tree/master/rosetta-source/src/main/rosetta
(branch `master`).

CDM version: release `7.6.0`, commit `f685b4b45d8faa419425c018a52af66f40e43c0b`
(2026-10-09). First-pass scope: ISDA credit support documents (legacy CSA/CSD,
VM CSA, IM CSA/CSD, CTA, Security Agreement); other agreement families are
`task-cdm-collateral-other-agreements`.

## Method

Approved by the human on 2026-10-15 (source `e4b447e13cef62282de0670bc02b310467ef5d04`).

1. Build a reference capability map of collateral management independently of
   CDM: lifecycle capabilities × agreement families.
2. Score each cell on an evidence ladder: 0 absent, 1 enums/descriptions only,
   2 data types, 3 functions, 4 business events / primitive instructions,
   5 sample data or tests in the CDM repository.
3. Cite file and type/function at the pinned commit for every score.
4. Weight rows by the needs of `goal-end-to-end-flow`.
5. Cross-check against CDM release notes and Collateral Working Group scope.

Output: `artifact-cdm-csa-coverage-matrix`.
