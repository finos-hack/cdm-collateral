# Standards and specifications for collateral management

Output of `task-collateral-standards-inventory` (goal `goal-data-cdm-taxonomies-specs`).

- **Purpose:** list the standards and specifications a CDM-based implementation of collateral management should be
  aware of, and record whether CDM uses each one.
- **CDM version checked:** release `7.6.0`, commit `f685b4b45d8faa419425c018a52af66f40e43c0b`, by searching
  `rosetta-source/src/main/rosetta` for each standard's name, ISO number and identifier.
- **Status:** first pass. Descriptions of external standards come from web sources listed at the end, not from the
  standards' own texts. Rows marked *(to verify)* rest on a single secondary source.

**CDM use** values: **modelled** — CDM types, enums or functions represent the standard's content;
**referenced** — named as an identifier scheme, enum value or `docReference` only; **ingest only** — appears only in
the FpML ingestion mappings; **none** — no reference found.

## 1. Identifiers and codes (ISO)

| Standard | Covers in collateral | CDM use | Evidence in CDM |
|---|---|---|---|
| ISO 17442 LEI | Parties, issuers, custodians, agents | referenced | `PartyIdentifierTypeEnum.LEI` — "The ISO 17442:2012 Legal Entity Identifier" (`base-staticdata-party-enum.rosetta`) |
| ISO 9362 BIC | Parties and settlement agents; messaging addresses | referenced (ISO number cited only in ingestion) | `PartyIdentifierTypeEnum.BIC`; FpML scheme `iso9362` mapped in `ingest-fpml-confirmation-other-func.rosetta` |
| ISO 6166 ISIN | Collateral securities | referenced | `AssetIdTypeEnum.ISIN` |
| ISO 10962 CFI | Asset classification for eligibility | referenced | Taxonomy source `CFI` — "Represents the ISO 10962 Classification of Financial Instruments code" |
| ISO 10383 MIC | Listing venue (eligibility criterion `ListingExchange`) | referenced | `PartyIdentifierTypeEnum.MIC` — "The ISO 10383 Market Identifier Code" |
| ISO 4217 | Currency of cash collateral, base currency, thresholds | modelled | Cited in 6 files, e.g. `legaldocumentation-csa-type.rosetta` |
| ISO 3166 | Country of issuer / asset origin (eligibility criteria) | modelled | `IssuerCountryOfOrigin`, `AssetCountryOfOrigin`; cited in 3 files |
| ISO 8601 | Dates and times (valuation, notification, transfer timing) | modelled | Cited in `base-datetime-type.rosetta` and 2 other files |
| ISO 23897 UTI | Trades in the netting set; repo and securities lending transactions | referenced (ISO number not cited) | `TradeIdentifierTypeEnum.UniqueTransactionIdentifier` |
| ISO 4914 UPI | Product identification of trades in the netting set | referenced (ISO number cited only in ingestion) | `AssetIdTypeEnum.UPI`; FpML scheme `iso4914` in ingestion |
| ISO 24165 DTI | Tokenised collateral and tokenised cash | none | Open CDM issue [#3995](https://github.com/finos/common-domain-model/issues/3995) proposes adding DTI |
| ISO 18774 FISN | Short instrument names in collateral schedules and statements | none | — |
| ISO 20275 ELF | Legal form of issuers (issuer-type criteria) | none | — |
| ISO 13616 IBAN | Cash collateral accounts | none | — |

## 2. Messaging standards for the collateral lifecycle

| Standard | Covers | CDM use | Notes |
|---|---|---|---|
| ISO 20022 collateral management messages (`colr`) | Margin call request (colr.003) and response (colr.004), cancellation (colr.005/006), collateral proposal and response (colr.007/008), dispute notification (colr.009), substitution request (colr.010), plus triparty messages | none | No ISO 20022 reference in CDM. These messages define the steps that CDM models only as data types (finding F2 in the CSA matrix) |
| ISO 15022 (MT527, MT558, MT569) | Triparty collateral instructions, status and statements | none | Being replaced by ISO 20022; AMI-SeCo proposed discontinuing ISO 15022 for SCoRE in 2028–2030 *(to verify)* |
| FpML collateral processes (`fpml-collateral-processes`, reporting view) | `requestMargin`, `marginCallStatus`, `requestCollateralAcceptance`, `collateralProposalStatus`, `requestSubstitution`, `substitutionStatus` | none | CDM ingests FpML **confirmations** only (all `ingest-fpml-confirmation-*` files); no FpML collateral message is mapped |
| ISDA Standards for the Electronic Exchange of OTC Derivative Margin Calls (2009) | Message sequence, content and timing for margin calls, interest and substitution | none | Source of the FpML collateral messages |
| SCoRE — Single Collateral Management Rulebook for Europe (ECB AMI-SeCo) | Harmonised triparty collateral management, corporate actions on debt instruments and billing, all using ISO 20022. Margin call harmonisation is listed as work in progress | none | Relevant to triparty (see `task-cdm-collateral-other-agreements`) |

## 3. Legal documentation

| Standard | CDM use | Evidence |
|---|---|---|
| ISDA Master Agreement (1992, 2002) | modelled | `legaldocumentation-master-isda-type.rosetta` |
| ISDA credit support documents: 1994 NY CSA, 1995 English CSA and CSD, 2016 VM CSA, 2016/2018 IM CSA and CSD, 2019 CTA and Security Agreement | modelled, with 31 sample documents | `legaldocumentation-csa-*.rosetta`; see `cdm-csa-coverage-matrix.md` |
| ISDA Collateral Asset Definitions | modelled (2003 edition) | `CollateralAssetDefinitionsEnum` with `docReference ISDA CollateralAssetDefinitions_2003` |
| ICMA GMRA | modelled | `legaldocumentation-master-icma-type.rosetta` (`GlobalMasterRepoAgreement`) |
| ISLA GMSLA | modelled | `legaldocumentation-master-isla-*.rosetta` |

## 4. Calculation methodologies

| Standard | CDM use | Evidence / notes |
|---|---|---|
| ISDA SIMM | referenced (elections and a result field only) | `GeneralSimmElections`, `SimmVersion`, `MarginCallExposure.simmIMExposure`. SIMM is licensed by ISDA |
| ISDA CRIF (Common Risk Interchange Format) — the sensitivity input to SIMM | none | *(to verify against ISDA documentation)* |
| BCBS-IOSCO standardised IM schedule | modelled with functions | `margin-schedule-func.rosetta` (`BuildStandardizedSchedule`, `GetGrossInitialMarginFromStandardizedSchedule`) |

## 5. Regulation

| Standard | Covers in collateral | CDM use | Evidence |
|---|---|---|---|
| BCBS-IOSCO Margin requirements for non-centrally cleared derivatives | Global framework for VM/IM exchange, eligible collateral, haircuts, segregation | referenced indirectly | Through the national regimes below and the standardised schedule |
| EU EMIR and its margin RTS | Margin rules; eligible collateral classes | referenced | `RegulatoryRegimeEnum.EMIR_MarginRules`; `EU_EMIR_EligibleCollateralEnum` (types A, B, C …); `AssetIdTypeEnum.EMIR` — "EMIR Article 9 Asset Definition Identifier" |
| UK EMIR | As EU EMIR | referenced | `UnitedKingdomMarginRules`; `UK_EMIR_EligibleCollateralAssetClass` |
| US CFTC and US prudential margin rules | Margin rules; eligible collateral | referenced | `CFTC_MarginRules`, `US_PrudentialMarginRules`, `SEC_MarginRules`; `US_CFTC_PR_EligibleCollateralAssetClass` |
| Other national margin regimes (Australia, Canada, Hong Kong, Japan, Singapore, Switzerland, Brazil) | Margin rules | referenced | `RegulatoryRegimeEnum` in `legaldocumentation-csa-enum.rosetta` |
| EU Financial Collateral Directive (2002/47/EC) | Legal basis for title-transfer and security collateral arrangements in the EU | none | — |
| EU SFTR | Reporting of repo and securities lending transactions and their collateral | none | Regulatory reporting is maintained outside this repository |
| EMIR / CFTC trade reporting of margin | Reporting of collateral exchanged on derivatives | none in this repository | As above |

## 6. Model and serialisation

| Standard | CDM use | Notes |
|---|---|---|
| Rune DSL | The language CDM is written in | 7.6.0 updates the DSL to 10.13.1 (commit message of `f685b4b`) |
| CDM serialisation standard | Applies to all sample data | Open issue [#5261](https://github.com/finos/common-domain-model/issues/5261) to update the collateral examples to it |

## Findings

**S1 — CDM has no mapping to either collateral message standard.** ISO 20022 `colr` and the FpML collateral
processes both define margin call, response, dispute, proposal and substitution messages. CDM ingests only FpML
confirmations and has no ISO 20022 reference. These are the same lifecycle steps that CDM models only as data types
(finding F2), so a mapping from CDM's `MarginCallIssuance` / `MarginCallResponse` to `colr.003` / `colr.004` and to
FpML `requestMargin` is the most direct way to check and complete those types.

**S2 — ISO identifiers are supported but cited inconsistently.** LEI, ISIN, CFI and MIC name their ISO standard.
BIC, UPI and UTI appear without the ISO number (BIC and UPI are tied to ISO numbers only in the FpML ingestion
mappings). DTI, FISN, ELF and IBAN are absent. DTI matters for tokenised collateral, which is an open CDM topic
(#3995, #4956).

**S3 — Regulatory eligibility taxonomies are present; legal and reporting regimes are not.** CDM encodes EU EMIR,
UK EMIR and US CFTC/prudential eligible-collateral classes and the margin regimes elected in IM documents. The
Financial Collateral Directive and SFTR have no reference.

**S4 — The ISDA Collateral Asset Definitions are the 2003 edition.** Check whether a later edition exists before
relying on these codes.

## Sources

- [iotafinance: ISO 20022 colr.004 Margin Call Response](https://www.iotafinance.com/en/SWIFT-ISO20022-Message-colr-004-001-Margin-Call-Response.html)
- [iotafinance: ISO 20022 colr.009 Margin Call Dispute Notification](https://iotafinance.com/en/SWIFT-ISO20022-Message-colr-009-001-Margin-Call-Dispute-Notification.html)
- [iotafinance: ISO 20022 colr.008 Collateral Proposal Response](https://www.iotafinance.com/en/SWIFT-ISO20022-Message-colr-008-001-Collateral-Proposal-Response.html)
- [iotafinance: ISO 20022 colr.005 Collateral Management Cancellation Request](https://www.iotafinance.com/en/SWIFT-ISO20022-Message-colr-005-001-Collateral-Management-Cancellation-Request.html)
- [ECB: SWIFT ISO 20022 messaging solutions (CMH-TF, 2018)](https://www.ecb.europa.eu/paym/groups/shared/docs/b45a7-cmh-tf-2018-01-16-presentation-swift-iso-20022-messaging-solutions-and-messages-creation-and-maintenance.pdf)
- [ISDA: Standards for the Electronic Exchange of OTC Derivative Margin Calls](https://www.isda.org/a/D0iDE/electronic-messaging.pdf)
- [FpML 5 messaging framework](https://cdn.fpml.org/docs/FpML5-messaging-framework.pdf)
- [FpML schema fpml-collateral-processes-5-3.xsd](https://www.fpml.org/spec/fpml-5-3-2-wd-2/html/reporting/schemaDocumentation/schemas/fpml-collateral-processes-5-3_xsd/schema-overview.html)
- [ECB: SCoRE](https://www.ecb.europa.eu/paym/collateral/score/html/index.en.html)
- [ECB: FAQs on collateral management harmonisation](https://ECB.eu/paym/integration/collateral/faq/html/index.en.html)
- [ECB AMI-SeCo: Triparty collateral management standards (2021)](https://ECB.eu/paym/intro/publications/pdf/ecb.amiseco202106_tripartycollateralmanagement.en.pdf)
- [ECB AMI-SeCo: proposed migration strategy to ISO 20022 for SCoRE (2023)](https://ECB.eu/paym/groups/shared/docs/617df-ami-seco-2023-06-16-item-5b-proposal-for-ami-seco-migration-strategy-to-iso-20022-for-score.pdf)
