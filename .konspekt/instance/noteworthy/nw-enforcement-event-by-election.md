```yaml
id: nw-enforcement-event-by-election
kind: decision
review: proposed
provenance:
  conversationId: cdm-development
  sourceRef: aa91f5ad7f70c8da3e070cfedaa084482327172f
  contentHash: aa91f5ad7f70c8da3e070cfedaa084482327172f
  timestamp: 2026-11-03T23:08:40Z
  confidence: 0.6
createdAt: 2026-11-03T23:08:40Z
updatedAt: 2026-11-03T23:08:40Z
```
# Decision: enforcement against segregated IM is its own event over the portfolio, gated by CDM's enforcementEvent elections

How gap G14 is closed in `cdm-ext/rosetta/cdmx-collateral-enforcement-*.rosetta` ([[task-cdm-gap-closure]]):

- **Event:** `Create_CollateralEnforcement` records a `CollateralEnforcement` (qualifier `CollateralEnforced`) over
  CDM's `CollateralPortfolio`, outside the margin call lifecycle. The positions taken leave the portfolio, their value
  after haircuts leaves the balance, and one `TransferState` per position moves them from the pledgor to the secured
  party.
- **Preconditions:** the Defaulting Party is the portfolio's pledgor; the secured party enforces; the custodian or
  control contract has given exclusive control (in the prototype, the control contract reading the default from the
  oracle feed, [[wp-adr-im-segregation]]); an Enforcement Event has occurred.
- **Enforcement Event:** CDM's `SecurityAgreementElections -> enforcementEvent` is read as follows. Absent, or with
  `earlyTerminationDate` elected: an Early Termination Date designated and reached. With `failureToPay` elected: a
  notified Failure to Pay or Deliver also suffices. This reading of CDM's two booleans is an interpretation; it is not
  taken from the Security Agreement text, hence the lower confidence.
- **Realised value:** sale proceeds or the value under the Valuation of Appropriated Collateral election, given by the
  caller; it is what `CloseOutNetting` applies as `collateralHeld` ([[nw-closeout-collateral-by-arrangement]]).

Not modelled: the sale or appropriation itself and the custodian's own steps.
