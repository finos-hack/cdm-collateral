```yaml
id: task-gmsla-terms
type: task
title: GMSLA agreement terms and their amendment
status: open
review: accepted
provenance:
  conversationId: securities-lending-gmsla-scope
  sourceRef: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  contentHash: 58c01e3dad7c97cb870c00fde33af78f4201e5dd
  timestamp: 2026-11-11T15:11:27Z
  confidence: 0.6
createdAt: 2026-11-11T15:11:27Z
updatedAt: 2026-11-11T15:18:59Z
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
