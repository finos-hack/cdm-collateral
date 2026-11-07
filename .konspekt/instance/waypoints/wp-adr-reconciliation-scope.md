```yaml
id: wp-adr-reconciliation-scope
kind: decision
subtype: adr
timestamp: 2026-11-07T18:37:24Z
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: 9a57e2d1cdefdaf5914d764b3e69381646e0560d
  contentHash: 9a57e2d1cdefdaf5914d764b3e69381646e0560d
  timestamp: 2026-11-07T18:37:24Z
  confidence: 0.65
createdAt: 2026-11-07T18:37:24Z
updatedAt: 2026-11-07T18:41:40Z
```
# ADR: reconciliation checks each party's CDM records against the chain and matches the parties' trade portfolios off-chain; only hashes go on-chain

For row 8 ([[task-csa-reconciliation]], gap G35, brought back into scope on 2026-11-07), within the owner's choices of
2026-11-07 (the matching rules await [[task-sme-reconciliation-rules]]):

- **Records against the chain (option 1), on request.** `POST /api/v1/reconciliation/ledger` on each party's
  collateral service compares the party's CDM records for the pair (each call's state and agreed amount, the folded
  steps, the escrow positions from the CDM portfolio) with the contract state and the events read through the party's
  own gateway. It returns a CDM-typed report of breaks (record missing, state differs, amount differs, position differs).
  Nothing is written on-chain. The console has a "Reconcile with ledger" button.
- **Trade portfolios between the parties (option 2).** Each party's service is seeded with CDM 7.7.0 sample
  `TradeState`s and its own valuation of each trade; the partyA/partyB EUR vanilla swap pair
  (`EUR-vanilla-reconciliation-party*-uti`) is the known match. A party takes a snapshot (trades, valuations, as-of time),
  sends it to the counterparty's service directly, service to service, and commits the snapshot's hash on-chain. No trade
  data goes on the shared chain.
- **Matching.** cdm-ext (`cdmx.collateral.reconciliation`): trades are matched by UTI; a break is a trade missing on one
  side, a difference in a key economic field (product, notional and currency, effective and termination dates, fixed
  rate, floating index, payer and receiver relative to the pair), or a valuation difference above a tolerance. The
  report also carries each party's total exposure and the difference. The function is deterministic, so both parties
  compute the same report from the two snapshots; each commits the report hash on-chain and the result counts as agreed
  when the two hashes match.
- **Breaks and disputes.** A break is reported in the service and the console. When an issued call between the pair is
  open, the called party can dispute it and cite the report and its breaks: the existing response step is used, with
  the CDM `Dispute` reason referring to the report (`cdmx.collateral.dispute`, G3). A break does not block new calls.
- **On-chain.** A new small contract records snapshot hashes and report hashes per pair, with events; `CollateralControl`
  and `MarginCall` are unchanged (`CollateralControl` is close to the EIP-170 size limit).
- Oracle inputs against a second source are out of scope.

**Consequences.**
- A new contract to deploy, and a service-to-service endpoint between the two collateral services (the first direct
  link between them; until now they shared only the chain).
- The tolerance, the key fields and the cadence are placeholders until the SME confirms them.
