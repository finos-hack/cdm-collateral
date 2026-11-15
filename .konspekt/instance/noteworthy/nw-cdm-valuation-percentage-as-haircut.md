```yaml
id: nw-cdm-valuation-percentage-as-haircut
kind: fact
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;ga96a-0a7ipRk65AdxAjqQNyTaD1xma9zxwktu81hbQ
  timestamp: 2026-11-03T18:04:30Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 89416143b9918f5fb8fcd0bda74895ebfe36c623
    contentHash: 89416143b9918f5fb8fcd0bda74895ebfe36c623
createdAt: 2026-11-03T18:04:30Z
updatedAt: 2026-11-03T20:41:24Z
```
# Fact: CDM describes `haircutPercentage` as the Valuation Percentage but subtracts it as a haircut

In CDM 7.7.0, `PostedCreditSupportItem -> haircutPercentage` is described as "Valuation Percentage means, for any item
of Eligible Collateral (IM), the percentage specified in accordance with Paragraph 13". However,
`PostedCreditSupportItemAmount` computes value × (1 − (haircutPercentage + fxHaircutPercentage + additional)), which
treats the field as a haircut.

Under the ISDA IM CSA, a Valuation Percentage is the share of the value that counts, for example 98%. A caller who
passes it as described would get 2% of the value.

The G7 replacement (`CorrectedPostedCreditSupportItemAmount`, [[task-cdm-gap-closure]]) keeps CDM's subtractive
formula, so callers pass the haircut (1 − Valuation Percentage). Found while closing G7. Recorded as defect D17 in `docs/analysis/defects.md` (2026-11-03).
