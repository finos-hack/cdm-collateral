```yaml
id: wp-adr-cdm-collateral-events
kind: decision
subtype: adr
timestamp: 2026-10-17T16:03:44Z
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: e61393e8f33765faa3913c1c4270ef0919a1a43a
  contentHash: e61393e8f33765faa3913c1c4270ef0919a1a43a
  timestamp: 2026-10-17T17:00:55Z
createdAt: 2026-10-17T16:03:44Z
updatedAt: 2026-10-17T17:00:55Z
```
# ADR: Margin call events in an own event type; settlement as CDM transfers

Each margin call step is recorded as a `CollateralEvent` (`cdmx.collateral.event`) shaped like CDM 7.7.0's
`BusinessEvent`: instruction, before and after state, `eventQualifier` set from `Qualify_…` functions, and transfers.
A settlement step carries one CDM `TransferState` per collateral position (`UnscheduledTransfer`, status `Settled`,
settlement date = event date), built by `Create_CollateralTransfer` (`cdmx.collateral.transfer`). Payer and receiver
are the call's `Pledgor` and `SecuredParty` in CDM's `MarginCallBase -> partyRole`: pledgor to secured party on
delivery, the reverse on return.

**Context.** CDM's `BusinessEvent` records trade states (`TradeState`) and `Create_Transfer` builds transfers from a
trade; a margin call has no trade, and `EventIntentEnum` has no collateral value (gap register G1, G4; findings F2,
TX5). CDM's `TransferState` itself needs no trade, so the transfers are CDM's own type.

**Consequences.** Qualifiers are the extension's names (`MarginCallIssued`, `CollateralDelivered`, …), not CDM
values. `transferType` stays absent: `UnscheduledTransferEnum` has no collateral delivery or return value (its
`Return` is the securities-lending return). Only `Pledgor`/`SecuredParty` are read; English-law `Chargor` and title
transfer (VM) roles are not yet. The transfers pass all of CDM's own conditions; full CDM validation of positions
fails in CDM's generated `PriceQuantityTriangulation` (D14).
