```yaml
id: task-gmsla-terms
type: task
title: GMSLA agreement terms and their amendment
status: open
review: proposed
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:11:27Z
```
# Task: GMSLA agreement terms and their amendment

Row 12 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** empty for the prototype's needs: `GlobalMasterSecuritiesLendingAgreement` holds collateral, Base Currency and Events of Default elections (S1, score 2: G21); no GMSLA terms amendment (S2, score 2).
- **Scope:** The elections the lending workflows read: Base Currency, the collateral elections (aggregation under paragraph 5.4, netting of collateral deliveries), the rebate and fee terms, the recall notice terms and the default elections. Amendment of these terms between the pair, as the CSA and GMRA terms amendments work.
- **`cdm-ext`:** a GMSLA terms type (with CDM's `GlobalMasterSecuritiesLendingAgreement` where it fits) and an amendment event over it.
- **Prototype:** the pair's GMSLA terms held by both services, the terms hash on-chain, amendment proposed and agreed as in `flow-agreement-amendment`; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.
