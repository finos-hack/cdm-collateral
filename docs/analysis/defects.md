# Defects found in CDM — collateral scope

Defects in the CDM model, its sample data and its documentation found during the analyses under goal
`goal-data-cdm-taxonomies-specs`. A defect here is something CDM states or does that is wrong or self-contradictory;
modelling gaps (something CDM does not cover) are in [`findings.md`](findings.md).

- **CDM version:** release `7.6.0`, commit `f685b4b45d8faa419425c018a52af66f40e43c0b`. All line numbers refer to
  this commit; the links open the lines on GitHub.
- **Paths** are relative to the CDM repository root. `rosetta/` stands for `rosetta-source/src/main/rosetta/`,
  `functions/` for `rosetta-source/src/main/resources/functions/`.
- **Status** of every defect: not reported to FINOS. Two have open CDM issues (D4, D7).
- **Earlier IDs:** D1 was F1; D2, D3 were O4; D4, D5, D13 were O5; D6 was O6; D7 was O7; D8 is the function part of
  TX3.

[base]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b

## Summary

| ID | Defect | Severity | Location |
|---|---|---|---|
| D1 | Additional haircut reads the FX haircut field, so the FX haircut is applied twice and the additional haircut never | calculation error | `rosetta/legaldocumentation-csa-func.rosetta` 24, 27 |
| D2 | Margin ratio is defined as market value ÷ purchase price but applied as a multiplier, and the haircut branch inverts it | calculation error | `rosetta/product-collateral-type.rosetta` 69; `rosetta/event-common-func.rosetta` 838–842, 854 |
| D3 | Repo sample and documentation violate the model's own conditions on margin and haircut percentages | sample / docs | `functions/repo-and-bond/repo-execution-func-input.json` 140; `docs/repurchase-agreement-representation.md` 221 |
| D4 | Full return and termination qualification accept the same event, so a securities-lending return is not qualified | qualification | `rosetta/event-qualification-func.rosetta` 215–240, 841–861 |
| D5 | Collateral substitution is qualified as a renegotiation | qualification | `rosetta/event-qualification-func.rosetta` 821–839; `rosetta/event-common-func.rosetta` 1947–1963 |
| D6 | Repo sample leaves mandatory eligibility fields empty and labels bond collateral as cash | sample | `functions/repo-and-bond/repo-execution-func-input.json` 136–140 |
| D7 | Repo product qualification rejects repos with more than one interest payout | qualification | `rosetta/product-qualification-func.rosetta` 1793, 1806 |
| D8 | Rating eligibility check compares notations by text equality and ignores the boundary and mismatch rules | eligibility logic | `rosetta/product-collateral-func.rosetta` 137–155 |
| D9 | Enum value misspelt `US_CTFC_PRType10` (CFTC) | naming | `rosetta/base-staticdata-asset-common-enum.rosetta` 539 |
| D10 | Enum value misspelt `AgreeinFull` | naming | `rosetta/event-common-enum.rosetta` 95 |
| D11 | Attribute misspelt `identifer` | naming | `rosetta/legaldocumentation-master-type.rosetta` 13; `rosetta/event-position-type.rosetta` 77, 83 |
| D12 | Descriptions contain a literal `\t` and lost accented characters | text | `rosetta/legaldocumentation-csa-enum.rosetta` 100, 125–128, 220 |
| D13 | Several repo and lending event samples produce no event qualifier *(cause not confirmed)* | qualification | `functions/repo-and-bond/*-output.json` |
| D14 | CDM 7.7.0 Python package: `Asset` types cannot be built or deserialised, nested objects with an absent metadata field cannot be constructed, and importing `Asset` first is a circular import *(added 2026-10-17)* | Python distribution | `finos-cdm` 7.7.0 on PyPI: `finos/_bundle.py`, `finos/cdm/base/staticdata/asset/common/` |
| D15 | Rune Python generator 10.15.1.0 produces Python that differs from the Rune semantics in nine ways (pre-conditions before aliases, nested `set`, list wrapping and flattening, `add` on absent lists, missing imports, closures inside `extract`, no copy on `set`, `empty` as `[]`) *(added 2026-10-17)* | code generator | `finos/rune-python-generator` release 10.15.1.0; list in `cdm-ext/README.md` |

## Details

### D1 — Additional haircut reads the FX haircut field

- [`rosetta/legaldocumentation-csa-func.rosetta` line 24][d1a]: in `PostedCreditSupportItemAmount`,
  `alias additionalHaircutPercentage: postedItem -> fxHaircutPercentage`.
- [Line 27][d1b] subtracts `haircutPercentage + fxHaircutPercentage + additionalHaircutPercentage`.
- `PostedCreditSupportItem` has a separate `additionalHaircutPercentage` attribute
  ([`rosetta/legaldocumentation-csa-type.rosetta` line 150][d1c]).
- **Effect:** the FX haircut is subtracted twice; the additional haircut is ignored. Still present on `master`
  `40ce355` (2026-10-15).
- **Fix:** `alias additionalHaircutPercentage: postedItem -> additionalHaircutPercentage`.

[d1a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/legaldocumentation-csa-func.rosetta#L24
[d1b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/legaldocumentation-csa-func.rosetta#L27
[d1c]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/legaldocumentation-csa-type.rosetta#L150

### D2 — Margin ratio direction is inconsistent

- [`rosetta/product-collateral-type.rosetta` lines 69–73][d2a]: `marginPercentage` is GMRA 2(bb) Margin Ratio, market
  value of the securities ÷ purchase price; "a 104% requirement would be represented as … 1.04".
  [Line 82][d2b]: condition `marginPercentage >= 1`.
- [`rosetta/event-common-func.rosetta` lines 838–842][d2c]: in `SecurityFinanceCashSettlementAmount`, when a haircut is
  given, `marginRatio = 1 / (1.0 - haircut)`.
- [Line 854][d2d]: cash = `securityPrice × securityQuantity × marginRatio`. The same multiplication is in the billing
  function at [lines 1314–1322][d2e].
- **Effect (inference):** under the GMRA definition, purchase price = market value ÷ margin ratio. Multiplying by a
  ratio ≥ 1, or by 1/(1 − h), produces cash **above** the market value of the securities.
- **Fix:** divide by the margin ratio, or redefine the attribute; confirm with the ICMA working group.

[d2a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-type.rosetta#L69-L73
[d2b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-type.rosetta#L82
[d2c]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-common-func.rosetta#L838-L842
[d2d]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-common-func.rosetta#L854
[d2e]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-common-func.rosetta#L1314-L1322

### D3 — Samples and documentation violate the model's conditions

- [`functions/repo-and-bond/repo-execution-func-input.json` line 140][d3a]: `"marginPercentage" : 0.99`, described in
  the accompanying `.md` as a 1% haircut. This violates `marginPercentage >= 1`
  ([`rosetta/product-collateral-type.rosetta` line 82][d2b]).
- [`docs/repurchase-agreement-representation.md` line 221][d3b]: `"haircutPercentage" : 2`. This violates
  `haircutPercentage < 1` ([`rosetta/product-collateral-type.rosetta` line 79][d3c]).

[d3a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/resources/functions/repo-and-bond/repo-execution-func-input.json#L140
[d3b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/docs/repurchase-agreement-representation.md#L221
[d3c]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-type.rosetta#L79

### D4 — Full return and termination qualifications collide

- [`Qualify_FullReturn`, `rosetta/event-qualification-func.rosetta` lines 215–240][d4a] and
  [`Qualify_Termination`, lines 841–861][d4b] both accept an event with no intent, a single quantity-change primitive,
  remaining quantity zero and state `Terminated`.
- **Effect:** the expected outputs `functions/sec-lending/full-return-settlement-workflow-func-output.json` and
  `part-return-settlement-workflow-func-output.json` carry no `eventQualifier`.
- **CDM issue:** [#5109](https://github.com/finos/common-domain-model/issues/5109), open; fixed on the 8.x line in
  PR #5241 (2026-10-01) and reopened for backport to 6.x and 7.x. The maintainers add that `Qualify_FullReturn`
  looks for the `AssetPayout` on the collateral path, which is wrong for securities lending.

[d4a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-qualification-func.rosetta#L215-L240
[d4b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-qualification-func.rosetta#L841-L861

### D5 — Collateral substitution is qualified as renegotiation

- [`Qualify_Substitution`, `rosetta/event-qualification-func.rosetta` lines 821–839][d5a] requires a changed `payout`
  and the new trade's effective date to equal the old termination date.
- [`Create_SubstitutionInstruction`, `rosetta/event-common-func.rosetta` lines 1947–1963][d5b] changes only
  `collateralPortfolio` and the effective date; the event built by `Create_SubstitutionPrimitiveInstruction`
  ([line 1919][d5c]: terms change + quantity change) matches
  [`Qualify_Renegotiation`, lines 573–591][d5d].
- **Effect:** [`functions/repo-and-bond/repo-substitution-output.json` line 419][d5e]:
  `"eventQualifier" : "Renegotiation"`.

[d5a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-qualification-func.rosetta#L821-L839
[d5b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-common-func.rosetta#L1947-L1963
[d5c]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-common-func.rosetta#L1919
[d5d]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-qualification-func.rosetta#L573-L591
[d5e]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/resources/functions/repo-and-bond/repo-substitution-output.json#L419

### D6 — Repo sample leaves mandatory eligibility fields empty

- [`functions/repo-and-bond/repo-execution-func-input.json` lines 136–140][d6a]: `eligibleCollateral` holds only
  `treatment.valuationTreatment.marginPercentage`.
- Missing: `collateralCriteria` (1..1, [`rosetta/product-collateral-type.rosetta` line 113][d6b]) and
  `treatment.isIncluded` (1..1, [line 151][d6c]).
- Line 136 sets `"collateralType" : "Cash"` for a repo collateralised by a bond.
- Whether model validation reports the missing attributes in the test run was not checked.

[d6a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/resources/functions/repo-and-bond/repo-execution-func-input.json#L136-L140
[d6b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-type.rosetta#L113
[d6c]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-type.rosetta#L151

### D7 — Repo qualification accepts only one interest payout

- [`rosetta/product-qualification-func.rosetta` line 1793][d7a] (`Qualify_RepurchaseAgreement`) and
  [line 1806][d7b] (`Qualify_BuySellBack`): `economicTerms -> payout only-element as InterestRatePayout exists`.
- **Effect:** repos with coupon, dividend or ad-hoc interest legs are not qualified. *(Inference)*
  `Create_OnDemandInterestPaymentPrimitiveInstruction` adds a payout leg, so its after-trade may fail qualification.
- **CDM issue:** [#4692](https://github.com/finos/common-domain-model/issues/4692), open (ICMA, 2026-05-07), proposes
  removing `only-element`.

[d7a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-qualification-func.rosetta#L1793
[d7b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-qualification-func.rosetta#L1806

### D8 — Rating check is text equality

- [`CheckAgencyRating`, `rosetta/product-collateral-func.rosetta` lines 137–155][d8a] keeps a criterion when
  `creditNotation -> notation = query -> agencyRating -> creditNotation -> notation` and the reference agency matches.
- It does not use `AgencyRatingCriteria.boundary` (minimum / maximum) or `mismatchResolution`
  ([`rosetta/product-collateral-type.rosetta` line 51][d8b]).
- **Effect:** a criterion "minimum A-" matches an asset rated `A-` but not one rated `AA`. Related modelling gap:
  ratings have no scale or order (finding TX3).

[d8a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-func.rosetta#L137-L155
[d8b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/product-collateral-type.rosetta#L51

### D9–D12 — Naming and text

- **D9** [`rosetta/base-staticdata-asset-common-enum.rosetta` line 539][d9]: `US_CTFC_PRType10` (gold); the other 12
  values of `US_CFTC_PR_EligibleCollateralEnum` are spelt `US_CFTC_PR…`.
- **D10** [`rosetta/event-common-enum.rosetta` line 95][d10]: `MarginCallResponseTypeEnum.AgreeinFull`.
- **D11** attribute `identifer`: [`rosetta/legaldocumentation-master-type.rosetta` line 13][d11a]
  (`MasterAgreementClause`, mandatory), [`rosetta/event-position-type.rosetta` lines 77][d11b] and [83][d11c].
- **D12** [`rosetta/legaldocumentation-csa-enum.rosetta`][d12]: literal `\t` in the descriptions of `DE_MUNI`
  (line 100, "Kommunalschuldverschreib\tungen") and `US_DOW_TRAN` (line 220); "Trésor" appears as "Trsor" in
  `FR_BDT`, `FR_BTAN`, `FR_BTF`, `FR_OAT` (lines 125–128).

Renaming D9–D11 is a breaking change for serialised data.

[d9]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/base-staticdata-asset-common-enum.rosetta#L539
[d10]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-common-enum.rosetta#L95
[d11a]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/legaldocumentation-master-type.rosetta#L13
[d11b]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-position-type.rosetta#L77
[d11c]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/event-position-type.rosetta#L83
[d12]: https://github.com/finos/common-domain-model/blob/f685b4b45d8faa419425c018a52af66f40e43c0b/rosetta-source/src/main/rosetta/legaldocumentation-csa-enum.rosetta#L100

### D13 — Event samples without a qualifier *(cause not confirmed)*

The expected outputs `repo-reprice-output.json`, `repo-adjustment-output.json`, `roll-output.json`,
`partial-delivery-output.json`, `shaping-output.json`, `on-demand-interest-payment-output.json` and
`clearing-via-novation-output.json` in `functions/repo-and-bond/` carry no `eventQualifier`, although qualification
functions exist for these events (`Qualify_Reprice`, `Qualify_Adjustment`, `Qualify_Roll`, `Qualify_PartialDelivery`,
`Qualify_Shaping`, `Qualify_ClearedTrade`). The cause was not investigated; the outputs are what the test harness
expects at 7.6.0.

### D14 — CDM 7.7.0 Python package: asset types and nested construction *(added 2026-10-17)*

Found while testing the local extension (`cdm-ext/`, `task-cdm-gap-closure`). Package `finos-cdm` 7.7.0 from PyPI
with `rune.runtime` 2.2.2 and pydantic 2.14.1; each case reproduced in a clean environment without the extension.

- `from finos.cdm.base.staticdata.asset.common.Asset import Asset` as the first CDM import fails: "cannot import name
  'Asset' from partially initialized module ... (most likely due to a circular import)". Importing `finos._bundle`
  first avoids it.
- Deserialising an `Asset` holding a `Security` fails: `Instrument.Security.identifier` "Input should be None" (the
  field's type is unresolved). Holding `Cash` fails with `NameError: name 'CurrencyCodeEnum' is not defined`.
  Importing the asset modules and forcing a model rebuild fixes `Security` only, and breaks other models (for
  example `Identifier.assignedIdentifier`).
- Constructing a `NonNegativeQuantitySchedule` whose unit is not a currency (`UnitType(financialUnit=Share)`) fails
  in the metadata validator (`'NoneType' object has no attribute '_init_meta'`); the same object deserialised from
  Rune JSON works. The same failure occurs inside generated functions that construct CDM objects, and
  `model_dump_json` fails the same way. `rune.runtime` re-enables the metadata check after every `validate_model`
  call; the extension's runtime switches it off for the process (`cdm-ext/tests/cdm_runtime.py`).

Consequence: a `CollateralPosition` cannot carry its asset when built in Python, so CDM's own
`PositionBase.ProductOrAsset` condition cannot pass. The extension's tests work around it (see
`cdm-ext/tests/cdm_runtime.py`). Not reported to FINOS (project owner's instruction). The repository's Python test
(`python/test/test_import_trade_state.py`) only checks that `TradeState` imports.

### D15 — Rune Python generator 10.15.1.0: generated Python differs from Rune semantics *(added 2026-10-17)*

Found while generating the local extension's margin call lifecycle (`cdm-ext/`). Each case and the way the Rune is
written around it is listed in [`../../cdm-ext/README.md`](../../cdm-ext/README.md) § Rune Python generator. The
cases that change results silently (pre-conditions evaluated before aliases are assigned; `set next: state` not
copying) are covered by tests. Not reported (project owner's instruction).

