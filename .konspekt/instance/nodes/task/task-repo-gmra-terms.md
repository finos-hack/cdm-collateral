```yaml
id: task-repo-gmra-terms
type: task
title: GMRA agreement terms and their amendment
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
# Task: gMRA agreement terms and their amendment

Row 1 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** empty `GlobalMasterRepoAgreement` (R1, score 1: G20); no GMRA terms amendment (R2, score 0: G19).
- **Scope:** The Annex I elections the ten workflows read: Margin Ratio basis, minimum transfer amount, margin transfer method, Net Margin interest, the income payment rule, the default valuation terms. Amendment of these terms between the pair, the same way the CSA amendment works.
- **`cdm-ext`:** a GMRA terms type and an amendment event over it.
- **Prototype:** the pair's GMRA terms held by both services, the terms hash on-chain, amendment proposed and agreed as in `flow-agreement-amendment`; a live spec.

The details are decided when the task starts.
