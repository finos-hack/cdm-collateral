```yaml
id: nw-ci-live-stack-steps
kind: constraint
review: rejected
provenance:
  conversationId: e2e-wiring
  sourceRef: ni:///sha-256;lJakXPIzh3h2jGHX1cYA-Q-LUc69oH_Pv7IOoVE9jus
  timestamp: 2026-10-25T13:12:45Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: e3bf4d0de78a40ac0ad2235e99f061beda13e158
    contentHash: e3bf4d0de78a40ac0ad2235e99f061beda13e158
createdAt: 2026-10-25T13:12:45Z
updatedAt: 2026-11-01T00:10:00Z
```
# CI full-stack e2e: steps to run the one live flow completely

`task-ci-live-e2e-stack` runs a single live flow completely in CI: `flow-im-margin-call-pledge`, the flow the
harness `console/e2e/live.spec.ts` already drives (issue → agree → propose → accept → pledge, settled on-chain).
It is not skipped as it is under the current `console` workflow.

The live spec's `beforeAll` probes `http://localhost:8001/api/v1/context` and calls `test.skip` when the collateral
service is unreachable. Playwright's `webServer` serves only the console preview (port 4173); it starts no backend.
The backend chain the flow needs (collateral services 8001/8002 → ledger gateways 8201/8202 → Besu) is the
`orchestrate.mjs` precondition set. Standing that up in CI is these eight steps:

1. **Docker + Besu QBFT bring-up** — start `besu/docker-compose.yml` and wait for the network.
2. **cdm-ext install** — `mvn install` of `cdm-ext/` so `local.cdmx:cdmx-java` is in the local Maven repository
   before the collateral jar builds.
3. **JDK 21 + Maven setup and jar build** — `mvn -DskipTests package` in `services/collateral/`
   (`maven.compiler.release=21`), producing `target/collateral-service.jar`.
4. **Contracts install + deploy** — `npm ci` in `contracts/` then `npm run deploy:besu` (reads `besu/mkt/data/key`,
   runs the Hardhat deploy), producing `contracts/deployments/besu.json` (the address registry the services read).
5. **Gateway and store installs + startup** — `npm ci` in each of `gateway/` and `store/` (separate npm packages),
   then launch `store`, `gw-a`, `gw-b`, `svc-a`, `svc-b` with the per-party store bearer tokens.
6. **Non-interactive orchestration** — `orchestrate.mjs` is written for local use: it also starts the console dev
   server (5173, redundant with Playwright's 4173 preview) and blocks until `SIGINT`. CI needs background startup,
   a readiness wait on 8001/8002, then teardown — a CI-shaped variant or a flag.
7. **Guard against silent green** — the spec skips (not fails) when 8001 is unreachable, so a CI job that stands up
   the stack but gets a port or URL wrong still passes. The job must assert the stack it started is reachable so a
   failed bring-up fails the job.
8. **Separate workflow or job with a broader path filter** — covering `besu/**`, `contracts/**`, `gateway/**`,
   `store/**`, `services/**`, `cdm-ext/**`, not only `console/**`.

Scope: the full `task-e2e-wiring` surface (oracle service, the other agreement families, per-party stores) stays out
of scope ([[nw-e2e-first-cycle-scope]]); this task runs only the one flow the live harness already asserts
([[artifact-e2e-live-harness]]), end to end.
