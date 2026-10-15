# Mapping between the four asset taxonomies for eligible collateral

Part of `task-collateral-taxonomy-inventory` (finding TX4). An eligible asset can be classified in four ways in CDM
7.6.0 (commit `f685b4b`). This table puts them side by side by asset category:

1. **CDM criteria** — CDM's own hierarchy `AssetType` (`AssetTypeEnum` → `SecurityTypeEnum` → debt / equity / fund
   types) combined with the issuer criterion `CollateralIssuerType` and, where needed, other criteria (`IndexType`,
   `AssetAgencyRating`, `IssuerCountryOfOrigin`). `AssetType` alone does not say who issued the asset.
2. **ISDA Collateral Asset Definitions** (2003 edition) — `CollateralAssetDefinitionsEnum`, 178 country-specific
   codes such as `US-TBILL`. Examples only; the full list is in `rosetta/legaldocumentation-csa-enum.rosetta`.
3. **Regulatory classes** — EU EMIR and UK EMIR (`…TypeA`–`…TypeR`, same letters with the same meaning, UK versions
   refer to UK issuers) and US CFTC / prudential (`US_CFTC_PRType1`–`10`).
4. **ISO 10962 CFI** — category and group (first two letters). CDM holds CFI only as a string under
   `TaxonomySourceEnum.CFI`. *The CFI groups below come from ISO 10962 as known to the author, not from the
   standard's text; verify before use.*

## Mapping

| # | Asset category | CDM criteria | ISDA Collateral Asset Definitions (examples) | EU / UK EMIR | US CFTC / PR | CFI |
|---|---|---|---|---|---|---|
| 1 | Cash | `AssetType` Cash + `CurrencyCodeEnum` | `US-CASH`, `EU-CASH`, `GB-CASH`, `JP-CASH` (14 currencies) | A | 1 | none (cash is not a CFI instrument) |
| 2 | Gold | `AssetType` Commodity (+ `otherAssetType`) | none | B | 10 (`US_CTFC_PRType10`) | none at group level |
| 3 | Central government / central bank debt — home jurisdiction | Security · Debt + issuer `SovereignCentralBank` + `IssuerCountryOfOrigin` | `US-TBILL`, `US-TNOTE`, `US-TBOND`, `US-TIPS`, `US-STRIP`, `GB-GILT`, `GB-TBILL`, `DE-BOND`, `DE-BILL`, `FR-OAT`, `FR-BTF`, `IT-BTP`, `JP-JGB`, `GA-…-GOV` (23 "generally accepted government obligations" codes) | C (EU Member State / UK) | 2 (US Treasury) | DB (bonds), DY (money market: bills) |
| 4 | Central government / central bank debt — other countries | as 3, other country | as 3 for the other country | J | 4 (ECB, or sovereign with risk weight ≤ 20%) | DB, DY |
| 5 | Regional government / local authority treated as sovereign | issuer `RegionalGovernment`, `sovereignRecourse = true` | `DE-MUNI`, `CH-CANTON`, `BE-REGIONGT`, `AU-FIB`, `AU-STATENOTE` | D (home), K (third country) | no own class; 7 if investment-grade debt *(inference)* | DN (municipal) |
| 6 | Regional government / local authority, other | issuer `RegionalGovernment`, `sovereignRecourse = false` | as 5 | F (home), L (third country) | 7 if investment grade *(inference)* | DN |
| 7 | Public sector entity treated as sovereign | issuer `QuasiGovernment`, `sovereignEntity` / `sovereignRecourse = true` | `BE-STATEGT`, `KR-KEPCO`, `KR-KDICKRW`, `DE-ERBLAST` | E | 3 (US agency fully guaranteed by the US government) | DB |
| 8 | Public sector entity, other / government-sponsored enterprise | issuer `QuasiGovernment`, recourse `false` | `US-FNMA`, `US-FHLMC`, `US-FHLB`, `US-FCS`, `US-SLMA`, `US-TVA`, `US-REFCORP`, `US-FICO`, `GA-US-AGENCY` | G | 5A (GSE with capital support), 5B (other GSE, investment grade) | DB |
| 9 | Multilateral development bank | issuer `SupraNational` · `MultilateralBank` | `SU-IADB`, `SU-IBRDDN`, `SU-IBRDGB` | H | 6 | DB |
| 10 | International organisation | issuer `SupraNational` · `InternationalOrganisation` | none | I | 6 (BIS, IMF) | DB |
| 11 | Covered bonds and bank debt | Security · Debt + `SecuredDebt.securedType` CoveredBonds (`CoveredBondEnum`: Pfandbriefe …); issuer `Corporate` | `DE-PFAND`, `ES-CEDULAS`, `DK-MORT`, `DK-CALLMORT`, `SE-MORT` | M | 7 if investment grade; certain financial issuers excluded | DB |
| 12 | Corporate bonds | Security · Debt + issuer `Corporate` (+ `AssetAgencyRating`) | `ES-CORP`, `IT-CORP`, `JP-CORPORATE`, `US-LEHM-BOND` | N | 7 (investment grade, not GSE) | DB |
| 13 | Commercial paper | Security · Debt + issuer `Corporate` + `AssetMaturity` | `FR-BDT`, `JP-CP` | N | 7 | DY |
| 14 | Securitisation — senior tranche / MBS / ABS | Security · Debt + `SecuredDebt` (`AssetBackedEnum`, `CollateralizedObligationEnum`); issuer `SpecialPurposeVehicle` (`CreditRiskEnum` tranched) | `US-FNMAMBS`, `US-FHLMCMBS`, `US-GNMAMBS`, `US-ARM`, `US-DERIV`, `GA-US-MORTGAGES` | O (most senior tranche, no re-securitisation) | 5A (GSE-guaranteed ABS) | DG (mortgage-backed), DA (asset-backed) |
| 15 | Convertible bonds | Security · Debt + `RedemptionTypeEnum` Convertible | none | P (convertible only into index equities) | none | DC |
| 16 | Equities in a main index | Security · Equity (`EquityTypeEnum` Ordinary) + `IndexType` (`CollateralEquityIndexEnum`, 342 indices) | `US-S&P500`, `US-DOW`, `US-NAS-100`, `GB-FT100`, `EU-STOXX50`, `NL-AEX`, `JP-EQUITY`, `ES-EQUITY` | Q | 8A (S&P 500), 8B (S&P 1500), 8C (index recognised by a foreign supervisor) | ES |
| 17 | Funds | Security · Fund (`FundProductTypeEnum`: MoneyMarketFund, ExchangeTradedFund, MutualFund, OtherFund) | none | R (UCITS meeting the RTS conditions) | 9 (redeemable pooled fund under conditions) | CI (investment funds), CE (ETFs) |

## What the mapping shows

- **The four taxonomies split the space along different axes.** EMIR and CFTC classes are defined mainly by
  **issuer** (central government, regional government, public sector entity, supranational, corporate) and by the
  issuer's treatment under bank capital rules. ISDA codes are defined by **country and instrument name**. CFI is
  defined by **instrument form** and, at the group level, does not distinguish a government bond from a corporate
  bond (both DB). CDM's criteria can express both axes, but only by combining `AssetType` with `CollateralIssuerType`.
- **Some regulatory distinctions have no CDM attribute.** EMIR D vs F and E vs G turn on whether the exposure is
  treated as an exposure to the central government under Regulation (EU) No 575/2013 Articles 115–116; CDM represents
  this only as the booleans `sovereignRecourse` / `sovereignEntity`. CFTC 4 depends on a 20% risk weight, which CDM
  does not hold. Index-based classes (EMIR Q and P, CFTC 8A–8C) need the index list, which CDM holds as a closed enum
  of 342 values.
- **The mapping is many-to-many.** For example, an investment-grade US agency bond is CFTC 3, 5A or 5B depending on
  the guarantee, EMIR J or N depending on whether the agency counts as a third-country government, ISDA `US-FNMA`
  (and others), and CFI DB.
- **CDM has no mapping between the taxonomies.** An eligibility schedule written with ISDA codes cannot be checked
  against an asset described by CDM criteria or by EMIR class without an external mapping such as this table.

Sources: enum descriptions in `rosetta/base-staticdata-asset-common-enum.rosetta` (EMIR, CFTC, debt, equity and fund
enums) and `rosetta/legaldocumentation-csa-enum.rosetta` (ISDA codes), CDM 7.6.0; CFI from ISO 10962 (see note above).
