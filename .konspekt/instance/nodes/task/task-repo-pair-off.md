```yaml
id: task-repo-pair-off
type: task
title: Repo pair-off
status: open
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-10T23:09:02Z
```
# Task: repo pair-off

Row 9 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R13, score 5); a trade event, not netting of collateral movements (R22).
- **Scope:** Offsetting repos between the pair closed against each other, through CDM's `Create_PairOffInstruction`, with one net settlement.
- **`cdm-ext`:** none expected.
- **Prototype:** the pair-off event and its net settlement on-chain; a live spec.

The details are decided when the task starts.

**Check for gap G30 (defect D7) when the task starts:** CDM's repo qualification accepts one `InterestRatePayout` only. Run a
temporary test over the pair-off: count the payouts and evaluate CDM's qualification function on each resulting trade.
Record the result in the G30 row of `docs/analysis/cdm-workflow-task-map.md` (checked on 2026-11-10 for the repo events of `CdmRepo` built through row C8).
