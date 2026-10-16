# Test framework (plan)

Part of `task-local-environment-setup`. **Plan only — nothing built yet.** Tool choices marked *(assumption)* can be
replaced by equivalents.

## Principles

1. **Every CALM flow is an end-to-end test.** The five flows in [`prototype.architecture.json`](prototype.architecture.json)
   are the acceptance scenarios; each transition becomes an assertion. A flow without a passing test is not done.
2. **Every accepted ASR and ADR has at least one test that would fail if it were violated** (table below).
3. **Tests run the same way on Windows and in CI.** One command per layer, and one command for everything.
4. **On-chain state is asserted, not assumed.** End-to-end tests read balances and pledge states through the ledger
   gateway after each flow.

## Layers

| Layer | What is tested | Tool | Runs against |
|---|---|---|---|
| Smart contracts — unit | Margin call contract (issue, respond, settle; only the right party's key may change state), collateral control contract (pledge only against an agreed call, return, enforce; every forbidden transition reverts), test tokens (transfer restrictions, identifier metadata), oracle feed (only the publisher can write) | Hardhat + Mocha/Chai, `solidity-coverage` *(assumption)* | Hardhat in-memory EVM (fast) |
| Smart contracts — property | Invariants: pledged tokens leave the contract only by return or enforce; the sum of balances is constant; enforce is impossible without a default; total pledged against a call never exceeds its agreed amount | Hardhat with fast-check, or Foundry invariant tests *(assumption)* | In-memory EVM |
| Python services — unit | Eligibility, haircuts, concentration limits, margin call lifecycle state machine, partial agreement and dispute handling, CDM object construction | pytest, Hypothesis for property tests, coverage.py | In process |
| Python services — API | Each REST endpoint against its OpenAPI schema; error cases | pytest + FastAPI TestClient; Schemathesis for schema-driven fuzzing *(assumption)* | In process, gateway and oracle stubbed |
| Ledger gateway — unit | Instruction mapping, signing, finality wait, event decoding, adapter interface | Vitest *(assumption)* | Mocked JSON-RPC |
| Ledger gateway — integration | Real transactions and events | Vitest + Testcontainers for Node *(assumption)* | Besu 26.9.0 container |
| Contract tests between services | Workflow ↔ oracle, workflow ↔ gateway and workflow ↔ peer workflow request/response shapes stay compatible | OpenAPI schemas checked in both directions (Schemathesis / generated clients) | In process |
| Party console — component | Screens per role (pledgor, secured party, market operator) | Vitest + React Testing Library *(assumption)* | jsdom |
| End to end | The five CALM flows with **N participant stacks** (console, service, store, gateway each) and their consoles in parallel browser contexts | Playwright *(assumption)* | Full local stack (Besu container + services) |
| Architecture | CALM document is valid; every flow transition has a test | `calm validate --strict`; a script that maps flow ids to Playwright test titles | Repository files |

## End-to-end scenarios

| CALM flow | Playwright scenario | Parties (console instances) |
|---|---|---|
| `flow-im-margin-call-pledge` | Full agreement; partial agreement with dispute (only the agreed part settles); multi-token pledge | 2 (pledgor, secured party) |
| `flow-oracle-update` | Operator publishes; feed contract holds the new values | 1 (operator) |
| `flow-revaluation-top-up` | NAV drop → shortfall → top-up call → pledge | 3 (operator, pledgor, secured party) |
| `flow-return` | Return with both approvals; return without approval is rejected | 2 |
| `flow-default-enforcement` | Enforcement after default; enforcement before default is rejected | 2 |
| Multi-party load | N pledgor/secured-party pairs run the IM call flow concurrently; each party's store reconciles with the chain and with its counterparty's store | 2N (configurable) |
| Participant isolation | A party's store holds no other party's agreements; a gateway refuses an instruction it cannot sign with its own key; a peer message from an unknown party is rejected | 3 |

## Traceability to ASRs and ADRs

| Requirement / decision | Test that would fail if violated |
|---|---|
| `concept-asr-ledger-neutrality` | Gateway adapter contract test runs against an in-memory fake adapter as well as Besu; no workflow test imports Besu-specific code |
| `concept-asr-cdm-data-layer` | API tests validate request/response payloads as CDM objects (serialise and parse with the CDM model) |
| `concept-asr-onchain-asset-identity` | Token metadata (ISIN/CUSIP, DTI) matches the asset registry for every deployed token |
| `concept-asr-settlement-finality` | Workflow updates a balance only after the gateway reports a finalized block; a test injects an unconfirmed event and expects no update |
| `concept-asr-onchain-call-state` | Partial-agreement scenario: the disputed amount is recorded on the call but never pledged; the CDM content received by the counterparty matches the on-chain hash, and a tampered payload is rejected |
| `wp-adr-margin-call-state-onchain` | Contract tests: pledge without an agreed call reverts; pledge above the agreed amount reverts; only the called party's key can respond; only the caller's key can issue |
| `wp-adr-prototype-ledgers` | Integration suite runs against the Besu container |
| `wp-adr-im-segregation` | Contract property tests: no path moves pledged tokens except return and enforce |
| `wp-adr-per-participant-services` | Participant isolation scenario; pledge and return transactions are signed by the expected party's key |

## Commands (planned)

```
npm run test:contracts      # Hardhat unit + property tests
pytest                      # Python services
npm run test:gateway        # gateway unit + integration (needs Docker)
npm run test:console        # UI components
npm run test:e2e            # Playwright, starts N participant stacks, N=3 by default (E2E_PARTIES=N)
npm run test:all            # everything above + calm validate --strict
```

CI: GitHub Actions on Ubuntu runs `test:all` on every push (Docker available on hosted runners).
