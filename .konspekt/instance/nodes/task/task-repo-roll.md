```yaml
id: task-repo-roll
type: task
title: Repo roll
status: open
review: proposed
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-07T22:35:17Z
```
# Task: repo roll

Row 8 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R13, score 5).
- **Scope:** A repo rolled to a new Repurchase Date, through CDM's `Create_RollPrimitiveInstruction`, with the cash settled for the difference.
- **`cdm-ext`:** none expected.
- **Prototype:** the roll event and its cash settlement on-chain; a live spec.

The details are decided when the task starts.
