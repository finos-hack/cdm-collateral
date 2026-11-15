```yaml
id: task-gmsla-terms
type: task
title: GMSLA agreement terms and their amendment
status: resolved
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: ni:///sha-256;mBNipe_OTzILvGu_nKDYEPI14bTpkrfNnQ3FVFVSwmM
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
    contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T17:44:30Z
```
# Task: GMSLA agreement terms and their amendment

Row 12 of section C of the workflow map, split from [[task-securities-lending-gmsla-workflows]] within
[[wp-adr-securities-lending-gmsla-scope]] (accepted 2026-11-11; the project owner's choices of 2026-11-11).

- **CDM status:** empty for the prototype's needs: `GlobalMasterSecuritiesLendingAgreement` holds collateral, Base Currency and Events of Default elections (S1, score 2: G21); no GMSLA terms amendment (S2, score 2).
- **Scope:** The elections the lending workflows read: Base Currency, the collateral elections (aggregation under paragraph 5.4, netting of collateral deliveries), the rebate and fee terms, the recall notice terms and the default elections. Amendment of these terms between the pair, as the CSA and GMRA terms amendments work.
- **`cdm-ext`:** a GMSLA terms type (with CDM's `GlobalMasterSecuritiesLendingAgreement` where it fits) and an amendment event over it.
- **Prototype:** the pair's GMSLA terms held by both services, the terms hash on-chain, amendment proposed and agreed as in `flow-agreement-amendment`; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's loans.

**CDM check, 2026-11-11** (a temporary test that built the pair's GMSLA as a CDM `LegalAgreement`):

- `LegalAgreement` → `agreementTerms` → `agreement` → `masterAgreementElections` → `islaGmsla` holds CDM's
  `GlobalMasterSecuritiesLendingAgreement`: the collateral elections (standard Market Value, aggregation under paragraph
  5.4, netting of deliveries under 5.6, the failure-to-redeliver indemnity under 6.4, the notification time), the Base
  Currency and each party's Events of Default elections (automatic early termination). A GMSLA 2010 (publisher `ISLA`,
  master agreement type `GMSLA`, English law) between BANK-A as Party1 and BANK-B as Party2 passes CDM validation and
  round-trips through JSON unchanged. Unlike the GMRA (`wp-adr-repo-gmra-terms`), no `cdm-ext` wrapper is needed for the
  agreement itself.
- `StandardMarketCondition` rejects a non-standard Market Value without its definition.
- `AgreementVerification` does not tie these elections to the agreement type (defect D28).
- Amendment: `Create_AgreementTermsChange` returns nothing for a GMSLA; `AgreementTermsChangeInstruction` carries CSA
  elections only (S2).
- CDM's type has no minimum transfer amount, default margin, or rebate and fee terms. In CDM the margin, the rebate or
  fee rate and the recall terms (`RecallProvision`) sit on each loan.
- On-chain: `CollateralControl`'s terms amendment chain is keyed by agreement kind and unordered pair
  (`wp-adr-repo-gmra-terms`), so a GMSLA chain needs no contract change.

**Design chosen 2026-11-11** (source `0993e4fa3e595a8c5ff438c2ddcfc242e6a1bc95`: "1a 2a 3a 4a 5a"), recorded in [[wp-adr-gmsla-terms]] (accepted 2026-11-11); the
baseline elections are questions for an SME in [[task-sme-gmsla-terms-baseline]].

**Built 2026-11-11.** `cdmx.collateral.gmsla`: `GmslaTerms` (CDM's `LegalAgreement` unchanged, with
`GmslaPrototypeElections`; conditions `IsGmsla`, `BothRoles`, `InBaseCurrency`), `GmslaTermsAmendment`,
`ChangedGmslaElections`, `Qualify_GmslaTermsChange`, `Create_GmslaTermsAmendment` and `GmslaMinimumTransferAmountFor`,
with `GmslaTermsTest` (6 tests). Found in the build: Rune treats two absent values as different under `<>`, so the
non-standard Market Value comparison checks for presence first. Service: `CdmGmsla` and `GET /gmsla/terms`,
`POST /gmsla/amendments`, `POST /gmsla/amendments/{id}/decision` (`CdmGmslaTest`, 4 tests); the gateway's terms
amendment routes take the kind already, and `CollateralControl` is unchanged. Console: "GMSLA terms" card (2 unit
tests). Live spec `flow-gmsla-terms` passes locally, and all 35 live specs pass.

**Resolved 2026-11-11**: PR #59 merged (source `f62bbce51dcdcbfd3e7c7e68bdea07af64d6873a`).
