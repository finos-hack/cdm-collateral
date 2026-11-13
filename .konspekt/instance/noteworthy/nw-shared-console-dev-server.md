```yaml
id: nw-shared-console-dev-server
kind: fact
review: accepted
provenance:
  conversationId: ccp-rows-28-30
  sourceRef: 90ff59e14ac7b691c96db66b4e6263e7d794f410
  contentHash: 90ff59e14ac7b691c96db66b4e6263e7d794f410
  timestamp: 2026-11-13T02:42:43Z
  confidence: 0.6
createdAt: 2026-11-13T02:42:43Z
updatedAt: 2026-11-13T02:45:20Z
```
# One console dev server serves every party's console, where wp-adr-per-participant-services gives each its own

[[wp-adr-per-participant-services]] lists a party console in each participant's stack. `orchestrate.mjs` starts one
Vite dev server on port 5173, and each party's console is a route on it (`#/live/A`, `#/live/B`, `#/live/T`,
`#/live/C`) that calls only that party's service. Nothing else in the stack departs from the ADR:

- Each collateral service keeps its own SQLite workflow store (`services/collateral/src/main/java/collateral/Store.java`),
  as the ADR says. The one shared `store` process is the CDM payload store, shared by design
  ([[wp-adr-cdm-payload-carrier]]).
- The fifth Besu node, `ccp`, joins as a non-validator ([[wp-adr-ccp-membership]]), so the ADR's four validators
  still hold.

Raised by an analysis of why `scripts/live-e2e.sh` starts so many processes, which named the shared store as a second
difference; the code shows it is not one. Options: amend the ADR to say the consoles may share one dev server, or start
one dev server per party.
