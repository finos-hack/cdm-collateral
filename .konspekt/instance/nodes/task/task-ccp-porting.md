```yaml
id: task-ccp-porting
type: task
title: Porting a cleared repo from one member to another
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
# Task: Porting a cleared repo from one member to another

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 30 of the workflow map. A member's cleared repo moves to another member by agreement of the two members and BANK-C (CDM party change, Novation intent); no client accounts.

**Design proposed 2026-11-13** in [[wp-adr-ccp-porting]], built without design questions at the project owner's
request (source `9313093366bdd34b988e9a2baa1c53ee3f5f44cc`). SME questions in [[task-sme-ccp-porting]].

**CDM check 2026-11-13, for the design.** CDM's party change of one cleared leg's counterparty from the leaving member
to the receiving member, with intent `Novation` and keyed by `GlobalKeyProcessStep`, validates and gives the new leg
with the receiving member and BANK-C; `Qualify_Novation` is false for it (it wants the whole trade to change hands,
G23). CDM has no record of a member's admission to a CCP; the admission reuses the rulebook's `CcpMember`.

**Built 2026-11-13** to [[wp-adr-ccp-porting]]:

- **cdm-ext** (`cdmx.collateral.ccp`): `CcpAdmission` and `CcpPorting`. `CcpRiskTest`, 2 tests.
- **Contracts**: `CcpClearing` gains `admitMember` (BANK-C, with the admission hash and share), `requestPorting`,
  `acceptPorting`, `approvePorting` (moves the payment and a buyer's securities and makes the receiving member the
  leg's party) and `refusePorting`, and the view `porting`. 2 hardhat tests.
- **Gateway** routes `/ledger/v1/ccp/members` (POST admit) and `/ledger/v1/ccp/clearings/:id/porting` (POST request,
  approving the payment or the securities first), `/accept`, `/approve`, `/refuse`.
- **Service** `CdmCcp.admission`, `verifyAdmission`, `portingEvent`, `porting`, `verifyPorting`; the rulebook check
  accepts an admitted member; BANK-C's documents also go to BANK-T; each party instructs from the porting's new leg once
  it is executed. `CdmCcpRiskTest`, 3 tests.
- **Console** admit BANK-T (BANK-C), the CCP card in BANK-T's console `#/live/T`, and the porting steps of a clearing
  row: port my leg to, accept, approve, refuse.
- **Live spec** `flow-ccp-porting`, after `flow-ccp-default`. `flow-ccp-membership` leaves the admitted BANK-T out of
  the rulebook's members.
