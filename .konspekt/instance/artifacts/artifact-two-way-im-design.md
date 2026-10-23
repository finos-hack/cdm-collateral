```yaml
id: artifact-two-way-im-design
name: Two-way initial margin design
kind: doc
location: docs/architecture/two-way-initial-margin.md
createdAt: 2026-10-23T00:00:00Z
updatedAt: 2026-10-23T00:00:00Z
review: accepted
provenance:
  sourceRef: a33642b39ae267df90f5838679e595f9b64eb2fb
  contentHash: a33642b39ae267df90f5838679e595f9b64eb2fb
  conversationId: spec-writer-2026-10-23
  timestamp: 2026-10-23T15:39:17.930Z
  confidence: 0.55
```
# Artifact: Two-way initial margin design

Design note for `task-two-way-initial-margin`, to live at `docs/architecture/two-way-initial-margin.md` (not yet
written; this record proposes it). It closes the open question of how the prototype represents two-way IM: the task
says "design for it now, demo one direction first", and `architecture/README.md` says only that "roles are per
pledge"; neither states how the two legs are identified, kept apart, returned, and enforced.

Content the document will settle:

1. **One leg per direction.** For an agreement and a margin date there are two IM calls and, after acceptance, two
   pledges: A→B (A pledgor, B secured party) and B→A. Each leg runs the full IM flow independently (issue, respond,
   propose, accept, pledge). Leg amounts differ and are never netted.
2. **Call identity.** `callId` is caller-chosen `bytes32` in `MarginCall.issueCall`; the document fixes its derivation
   as a hash of (agreement id, margin date, pledgor, secured party, call kind) so the two legs cannot collide and each
   service can recompute the other leg's id. The agreement id and margin date stay off-chain inside the CDM content
   bound by `cdmHash`.
3. **Escrow already separates the legs.** `CollateralControl` pools pledges in
   `_pledged[pledgor][securedParty][token]`, so the A→B and B→A legs are distinct balances; `pledge`, `returnCollateral`
   and `enforce` read the direction from the call (`c.to` / `c.from`). No contract change is needed to hold two legs.
4. **Return per leg.** A return call targets one leg's escrow pool and is agreed by that leg's secured party.
5. **Default (open gap).** `enforce` lets the non-defaulting secured party seize the defaulter's leg. The non-defaulter's
   own IM sits in the other leg's pool, whose secured party is the defaulter, and `returnCollateral` requires the
   secured party's key. The current contracts give no path to recover it after a default. The document records this
   gap and the options (release on `oracle.isDefaulted(securedParty)` by the pledgor's key, or as part of `enforce`).
6. **Workflow service and console.** Store and API key a call by (agreement, margin date, direction); the console shows
   both legs of an agreement side by side. Demo order stays one direction first.

Checked on canonical: `task-two-way-initial-margin`, `architecture/README.md` (two-way IM line),
`docs/analysis/collateral-conceptual-model.md` (IM posted both ways into segregation),
`contracts/contracts/{MarginCall,CollateralControl,CollateralTypes}.sol`, and `artifacts/` (no existing two-way IM
artifact). Not checked: the workflow service and console code for a one-direction assumption.
