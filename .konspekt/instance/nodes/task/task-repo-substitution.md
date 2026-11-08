```yaml
id: task-repo-substitution
type: task
title: Repo substitution of purchased securities
status: open
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-08T19:59:37Z
```
# Task: repo substitution of purchased securities

Row 6 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R11, score 5).
- **Scope:** GMRA paragraph 8: the seller substitutes equivalent securities for the purchased securities with the buyer's agreement, through CDM's substitution instruction.
- **`cdm-ext`:** the checks around CDM's substitution (eligibility, value) where CDM has none.
- **Prototype:** request, agreement and settlement of a substitution on-chain, as in `flow-substitution`; a live spec.

The details are decided when the task starts.

**Design chosen 2026-11-08** (source `1f591034dc560e55251b72785553d524701abbf3`), recorded in [[wp-adr-repo-substitution]] (proposed).
