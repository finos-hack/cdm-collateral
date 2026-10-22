```yaml
id: task-e2e-wiring
type: task
title: End-to-end wiring (contracts, gateway, services)
status: open
review: accepted
provenance:
  conversationId: console-dev
  sourceRef: d1de6644506267cf9033a70a5d1893adc44926fd
  contentHash: d1de6644506267cf9033a70a5d1893adc44926fd
  timestamp: 2026-10-17T20:56:54Z
  confidence: 0.8
createdAt: 2026-10-17T20:56:54Z
updatedAt: 2026-10-18T15:05:37Z
```
# Task: End-to-end wiring (contracts, gateway, services)

Build the runtime layers between the mocked console and the running Besu network so the five CALM flows in
`architecture/prototype.architecture.json` run against real services and real on-chain state. Scope (decided
2026-10-17, source `d1de6644506267cf9033a70a5d1893adc44926fd`): the **full stack**, all participants, all five flows.

Service language (ADR `wp-adr-java-cdm-stack`, accepted 2026-10-18): the oracle service and the collateral workflow
service are **Java 21 with Javalin**, building CDM objects with the Java `cdm-ext` extension (CDM 7.7.0 Java
distribution, `org.finos.cdm:cdm-java`). This superseded the earlier Python plan (`nw-cdm-stay-on-python`). The
Solidity contracts (Hardhat 3) and the ledger gateway remain the shared TypeScript toolchain — Vitest and
`npm run test:gateway`, Java services under `mvn test` (`architecture/testing.md`).

Layers to build, in dependency order:

1. **Solidity contracts** — margin call contract, collateral control contract, tokenized collateral (ERC-20 test
   tokens with identifier metadata), oracle feed contract. Toolchain **Hardhat 3** (newer line; one TS toolchain
   shared with the gateway via viem bindings). Unit and property tests per `architecture/testing.md`; deploy script
   to the running Besu; address registry the services read.
2. **Ledger gateway** (TypeScript) — adapter interface (`concept-asr-ledger-neutrality`) + Besu adapter. Signs with
   its own participant's node key (**reused** from `besu/<node>/data/key`), submits over that node's JSON-RPC,
   subscribes to contract events, reports finalized events to its workflow service (`concept-asr-settlement-finality`).
3. **Oracle service** (Java 21, Javalin) + **mock market data source** — serves prices/NAV/ratings, publishes to the
   oracle feed contract through the gateway.
4. **Collateral workflow service** (Java 21, Javalin) + **workflow store** (SQLite) — REST API; builds CDM objects
   with the Java `cdm-ext` extension; peer messaging between participant services; submits ledger instructions
   through the gateway.
5. **End-to-end harness** — Playwright drives N consoles against the full stack and asserts on-chain state through
   the gateway; one scenario per CALM flow transition.
6. **Orchestration** — per-participant service stacks and contract deploy brought up alongside the Besu network; the
   `test:*` commands in `architecture/testing.md`.

The console-wiring step (replace the in-browser `engine.ts` mock with live calls to its own participant's workflow
service, gateway and oracle) stays under `task-react-console`; this task delivers the services it calls.
