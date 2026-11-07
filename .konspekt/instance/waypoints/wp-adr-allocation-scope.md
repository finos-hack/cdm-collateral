```yaml
id: wp-adr-allocation-scope
kind: decision
subtype: adr
timestamp: 2026-11-07T13:52:51Z
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: b276b4a7ca75f9adc407b9c513b5477ad0418f4c
  contentHash: b276b4a7ca75f9adc407b9c513b5477ad0418f4c
  timestamp: 2026-11-07T13:52:51Z
  confidence: 0.7
createdAt: 2026-11-07T13:52:51Z
updatedAt: 2026-11-07T13:52:51Z
```
# ADR: collateral allocation suggests a basket off-chain in the pledgor's ranking order; the pledgor still proposes

For `flow-allocation` ([[task-csa-allocation]], gap G34), within the owner's choices of 2026-11-07 (the default ranking
awaits [[task-sme-allocation-ranking]]):

- cdm-ext (`cdmx.collateral.allocation`): `AllocateCollateral` takes the pledgor's inventory (positions), the pair's
  eligibility and haircuts, prices, the agreed amount and a ranking of the assets. It fills the agreed amount in
  ranking order from eligible assets only and returns `CollateralPosition (1..*)` whose value after haircuts covers the
  agreed amount, or nothing when the inventory cannot cover it.
- Ranking: the pledgor supplies the order; the default is the registry order. The function makes no claim about cost.
- Rounding: the last asset is rounded up to whole units, so the basket exceeds the agreed amount by less than one
  unit's value after haircuts.
- Concentration limits are not applied: the live agreement path carries none. `ConcentrationLimitBreaches` stays
  available for a follow-up that adds limits to the live agreement data and the proposal check.
- Scope of calls: new IM and VM calls only; return calls, substitution and the netting legs get no suggestion.
- Service and console: `POST /api/v1/calls/{id}/allocation` reads balances, prices and haircuts through the party's own
  gateway, calls `AllocateCollateral` and returns the suggested basket. The console's "Suggest allocation" fills the
  existing basket, which the pledgor can edit before "Propose collateral".

**Consequences.**
- No contract change: the allocation runs off-chain on the pledgor's side, and the on-chain proposal, decision, pledge
  and transfer steps are unchanged.
- A suggested basket can still be rejected by the secured party; the suggestion carries no on-chain status.
