```yaml
id: goal-tokenized-collateral
type: goal
title: Tokenized collateral represented as it exists on the ledger
status: active
review: accepted
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;zMz4c0RLlkKvHZJaqJm9O9mYoExmGssJv5XXBjuc76Q
  timestamp: 2026-11-20T19:51:36Z
  confidence: 0.85
createdAt: 2026-11-20T19:51:36Z
updatedAt: 2026-11-20T20:06:53Z
```
# Tokenized collateral represented as it exists on the ledger

The CDM extension and the prototype represent a tokenized collateral asset as it exists on its ledger: its security
identifier (ISIN or CUSIP), its ISO 24165 DTI where one exists, its network, token contract and token standard, and
which record is legally authoritative. Settlement and enforcement respect that authoritative record. The requirement is
[[concept-asr-onchain-asset-identity]].

Standalone goal (project owner, 2026-11-20). The work that contributes to it stays where it is and is linked here, not
decomposed:

- G24 token identity and G25 ledger anchors, under [[task-cdm-gap-closure]]: closed, proposed for review
  (`cdmx.collateral.ledger`, `LedgerTest`).
- [[task-sme-registered-asset-completion]]: when a pledge or title transfer of a Registered or Claim asset is complete.
  Open.
- [[task-blockchain-smart-contracts-applicability]]: where the requirement came from (findings B1, B5; standards
  finding S2). Resolved.

Decomposed into (2026-11-20):

- [[task-authoritative-record-settlement-enforcement]]: settlement (G4) and enforcement (G14) treat a mined on-chain
  transfer as complete for every asset; they do not yet depend on `AuthoritativeRecordEnum`.
- [[task-dti-format-check]]: the DTI format is not checked (Rune has no pattern match).
- [[task-second-ledger-token-identity]]: only Besu is represented; a second ledger (DTCC also runs Canton) would test
  that the identity model is ledger-neutral.
