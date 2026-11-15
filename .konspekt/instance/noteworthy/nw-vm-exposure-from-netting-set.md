```yaml
id: nw-vm-exposure-from-netting-set
kind: decision
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;AEaBpOCXgAxYP0Cxg7IiZLvKTdd3ut6qgWMlHkMpn9c
  timestamp: 2026-11-03T20:54:04Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: e8e7767cdb71e904d14cd41832f44ea6aa3864d5
    contentHash: e8e7767cdb71e904d14cd41832f44ea6aa3864d5
createdAt: 2026-11-03T20:54:04Z
updatedAt: 2026-11-03T21:48:03Z
```
# Decision: VM Exposure netted from one netting set in the base currency; VM amounts on the G7 valuation

How gaps G10 and G9 are closed in `cdm-ext/rosetta/cdmx-collateral-exposure-*.rosetta` and
`cdmx-collateral-valuation-vm-func.rosetta` ([[task-cdm-gap-closure]]):

- **Netting set:** one mark-to-market value per transaction, stated from one valuation party, as Base Currency
  Equivalents. FX conversion is the caller's.
- **Exposure:** `NettedExposure` sums the values; the sign is flipped when the secured party is the counterparty.
- **Credit Support Amount (VM):** Exposure less an optional Threshold (absent counts as zero), zero if negative.
- **Delivery and Return Amount (VM):** the credit support held is valued with the G7 functions (cash in the base
  currency has haircut 0, see [[nw-cdm-valuation-percentage-as-haircut]]); delivery rounds up, return rounds down, both
  zero below the Minimum Transfer Amount and less any disputed amount, as in CDM's IM functions.

Close-out netting is gap G15 and is not covered.
