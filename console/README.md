# Collateral Console (React)

Party console for the CDM collateral prototype, built from the approved HTML prototype
([`../ui-prototype/clickable.html`](../ui-prototype/clickable.html), decision `wp-adr-ux-scenario-grid`).
The console has two modes:

- **Live mode** (`#/live/...`, below): each party's console calls its own collateral service, which works through its
  ledger gateway and the contracts on the Besu network. This is the prototype; the live specs in
  `e2e/live.spec.ts` drive it.
- **Scenario mode** (`#/`, `#/s/...`): the original clickable prototype, with state mocked in the browser by a rule
  engine (`src/domain/engine.ts`) that stands in for the services and contracts. It needs no backend.

## Run

```bash
npm ci
npm run dev        # http://localhost:5173
```

Routes: `#/` scenario grid; `#/s/<scenario>/guided` and `#/s/<scenario>/free`; `#/live/A`, `#/live/B`, `#/live/T`,
`#/live/C` and `#/live/operator` (live mode, with the stack running: `../docs/setup/runbook-e2e.md`).

- **Grid:** agreement type × flow, with a CDM 7.6.0 coverage badge per cell (weakest capability score from the
  coverage matrices in `docs/analysis/`).
- **Guided mode:** the highlighted button in the acting party's console runs the next step; the guide shows why,
  the standard references, the CALM step numbers and the CDM coverage of the capabilities the step uses.
- **Free mode:** same starting positions; act as any party. Actions a contract would reject (pledge before the
  proposal is accepted, enforcement without a default on the oracle feed, a call below the minimum transfer amount,
  releasing more than the return amount) show the contract's reason in that party's console.

## Live mode

`#/live/A`, `#/live/B`, `#/live/T` (the triparty agent) and `#/live/C` (the CCP) run the console against that party's
collateral service, and `#/live/operator` against the oracle service's market data (`src/domain/liveApi.ts`,
`src/components/LiveConsole.tsx`; see `../docs/setup/runbook-e2e.md`). Since `v0.1-demo`:

- For a call that moved a Registered or Claim token (tMMF), the call row shows whether the record keeper has confirmed
  the step and the enforcement, and each register is shown against the ledger with its breaks
  (`task-console-record-keeper-completion`; live spec `flow-registered-collateral`).
- A Provenance card (`src/components/ProvenanceCard.tsx`) shows each token's provenance path as the party's service
  checks it from the ledger and the payload store, and seeds the fixture provenance (`task-document-provenance`; live
  spec `flow-provenance`).

## Layout

| Path | Contents |
|---|---|
| `src/domain/engine.ts` | Rule engine: margin call contract, collateral control contract, oracle feed, title transfer. Pure `apply(state, action)` |
| `src/domain/reference.ts` | Test parties, tokens, agreements (eligibility, haircuts, concentration limit, MTA) |
| `src/domain/coverage.ts` | CDM coverage scores per capability row and the grid layout |
| `src/scenarios/scenarios.ts` | Scenarios as data: each step is an engine action plus its explanation |
| `src/components/` | Grid, scenario view (guided and free), party console, ledger timeline |
| `src/domain/liveApi.ts`, `src/components/LiveConsole.tsx`, `src/components/ProvenanceCard.tsx` | Live mode: the HTTP and event-stream client of a party's collateral service, the party console, the provenance card |
| `e2e/` | Playwright: every scenario's guided steps against the production build, free-mode rejections, phone width; `e2e/live.spec.ts`, the 57 live specs against the running stack |

## Test

```bash
npm run typecheck
npm test                      # Vitest: engine rules, scenario outcomes, component click-throughs
npm run build
npm run test:e2e              # Playwright (starts `vite preview` on 4173)
CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # use a preinstalled Chromium instead of a downloaded one
```

CI: [`.github/workflows/console.yml`](../.github/workflows/console.yml).

All parties, tokens, prices and amounts are invented test data.
