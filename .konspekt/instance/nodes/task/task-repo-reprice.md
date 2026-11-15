```yaml
id: task-repo-reprice
type: task
title: Repo repricing
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
updatedAt: 2026-11-08T17:11:10Z
```
# Task: repo repricing

Row 4 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R8, score 5); the new price is an input and no transfer is generated.
- **Scope:** GMRA paragraph 4(i)(i): the repos are terminated and repriced at the current market value to eliminate the Net Exposure, through CDM's `Create_RepricePrimitiveInstruction`.
- **`cdm-ext`:** the new Purchase Price from the Net Exposure, and the cash transfer the reprice causes.
- **Prototype:** reprice as a way to settle a margin call; the cash difference settled on-chain; a live spec.

The details are decided when the task starts.

**Design chosen 2026-11-08** (source `729ada99275ed710b1515fb8acc6de27fa1df799`), recorded in [[wp-adr-repo-reprice]] (proposed).
