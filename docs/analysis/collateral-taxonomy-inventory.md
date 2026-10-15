# Taxonomies in collateral data

Output of `task-collateral-taxonomy-inventory` (goal `goal-data-cdm-taxonomies-specs`). Companion to
[`collateral-standards-inventory.md`](collateral-standards-inventory.md), which lists the standards; this document
lists the classification schemes (taxonomies and code lists) that collateral data is classified by, and how CDM
represents each.

- **CDM version:** release `7.6.0`, commit `f685b4b`. Evidence is from `rosetta-source/src/main/rosetta` and the
  bundled code lists in `rosetta-source/src/main/resources/codelist/json` (229 files).
- **Status:** first pass. Value counts were extracted with a script; definitions were read for the eligibility
  criteria types, `CreditNotation` and `CheckAgencyRating`.

**How CDM represents a taxonomy** — four forms appear:

| Form | Meaning | Example |
|---|---|---|
| **closed enum** | Values are fixed in the model; a new value needs a model release | `EU_EMIR_EligibleCollateralEnum` |
| **open string + scheme** | Free text, optionally tagged with the scheme it comes from (`[metadata scheme]`) | `ListingSector.sector` |
| **FpML coding scheme** | A string validated against a bundled FpML code list (`typeAlias … FpMLCodingScheme(domain: …)`) | `CreditRatingAgency` |
| **absent** | No representation found | — |

## 1. Asset classification

| Taxonomy | Used for | External source | CDM representation | Values |
|---|---|---|---|---|
| Asset type | Eligibility criterion `AssetType` | CDM's own | closed enum `AssetTypeEnum` | 7 (Security, Cash, Commodity, ListedDerivative, Loan, LetterOfCredit, Other) |
| Security type | `AssetType.securityType` | CDM's own | closed enum `SecurityTypeEnum` | 5 (Debt, Equity, Fund, Warrant, Certificate) |
| Debt characteristics | `AssetType.debtType` | CDM's own | `DebtEconomics`: closed enums for seniority (3), interest, principal; types for secured debt and redemption | — |
| Equity type | `AssetType.equityType` | CDM's own | closed enum `EquityTypeEnum` | 4 |
| Fund type | `AssetType.fundType` | CDM's own | closed enum `FundProductTypeEnum` | 4 |
| Asset types not enumerated | `AssetType.otherAssetType` | — | open string | — |
| Collateral type | Cash vs non-cash on a trade | CDM's own | closed enum `CollateralTypeEnum` | 3 (Cash, NonCash, CashPool) |
| ISO 10962 CFI | Eligibility criterion `CollateralTaxonomy` | ISO | open string, source `TaxonomySourceEnum.CFI` | — |
| ISDA Collateral Asset Definitions (2003) | Naming eligible collateral in CSAs (e.g. `US-TBILL`) | ISDA | closed enum `CollateralAssetDefinitionsEnum` | 178. The bundled FpML code list `collateral-asset-definitions-1-0.json` is not referenced by the model |
| ISDA product taxonomy | Classifying the trades being collateralised | ISDA | `TaxonomySourceEnum.ISDA` with string value | — |

## 2. Regulatory eligible-collateral classes

| Taxonomy | CDM representation | Values |
|---|---|---|
| EU EMIR eligible collateral (margin RTS) | closed enum `EU_EMIR_EligibleCollateralEnum`, via `CollateralTaxonomyValue` | 18 (types A …) |
| UK EMIR eligible collateral | closed enum `UK_EMIR_EligibleCollateralEnum` | 18 |
| US CFTC / prudential eligible collateral | closed enum `US_CFTC_PR_EligibleCollateralEnum` | 13 |
| EMIR Article 9 asset definitions, CFTC, MAS, Canadian CSA | `TaxonomySourceEnum` value with open string (`nonEnumeratedTaxonomyValue`) | — |
| Margin regime applying to an IM agreement | closed enum `RegulatoryRegimeEnum` | 15 |

## 3. Issuer and guarantor types

| Taxonomy | CDM representation | Values |
|---|---|---|
| Issuer / guarantor entity type | closed enum `CollateralEntityTypeEnum` | 7 (SupraNational, SovereignCentralBank, QuasiGovernment, RegionalGovernment, Corporate, Fund, SpecialPurposeVehicle) |
| Supranational sub-type | closed enum `SupraNationalIssuerTypeEnum` | 2 (InternationalOrganisation, MultilateralBank) |
| Quasi-government and regional government | booleans `sovereignEntity`, `sovereignRecourse` | — |
| SPV | `CreditRiskEnum` (tranched / untranched) | — |
| Entity classification code lists (FpML `entity-type`, `entity-classification`, `cftc-entity-classification`) | bundled; `entity-type` not referenced by the model | — |
| ISO 20275 ELF (legal form) | absent (see standards finding S2) | — |

## 4. Credit ratings

| Taxonomy | CDM representation | Values |
|---|---|---|
| Rating agency | closed enum `CreditRatingAgencyEnum` and FpML coding scheme `credit-rating-agency` | 8 (AMBest, CBRS, DBRS, Fitch, Japanagency, Moodys, RatingAndInvestmentInformation, StandardAndPoors) |
| Rating notation (e.g. `A-`, `Baa2`) | open string `CreditNotation.notation` ("FpML doesn't specify a default scheme") | — |
| Rating scale (short term, long term) | open string `CreditNotation.scale` | — |
| Outlook, credit watch | closed enums `CreditRatingOutlookEnum`, `CreditRatingCreditWatchEnum` | — |
| Rule for several ratings | closed enum `CreditNotationMismatchResolutionEnum` | 6 (Lowest, Highest, ReferenceAgency, Average, SecondBest, Other) |
| Minimum / maximum boundary | closed enum `CreditNotationBoundaryEnum` | 2 |
| Rating order and mapping across agencies (credit quality steps) | absent *(name search for `CreditQualityStep`, `CQS`)* | — |

## 5. Geography, currency, maturity

| Taxonomy | CDM representation | Values |
|---|---|---|
| Country (issuer, asset origin) | closed enum `ISOCountryCodeEnum` (ISO 3166) | 249 |
| Currency | `CurrencyCodeEnum` (ISO 4217); `DomesticCurrencyIssued` criterion | — |
| Maturity basis | closed enum `MaturityTypeEnum` + `PeriodRange` | 3 (RemainingMaturity, OriginalMaturity, FromIssuance) |

## 6. Sector and index

| Taxonomy | CDM representation | Values |
|---|---|---|
| Industry sector (GICS, NAICS and others) | open string + scheme, `ListingSector.sector`; the description names GICS and NAICS | — |
| Regulatory corporate sector (EMIR Refit) | bundled code lists `regulatory-corporate-sector-1-2.json`, `esma-emir-refit-regulatory-corporate-sector-1-0.json` | — |
| Equity index membership | closed enum `CollateralEquityIndexEnum` | 342 |
| Listing venue | MIC (ISO 10383) via `ListingExchange` | — |

## 7. Limits

| Taxonomy | CDM representation | Values |
|---|---|---|
| Concentration limit basis | closed enum `ConcentrationLimitTypeEnum` | 9 (Asset, BaseCurrencyEquivalent, Issuer, PrimaryExchange, IndustrySector, UltimateParentInstitution, IssueOutstandingAmount, MarketCapitalisation, OutstandingBalance) |

## 8. Margin and collateral process

| Taxonomy | CDM representation | Values |
|---|---|---|
| Margin type | closed enums `CollateralMarginTypeEnum` (VariationMargin, InitialMargin) and `RegMarginTypeEnum` (VM, RegIM, NonRegIM) | 2, 3 |
| IM role | closed enum `RegIMRoleEnum` | 2 (Pledgor, Secured) |
| Call type | closed enum `CallTypeEnum` | 3 (MarginCall, Notification, ExpectedCall) |
| Call response | closed enum `MarginCallResponseTypeEnum` | 3 (AgreeinFull, PartiallyAgree, Dispute) |
| Call action | closed enum `MarginCallActionEnum` | 2 (Delivery, Return) |
| Collateral status | closed enum `CollateralStatusEnum` | 3 (FullAmount, SettledAmount, InTransitAmount) |
| Haircut indicator | closed enum `HaircutIndicatorEnum` | 2 |
| Interest handling | closed enum `CollateralInterestHandlingEnum` | 3 |
| Valuation scope | closed enum `ValuationScopeEnum` | 2 (Collateral, Trade) |
| Reason codes for margin call responses, disputes, substitutions, interest responses and retractions | bundled FpML code lists `collateral-margin-call-response-reason`, `collateral-dispute-resolution-method-reason`, `collateral-substitution-response-reason`, `collateral-interest-response-reason`, `collateral-retraction-reason`, `collateral-response-reason`; **none is referenced by the model** | — |

## 9. Lifecycle events and parties

| Taxonomy | CDM representation | Values |
|---|---|---|
| Business event intent | closed enum `EventIntentEnum` | 23; none for a margin call, collateral transfer or substitution |
| Position event intent | closed enum `PositionEventIntentEnum` | 7 |
| Unscheduled transfer type | closed enum `UnscheduledTransferEnum` | 11 (Recall, Return, …) |
| Event qualification | `Qualify_*` functions | none for a margin call (finding F2) |
| Party roles in collateral | closed enum `PartyRoleEnum` (56 values) | collateral-relevant: Pledgor, SecuredParty, Chargor, Lender, Borrower, AgentLender, Custodian, ThirdPartyCustodian, TripartyAgent, ClearingOrganization, ClearingFirm, ClearingClient, MarginAffiliate, SettlementAgent |
| Account type | closed enum `AccountTypeEnum` | 3 (House, Client, AggregateClient) |

## Findings

**TX1 — Three representation styles are mixed.** Regulatory classes, CDM's asset hierarchy and 342 equity indices
are closed enums; sector, rating notation and CFI are open strings; only the rating agency uses the FpML coding scheme
mechanism (`typeAlias CreditRatingAgency`), which validates a value against a bundled code list. Closed enums need a
model release to change; open strings cannot be validated.

**TX2 — The FpML collateral reason code lists are bundled but not used.** Six collateral code lists (margin call
response, dispute resolution, substitution response, interest response, retraction and generic response reasons) are
in `resources/codelist/json`, but no `typeAlias` or attribute refers to them. They belong to the FpML collateral
processes that CDM does not map (findings F2 and S1). The same applies to `collateral-asset-definitions`,
`collateral-type`, `collateral-arrangement` and `collateralized-exposure-grouping`.

**TX3 — Credit ratings have no scale or order.** `CreditNotation.notation` and `.scale` are free strings, and no type
orders ratings or maps them across agencies (no credit quality steps). `CheckAgencyRating`
(`product-collateral-func.rosetta`) compares the notation by string equality and does not use
`CreditNotationBoundaryEnum` or `CreditNotationMismatchResolutionEnum`. A criterion such as "minimum A- from S&P or
A3 from Moody's" can be represented but not evaluated.

**TX4 — Parallel asset taxonomies without a mapping.** An eligible asset can be described by CDM's `AssetType`
hierarchy, by ISDA Collateral Asset Definitions (178 codes), by EMIR / CFTC classes, or by CFI. CDM has no mapping
between them, so the same eligibility schedule can be written in several incompatible ways.

**TX5 — Event and process taxonomies stop where the lifecycle model stops.** `EventIntentEnum` and the `Qualify_*`
functions have no margin call, collateral transfer or collateral substitution entry for agreements outside
securities finance, consistent with F2.
