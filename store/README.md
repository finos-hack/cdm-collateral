# CDM payload store

Content-addressed store for CDM payloads (ADR `wp-adr-cdm-payload-carrier`). Each margin-call lifecycle step's CDM
document (canonical Rune JSON) lives here off-chain, keyed by its keccak-256 hash. The on-chain `cdmHash` committed by
the contract is the retrieval key and the integrity check: a reader fetches by hash and recomputes `keccak256(body)`
to confirm the document is the one the counterparty committed to. One shared instance serves the prototype's
participants — content addressing gives a global namespace by hash.

Part of `task-e2e-wiring`; the carrier for service-to-peer CDM exchange and the cumulative `MarginCallState` fold.

## Authentication

Every `/store/v1/docs` request carries `Authorization: Bearer <token>`. `PARTY_TOKENS` maps each token to the party
address it stands for; the store resolves the caller's address from the token and never from a header the caller
asserts. An absent or unknown token returns `401`. With no tokens configured the store fails closed: every docs
request returns `401`. `orchestrate.mjs` provisions one token per party from the deployment registry and passes each
party's token to its collateral service as `STORE_TOKEN`.

## API (`/store/v1`)

Every `docs` request carries `Authorization: Bearer <token>`. The store resolves the token to a party address through
`PARTY_TOKENS`; a missing or unknown token returns `401`.

- `POST /store/v1/docs` — body `{ hash, document, parties }`. Stores `document` under `hash` after verifying
  `keccak256(utf8(document)) == hash` (content addressing; `400` on mismatch). `parties` is the reader allowlist (the
  call's two counterparty addresses); the caller's own address must be in it, else `403`. Idempotent; re-posting
  merges the allowlist.
- `GET /store/v1/docs/:hash` — returns `{ hash, document }`. `403` if the caller's address is not on the document's
  allowlist; `404` if unknown.
- `GET /store/v1/health` — `{ ok, count }`.

## Run

```
PORT=8300 DATA_DIR=./data PARTY_TOKENS='{"<token-a>":"0x<bank-a address>","<token-b>":"0x<bank-b address>"}' node src/server.ts
```

`PARTY_TOKENS` is a JSON map from bearer token to party address. The store fails closed: without it, startup prints
`store: no PARTY_TOKENS configured …` and every `docs` request returns `401`. `orchestrate.mjs` mints one token per
party on each run, passes the map here and each party's token to its collateral service (`STORE_TOKEN`); see
[`../docs/setup/runbook-e2e.md`](../docs/setup/runbook-e2e.md).

Documents are written to `DATA_DIR` as `<hash>.json`.

## First-cycle reductions

- **Shared-secret authentication.** Callers authenticate with per-party bearer tokens and the store is the trusted
  verifier. Tokens are minted per `orchestrate.mjs` run and never persisted. Production would use mutual TLS or signed
  requests.
- **Single shared instance.** Stands in for a production shared content-addressed store / IPFS with access control, or
  per-party stores. No replication or retention policy.
