```yaml
id: wp-adr-two-way-im
kind: decision
subtype: adr
timestamp: 2026-11-07T21:24:29Z
review: proposed
provenance:
  conversationId: two-way-initial-margin
  sourceRef: 57ae0e7cbeb65ec44ba5e313131802c0d6f53c10
  contentHash: 57ae0e7cbeb65ec44ba5e313131802c0d6f53c10
  timestamp: 2026-11-07T21:24:29Z
  confidence: 0.7
createdAt: 2026-11-07T21:24:29Z
updatedAt: 2026-11-07T21:54:28Z
```
# ADR: two-way initial margin runs as two legs, each identified by its calls; a pledgor reclaims its leg when its secured party defaults

For [[task-two-way-initial-margin]], following the project owner's choices of 2026-11-07 (source `57ae0e7cbeb65ec44ba5e313131802c0d6f53c10`: "1. a 2. yes 3.
yes 4. yes 5. go ahead"). The contracts already keep the legs apart: escrow is `_pledged[pledgor][securedParty][token]`,
and calls carry `from` and `to` (within [[wp-adr-im-segregation]]).

- **Leg.** A leg is the ordered pair (pledgor, secured party). Each party is the pledgor on one leg and the secured
  party on the other. The amounts differ and the legs are not netted.
- **Leg from the call.** Call ids stay as they are. The leg of a call follows from its kind and direction. For an IM
  delivery call, the caller is the secured party and the called party is the pledgor. For an IM return call, the caller
  is the pledgor. The CDM `MarginCallBase -> partyRole` header (one Pledgor, one SecuredParty) is built from the call,
  replacing the fixed BANK-A Pledgor and BANK-B SecuredParty. Steps that do not start from a call name the party's role
  on the leg they act on: issuing an IM call, revaluation and top-up, interest on cash, substitution, close-out and
  allocation.
- **Flows per leg.** Pledge, return, revaluation and top-up, substitution, interest on cash, close-out, allocation and
  the escrow part of the ledger reconciliation, which produces one escrow record per leg. VM, settlement netting and
  portfolio reconciliation stay as they are.
- **Agreement.** The contract keeps agreement terms and amendments per (pledgor, secured party), so each leg has its
  own view of the pair's IM CSA. That view is the baseline CDM sample with the leg's secured party as Party1 and its
  pledgor as Party2, the same mapping the one-direction baseline used. An amendment applies to the leg it names. The
  pledgor's role in a substitution is therefore Party2 on either leg. The fixed `pledgorRole Party1` for BANK-A did not
  match the agreement and is corrected. Whether one CSA should state the elections per party instead is a question for
  the SME.
- **Default recovery (contract change).** `CollateralControl.reclaim(reclaimId, securedParty, cdmHash)` is called
  with the pledgor's key and returns the pledgor's whole escrow on that leg. It requires the oracle feed to record the
  secured party as defaulted, and it reverts when nothing is pledged. It anchors the hash of the CDM record of the
  return (`cdmHash`) and emits `Reclaimed`. This follows how segregated IM comes back from the custodian under the
  2018 IM CSA (the Pledgor's Rights and Remedies; the SME confirms the clause in [[task-sme-two-way-im-rules]]). `enforce` and `closeOut`
  are unchanged. They already name the pair, so the non-defaulting party enforces or closes out the defaulting
  party's leg and then reclaims its own.
- **CDM.** cdm-ext types and functions take the roles from the call's `partyRole` and the portfolio's payer and
  receiver, so they need no change for direction. A reclaim is recorded as a CDM event that moves the leg's positions
  from the secured party back to the pledgor. It follows `cdmx.collateral.enforcement` with the parties reversed and
  the condition that the secured party is the Defaulting Party.
- **Service and console.** Each party's collateral service serves both legs, and the fixed `ROLE` setting goes away.
  Steps that start from a call take the leg from the call. Revaluation and the agreement view take the leg's pledgor
  as a parameter, defaulting to the leg A pledges on. Close-out and interest act on the leg the counterparty pledges
  on, and substitution and reclaim on the leg the party pledges on. The state endpoint returns each call's leg and
  each leg's escrow, and the ledger reconciliation returns one escrow record per leg. The console has a leg selector
  that starts on the leg A pledges on and gives the role panels of the party's role on the selected leg.
- **Demo.** A new live spec: A and B each post a different IM amount on the same day, A defaults, B enforces against
  A's leg and reclaims its own. All 15 existing specs still pass. The work runs on a new contract set.

**Consequences.**
- One new contract function and event, and a new contract set. `CollateralControl` grew from 20,258 to 21,007 bytes
  deployed, under the 24,576-byte limit.
- The fixed-role code paths in the service (`cfg.role`, `pledgorAndSecuredParty`, `Cdm.callBase`,
  `CdmSubstitution.PLEDGOR_ROLE`) and in the console (`isSecured`) become per leg.
- Substitution records name the pledgor's real CSA role, so BANK-A's substitutions state Party2 from now on.
