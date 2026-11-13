```yaml
id: task-ccp-default
type: task
title: CCP member default: close-out and the default fund waterfall
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
# Task: CCP member default: close-out and the default fund waterfall

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 29 of the workflow map. The oracle records a member's default; BANK-C closes out the defaulter's cleared repos at the feed prices and covers the loss from the defaulter's IM, its default fund contribution, BANK-C's own capital and the other members' contributions, in that order.

**Design proposed 2026-11-13** in [[wp-adr-ccp-default]], built without design questions at the project owner's
request (source `9313093366bdd34b988e9a2baa1c53ee3f5f44cc`). SME questions in [[task-sme-ccp-default]].

**CDM check 2026-11-13, for the design.** CDM has no member default, auction, waterfall or default fund (G23). The
close-out of each leg uses the GMRA default values built for row 11 (`GmraDefaultTransactionValue`: CDM's termination
event, the Repurchase Price and the Default Market Value); both legs of a cleared repo give the same values. CDM's
`Min` gives each waterfall layer.

**Built 2026-11-13** to [[wp-adr-ccp-default]]:

- **cdm-ext** (`cdmx.collateral.ccp`): `CcpDefaultTransaction`, `CcpWaterfall` and `CcpDefaultManagement`, functions
  `CcpWaterfallLayer` and `CcpTransactionsWithoutTheDefaulter`. `CcpRiskTest`, 2 tests.
- **Contracts**: `CcpClearing` gains the state `ClosedOut`, each member's `contributed` (its share less what a
  waterfall used), `closeOutDefault` (the member in default on the oracle; pays the survivors owed and the defaulter,
  records what survivors owe), `payDefaultDue` and the views `defaultRecord` and `defaultsOf`. 4 hardhat tests.
- **Gateway** routes `/ledger/v1/ccp/defaults` (POST close-out; GET by CCP, with what each survivor owes) and
  `/:hash/pay`.
- **Service** `CdmCcp.defaultManagement`, `parseManagement`; `/api/v1/ccp/defaults` routes: BANK-C records the default
  on the oracle, cancels an open round, builds the document and closes out; each member rebuilds it from the novations
  and the chain. `CdmCcpRiskTest`, 2 tests.
- **Console** the member default section of the CCP card: BANK-C declares; each party sees the close-out, the
  waterfall and what each survivor was paid or owes, and pays what it owes.
- **Live spec** `flow-ccp-default`, after `flow-ccp-margin`.
