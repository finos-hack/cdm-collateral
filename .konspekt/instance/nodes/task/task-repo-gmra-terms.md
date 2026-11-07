```yaml
id: task-repo-gmra-terms
type: task
title: GMRA agreement terms and their amendment
status: open
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-07T23:46:22Z
```
# Task: gMRA agreement terms and their amendment

Row 1 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** empty `GlobalMasterRepoAgreement` (R1, score 1: G20); no GMRA terms amendment (R2, score 0: G19).
- **Scope:** The Annex I elections the ten workflows read: Margin Ratio basis, minimum transfer amount, margin transfer method, Net Margin interest, the income payment rule, the default valuation terms. Amendment of these terms between the pair, the same way the CSA amendment works.
- **`cdm-ext`:** a GMRA terms type and an amendment event over it.
- **Prototype:** the pair's GMRA terms held by both services, the terms hash on-chain, amendment proposed and agreed as in `flow-agreement-amendment`; a live spec.

The details are decided when the task starts.

**Design chosen 2026-11-07** (source `9146674da13957a4cd21ae92f51ab6ebc712c90c`: "1. a 2. a 3. a 4. a 5. a"), recorded
in [[wp-adr-repo-gmra-terms]] (proposed).

Built on branch `repo-gmra-terms` (2026-11-07): cdm-ext `cdmx.collateral.gmra` (`GmraTerms`, `GmraElections`,
`GmraTermsAmendment`, `Create_GmraTermsAmendment`, `Qualify_GmraTermsChange`; 7 tests), `CollateralControl`
`proposeTermsAmendment` and `decideTermsAmendment` (3 tests), the gateway routes and events, the service fold in
`CdmGmra` with `/gmra/terms` and `/gmra/amendments` (4 tests), the console "GMRA terms" card (2 tests) and the live spec
`flow-repo-gmra-terms`. All 17 live specs pass on a new contract set (the previous deployment is kept as
`besu.pre-gmra-terms.json`).

Two differences from the ADR as written: `GmraTerms` holds CDM's `LegalAgreementBase`, not `LegalAgreement`, with the
Party1 and Party2 roles beside it (CDM's `LegalAgreement` requires `agreementTerms`, whose GMRA election block has no
attributes and does not survive serialisation when empty). Net Margin interest names USD-SOFR; the oracle does not
publish a rate yet.
