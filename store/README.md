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

- `POST /store/v1/docs` — body `{ hash, document, parties }`. Stores `document` under `hash` after verifying
  `keccak256(utf8(document)) == hash` (content addressing), else `400`. `parties` is the reader allowlist (the call's
  two counterparty addresses); the authenticated caller must be on it, else `403` (a party writes only documents it is
  a counterparty to). Idempotent; re-posting merges the allowlist.
- `GET /store/v1/docs/:hash` — returns `{ hash, document }`. The authenticated caller's address must be on the
  document's allowlist, else `403`; `404` if unknown.
- `GET /store/v1/health` — `{ ok, count }`. Unauthenticated.

## Run

```
PORT=8300 DATA_DIR=./data PARTY_TOKENS='{"<token-a>":"0x<address-a>","<token-b>":"0x<address-b>"}' node src/server.ts
```

Documents are written to `DATA_DIR` as `<hash>.json`.

## First-cycle reductions

- **Shared-secret authentication.** The bearer token is a shared secret and the store is the trusted verifier.
  Production would authenticate the caller with mutual TLS or signed requests.
- **Single shared instance.** Stands in for a production shared content-addressed store / IPFS with access control, or
  per-party stores. No replication or retention policy.
