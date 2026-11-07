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
updatedAt: 2026-11-07T21:24:29Z
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
- **Agreement.** One IM CSA for the pair. Its counterparty roles are fixed by identity: Party1 is BANK-B and Party2 is
  BANK-A, as the baseline builds them today. A leg's pledgor is looked up by its role. For example, the CSA role of the
  pledgor in a substitution is Party2 when BANK-A pledges and Party1 when BANK-B pledges. The current fixed
  `pledgorRole Party1` for BANK-A does not match the agreement. Amendments keep the contract's terms per
  (pledgor, secured party), so an amendment applies to the leg it names.
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
- **Service and console.** Each party's collateral service serves both legs. The fixed `ROLE` setting goes away. The
  state endpoint returns the calls and escrow of each leg. The console shows the two legs side by side, each with the
  panels for the party's role on it.
- **Demo.** A new live spec: A and B each post a different IM amount on the same day, A defaults, B enforces against
  A's leg and reclaims its own. All 15 existing specs still pass. The work runs on a new contract set.

**Consequences.**
- One new contract function and event, and a new contract set. `CollateralControl` is 20,258 bytes deployed against
  the 24,576-byte limit, so the function fits.
- The fixed-role code paths in the service (`cfg.role`, `pledgorAndSecuredParty`, `Cdm.callBase`,
  `CdmSubstitution.PLEDGOR_ROLE`) and in the console (`isSecured`) become per leg.
- Substitution records name the pledgor's real CSA role, so BANK-A's substitutions state Party2 from now on.
