```yaml
id: task-repo-margin-maintenance
type: task
title: Repo margin maintenance: Net Exposure and margin transfer
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
# Task: repo margin maintenance: Net Exposure and margin transfer

Row 3 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** no Transaction or Net Exposure (R6, R7, R21: G12); margin ratio inverted (defect D2).
- **Scope:** GMRA paragraph 4: Transaction Exposure per repo and Net Exposure across all the pair's repos in both directions; a margin call once it passes the minimum transfer amount; settlement by outright title transfer of cash or securities through the `MarginCall` contract and the VM path, or by reprice or adjustment chosen per call.
- **`cdm-ext`:** Transaction Exposure and Net Exposure functions; D2 corrected, with tests.
- **Prototype:** a margin call from the party with the Net Exposure, settled by title transfer; a live spec.

The details are decided when the task starts.
