```yaml
id: task-dti-format-check
type: task
title: Check the format of a token's ISO 24165 DTI
status: open
review: proposed
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ
  timestamp: 2026-11-20T20:06:53Z
  confidence: 0.75
createdAt: 2026-11-20T20:06:53Z
updatedAt: 2026-11-20T20:06:53Z
```
# Task: check the format of a token's ISO 24165 DTI

Under [[goal-tokenized-collateral]]. `TokenizedAsset` in `cdmx.collateral.ledger` (G24, [[task-cdm-gap-closure]])
holds the DTI as an unchecked string, because Rune has no pattern match. A malformed DTI passes validation today.

To decide: where the check runs (a Java validator beside the generated code, at ingestion in the collateral service,
or both), and which rules it applies (length, character set, check character), taken from the ISO 24165 text and
not from memory.

Done when a malformed DTI is rejected with a stated reason and a test covers valid and invalid values.
