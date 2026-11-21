```yaml
id: task-dti-format-check
type: task
title: Check the format of a token's ISO 24165 DTI
status: open
review: accepted
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ
  timestamp: 2026-11-20T20:06:53Z
  confidence: 0.75
createdAt: 2026-11-20T20:06:53Z
updatedAt: 2026-11-21T17:59:11Z
```
# Task: check the format of a token's ISO 24165 DTI

Under [[goal-tokenized-collateral]]. `TokenizedAsset` in `cdmx.collateral.ledger` (G24, [[task-cdm-gap-closure]])
holds the DTI as an unchecked string, because Rune has no pattern match. A malformed DTI passes validation today.

To decide: where the check runs (a Java validator beside the generated code, at ingestion in the collateral service,
or both), and which rules it applies (length, character set, check character), taken from the ISO 24165 text and
not from memory.

Done when a malformed DTI is rejected with a stated reason and a test covers valid and invalid values.

## Progress (2026-11-21)

Rune does have a pattern match: `string(pattern: "...")` on a `typeAlias`, used by CDM 7.7.0 itself
(`ESMAIndexName`). So the check runs in the model, where every `TokenizedAsset` is validated:
`cdmx.collateral.ledger.DigitalTokenIdentifier`. The collateral service builds no `TokenizedAsset`, so there is no
separate ingestion check.

Rules, from the DTIF's DTI Implementation Guide 2.0 and DTI FAQ: nine characters, an eight-character base number and a
check character "computed using the method specified in Annex A of ISO standard 24165"; the base number excludes
A, E, I, O, U and Y; a DTI does not start with zero. Annex A is not available, so the check character's value is not
verified, only that it is a digit or an upper-case letter. Upper case only is an assumption.

`LedgerTest`: published DTIs pass (X9J9K872S, WGHBLG826); wrong length, a vowel or Y, a leading zero, lower case and a
symbol are rejected, the failure naming `dti` and the value.
