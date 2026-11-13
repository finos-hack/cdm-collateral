```yaml
id: task-ccp-clearing
type: task
title: CCP clearing of a bilateral repo by novation to BANK-C
status: resolved
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
  contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.6
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-13T15:22:33Z
```
# Task: CCP clearing of a bilateral repo by novation to BANK-C

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 27 of the workflow map. A and B submit a booked bilateral repo; BANK-C accepts it and the repo is novated into BANK-A against BANK-C and BANK-C against BANK-B; the cash and securities legs settle through BANK-C.

**Design chosen 2026-11-12** (source `0072e61cda902e466726ca3c65c8c1ad61b3f089`: "Go with (a) for all"), recorded in [[wp-adr-ccp-clearing]].

**CDM check 2026-11-12, for the design.** On the prototype's repo (BANK-A sells tUST to BANK-B for 98,400 tUSD) CDM's
split with intent `Clearing` and three branches validates: a party change of `Party2` to BANK-C, a party change of
`Party1` to BANK-C, each adding BANK-C's `ClearingOrganization` party role, and a quantity change (`Replace`) of the
cash and the securities to zero, which closes the bilateral trade as `Terminated`. `Qualify_ClearedTrade` is true for
this event; the check recorded on [[task-ccp-workflows]] split into two branches only, closed nothing, and gave false.
The instruction must be run through `GlobalKeyProcessStep` first. The two new trades give their Purchase Price
(`RepoPurchasePrice`, 98,400) once reloaded from their JSON with references resolved; straight out of
`Create_BusinessEvent` it reads 0. The `Seller` and `Buyer` party roles are carried over unchanged into both new
trades; the `Party1` and `Party2` counterparties carry the change.

**Built 2026-11-12** to [[wp-adr-ccp-clearing]]:

- **cdm-ext** (`cdmx.collateral.ccp`): `CcpNovation` (conditions `CcpRole`, `ClearingIntent`, `ClearedTrade`,
  `CcpOnBothTrades`) and function `CcpTradesWithoutTheCcp`. `CcpNovationTest`, 2 tests.
- **Contracts**: `RepoSettlement` gains the state `Novated`, `setClearingHouse` (the deployer, once), `novate` (only
  `CcpClearing`, an affirmed repo) and `novationHash`. `CcpClearing` takes `RepoSettlement` at deployment and gains
  `submitClearing`, `affirmClearing`, `acceptClearing`, `refuseClearing`, `instructCleared`, `clearing` and
  `clearingsOfParty`. 2 hardhat tests.
- **Gateway** routes `/ledger/v1/ccp/clearings` (POST submit; GET by party), `/:id`, `/:id/affirm`, `/:id/accept`,
  `/:id/refuse`, `/:id/instruct` (approves the leg's token to `CcpClearing` first); `CcpClearing` events relayed on
  `/ledger/v1/events`; the repo state `novated`.
- **Service** `CdmCcp.novation`, `clearingEvent`, `verifyNovation`, `bilateralOf`; `/api/v1/ccp/clearings` routes. The
  buyer rebuilds the novation from its own booking; BANK-C cannot read the bilateral trade document (its readers are A
  and B), so it rebuilds from the trade the clearing event carries and checks it against the repo on chain. Each member
  instructs its own leg's purchase, and its repurchase on or after the Repurchase Date. `CdmCcpTest`, 2 more tests.
- **Console** the clearing section of the CCP card: submit (seller), affirm (buyer), accept or refuse (BANK-C), instruct
  my leg (members). 2 more tests in `CcpConsole.test.tsx`.
- **Live spec** `flow-ccp-clearing`, after `flow-ccp-membership`.
