```yaml
id: wp-first-e2e-cycle
kind: milestone
timestamp: 2026-10-24T20:12:31Z
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: ni:///sha-256;JSEksj1FDFsJXCHBJMaVy5nn08H1Zgw6sEftIyRItKk
  timestamp: 2026-10-24T20:12:31Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 24bd077f551581c621a2d292b02f359e99aa3f75
    contentHash: 24bd077f551581c621a2d292b02f359e99aa3f75
createdAt: 2026-10-24T20:12:31Z
updatedAt: 2026-10-24T21:10:54Z
```
# Milestone: first complete end-to-end cycle

The first complete end-to-end cycle runs through every layer of the prototype. `flow-im-margin-call-pledge`
(full-agreement, single-token happy path) runs from the first step to the last — secured party issues, pledgor
agrees and proposes, secured party accepts, pledgor pledges — driven through the React console, the Java/Javalin
collateral workflow service, the TypeScript ledger gateway, and the Solidity contracts on the running Besu network,
with the per-participant SQLite store holding CDM message content and the chain holding call and pledge state.

This marks the point where the mocked console (`engine.ts`) is joined by a live path that exercises real services and
real on-chain state for one flow. Four of the five CALM flows and several first-cycle reductions remain
(`nw-e2e-first-cycle-scope`); `task-e2e-wiring` stays active.
