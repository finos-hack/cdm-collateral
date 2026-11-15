```yaml
id: task-repo-adjustment
type: task
title: Repo adjustment
status: resolved
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: ni:///sha-256;STJirKt2MoMm9lBaaCwnSam9QDrdl3_syYsofLZjtpE
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
    contentHash: 43bd267adffbb70e3a740c20620deed96d966092
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-08T19:31:43Z
```
# Task: repo adjustment

Row 5 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R8, score 5); the new quantity is an input and no transfer is generated.
- **Scope:** GMRA paragraph 4(i)(ii): the securities quantity of a repo is changed to eliminate the Net Exposure, through CDM's `Create_AdjustmentPrimitiveInstruction`.
- **`cdm-ext`:** the new quantity from the Net Exposure, and the securities transfer the adjustment causes.
- **Prototype:** adjustment as a way to settle a margin call; the securities difference settled on-chain; a live spec.

The details are decided when the task starts.

**Design chosen 2026-11-08** (source `0dd1cef601500b689fcd3ce949a69d1c02f9647d`), recorded in [[wp-adr-repo-adjustment]] (proposed).
