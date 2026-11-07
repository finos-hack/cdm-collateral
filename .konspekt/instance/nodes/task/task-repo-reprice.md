```yaml
id: task-repo-reprice
type: task
title: Repo repricing
status: open
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-07T23:11:58Z
```
# Task: repo repricing

Row 4 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R8, score 5); the new price is an input and no transfer is generated.
- **Scope:** GMRA paragraph 4(i)(i): the repos are terminated and repriced at the current market value to eliminate the Net Exposure, through CDM's `Create_RepricePrimitiveInstruction`.
- **`cdm-ext`:** the new Purchase Price from the Net Exposure, and the cash transfer the reprice causes.
- **Prototype:** reprice as a way to settle a margin call; the cash difference settled on-chain; a live spec.

The details are decided when the task starts.
