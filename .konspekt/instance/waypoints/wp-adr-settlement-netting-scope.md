```yaml
id: wp-adr-settlement-netting-scope
kind: decision
subtype: adr
timestamp: 2026-11-07T04:24:56Z
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;CJ7-8FrhUaoQpxT0n7qH8SwdFdA1qbGzsCXmiIF4nlU
  timestamp: 2026-11-07T04:24:56Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 4152e4ee345e631416a4e46366cf621cd0cbb40c
    contentHash: 4152e4ee345e631416a4e46366cf621cd0cbb40c
createdAt: 2026-11-07T04:24:56Z
updatedAt: 2026-11-07T04:38:11Z
```
# ADR: settlement netting settles a day's VM calls, VM returns and held Interest Amounts by one cash transfer from the party owing the net

For `flow-settlement-netting` ([[task-csa-settlement-netting]]), within the owner's choice of scope of 2026-11-06 (details are assumptions
awaiting [[task-sme-settlement-netting-rules]]):

- cdm-ext (`cdmx.collateral.netting`): a `SettlementObligation` per movement (`DeliveryAmount`, `ReturnAmount`,
  `InterestAmount`; no initial margin type) and `Create_SettlementNetting`, which sums each party's payments and gives
  the net, its payer and receiver in a `SettlementNettingStatement`. Conditions: the same two parties, one settlement
  date, one currency, each call or statement once, at least one margin movement, and an Interest Amount only under
  CDM's `netInterestWithMarginCalls`. `SettleCallInstruction.nettingIdentifier` names the netting on each call's
  SettleCall step, so each call folds to `Settled` as before.
- Contract: `CollateralControl.settleNetted(nettingId, callIds, callCdmHashes, interestIds, cashToken, cdmHash)`
  settles in one transaction. A VM call needs an accepted proposal of the cash token alone; a return call pays its
  agreed amount in the cash token at the feed price; on both the called party pays the calling party. Only the party
  owing the net calls it (either party when the movements offset); `nettedIn` records the netting per call and
  statement. `stateInterestForNetting` states an Interest Amount without paying it, and `payInterest` lets the secured
  party pay a held positive amount alone. The existing `stateInterest`, `settleByTransfer` and `returnByTransfer`
  paths are unchanged.
- The prototype agreement elects `netInterestWithMarginCalls`; the secured party chooses per statement whether to
  hold it for netting.
- Service and console: the service lists the movements that can net now and settles all of them; the console shows
  the movements and the net, and offers "Settle netted" to the party owing the net.

**Consequences.**
- The movements settle together or not at all; a movement that fails a check reverts the whole netting.
- Adding `settleNetted` took `CollateralControl` past the 24,576-byte contract size limit (EIP-170): 24,906 bytes with
  the legacy pipeline at 200 optimizer runs, 24,614 at 1 run. The contracts now compile with `viaIR: true`
  (20,063 bytes).
- A return call carries no marker for initial or variation margin; including it in a netting settles it as a VM
  return by transfer.
