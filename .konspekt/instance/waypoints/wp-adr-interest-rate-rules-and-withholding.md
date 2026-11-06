```yaml
id: wp-adr-interest-rate-rules-and-withholding
kind: decision
subtype: adr
timestamp: 2026-11-06T15:26:06Z
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: 390933bfa4fb319310fab56fdb543a173e139753
  contentHash: 390933bfa4fb319310fab56fdb543a173e139753
  timestamp: 2026-11-06T15:26:06Z
  confidence: 0.6
createdAt: 2026-11-06T15:26:06Z
updatedAt: 2026-11-06T15:35:07Z
```
# ADR: how cdm-ext reads CDM's collateral interest elections

For G17 ([[task-csa-interest-on-cash]]), `cdmx.collateral.interest` computes the Interest Amount on cash collateral from CDM 7.7.0's
`CollateralInterestParameters`. CDM gives the elections without their calculation, so the extension fixes how each
is read:

- **Negative interest.** `negativeInterest = false` floors each day's Interest Rate at zero (the zero interest rate
  method of the ISDA 2014 Collateral Agreement Negative Interest Protocol). With `true` a negative Interest Amount is
  payable by the pledgor to the secured party.
- **Rate order.** The floor and cap bound the observed rate before the spread (CDM: the cap and floor are "exclusive of
  any spread"); a compressible spread is dropped when the observed rate is not positive. Only the initial value of the
  spread, floor and cap schedules is used.
- **Standard alternative.** A positive Interest Amount is transferred only up to the Credit Support excess (value of the
  posted collateral less the Credit Support Amount) given by the caller; the rest adjusts the posted collateral.
  `TransferIfDeliveryAmountBelowMTA` transfers in full when the Delivery Amount after the transfer is below the
  Minimum Transfer Amount. Negative amounts are never withheld.
- **Order of steps.** Sum the days, round (daily or at period end), deduct withholding tax from a positive amount,
  write off below the write-off limit, then apply the handling election (Transfer, Adjust, Transfer_or_Adjust with the
  rollover limit) and the alternative.

**Context.** The prototype flow needs one computation both parties can repeat from the same inputs. The CDM
descriptions leave the order of rounding, tax and limits, and the meaning of `negativeInterest = false` for a daily
rate, open.

**Consequences.**
- Simple daily accrual only; compounding is rejected by a condition.
- The caller supplies one balance and one observed rate per calendar day, and the Credit Support excess when an
  alternative is elected.
- A reviewer with the agreement text may choose a different reading for any of the points above; each one is a single
  alias or condition in `cdm-ext/rosetta/cdmx-collateral-interest-func.rosetta`.
