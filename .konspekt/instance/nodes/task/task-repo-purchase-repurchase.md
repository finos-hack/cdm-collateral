```yaml
id: task-repo-purchase-repurchase
type: task
title: Repo purchase and repurchase settled delivery versus payment
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
# Task: repo purchase and repurchase settled delivery versus payment

Row 2 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** Purchase Price and Repurchase Price computed (R6, score 3: no sample exercises it); repurchase transfer and term events usable (R10 score 4, R13 score 5).
- **Scope:** A repo between A and B, either party as seller: the CDM `TradeState` from CDM's repo samples, held by both services off-chain; the purchase on the Purchase Date and the repurchase on the Repurchase Date, each settled on-chain as securities against tUSD in one transaction.
- **`cdm-ext`:** checks that CDM's Purchase and Repurchase Price follow from the trade, if CDM's functions need it.
- **Prototype:** a delivery-versus-payment settlement for the purchase and the repurchase, the trade event hashes on-chain; a live spec.

The details are decided when the task starts.
