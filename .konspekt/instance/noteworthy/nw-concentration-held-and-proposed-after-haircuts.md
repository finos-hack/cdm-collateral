```yaml
id: nw-concentration-held-and-proposed-after-haircuts
kind: decision
review: proposed
provenance:
  conversationId: cdm-development
  sourceRef: d73a117f54291c2304fe402650272d50c599ab6b
  contentHash: d73a117f54291c2304fe402650272d50c599ab6b
  timestamp: 2026-11-03T20:54:04Z
  confidence: 0.7
createdAt: 2026-11-03T20:54:04Z
updatedAt: 2026-11-03T20:54:04Z
```
# Decision: concentration limits evaluated on held and proposed collateral together, after haircuts

How gap G8 is closed in `cdm-ext/rosetta/cdmx-collateral-concentration-func.rosetta` ([[task-cdm-gap-closure]]):

- `ConcentrationLimitBreaches(specification, collateral, baseCurrency)` evaluates the `ConcentrationLimit`s of a CDM
  `EligibleCollateralSpecification` against the collateral held and proposed together. An empty result means the
  proposal keeps the portfolio within the limits.
- **Measure:** the value after haircuts. A percentage limit is a share of the value after haircuts of all the
  collateral given.
- **Scope of a limit:** the collateral that matches the criteria it belongs to (CDM `CheckCriteria` on one
  `EligibilityQuery` per position), narrowed by the limit's own criteria. Exclusion criteria carry no limits.
- **Limit types:** `Asset` and `Issuer` apply to each asset or issuer; a limit without a type applies to the matching
  collateral as a whole. The other types need data the schedule does not carry (exchange, sector, parent institution,
  issue size, market capitalisation, outstanding balance, cash in base currency, trading volume) and are rejected.
