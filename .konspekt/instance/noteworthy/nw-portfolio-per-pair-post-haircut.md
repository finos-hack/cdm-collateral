```yaml
id: nw-portfolio-per-pair-post-haircut
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;2KLbfbgVRDQ3Q3kTCvLSqheu-dLHMn12jaywcgyafIs
  timestamp: 2026-11-03T18:04:30Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: bbf6056baae1e393194431888f7e77b8b1745226
    contentHash: bbf6056baae1e393194431888f7e77b8b1745226
createdAt: 2026-11-03T18:04:30Z
updatedAt: 2026-11-03T20:41:24Z
```
# Decision: one collateral portfolio per pair, updated only on settlement, balance at the agreed value after haircuts

How gap G5 is closed in `cdm-ext/rosetta/cdmx-collateral-portfolio-func.rosetta` ([[task-cdm-gap-closure]]):

- `ApplyCollateralEvent(portfolio, event)` returns CDM's `CollateralPortfolio` for one pledgor and secured party after
  one `CollateralEvent`. Only a settlement step changes it.
- **Positions:** held plus delivered less released, netted per asset, status `SettledAmount`. An asset that is fully
  released leaves no position. A return that releases more of an asset than is held is rejected.
- **Balance:** one `CollateralBalance`, `PostHaircut` and `SettledAmount`, with the pledgor as payer and the secured
  party as receiver. A delivery adds the accepted proposal's `valueAfterHaircuts`; a return subtracts `releasedValue`.

The balance is the value agreed when each settlement happened. It is not a revaluation at current prices: that stays
with the revaluation in the collateral service ([[wp-adr-revaluation-outstanding-im-from-calls]]) and with valuation
gaps G8–G10. VM title transfers settle into the same portfolio shape.
