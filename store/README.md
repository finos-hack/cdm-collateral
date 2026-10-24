# CDM payload store

Content-addressed store for CDM payloads (ADR `wp-adr-cdm-payload-carrier`). Each margin-call lifecycle step's CDM
document (canonical Rune JSON) lives here off-chain, keyed by its keccak-256 hash. The on-chain `cdmHash` committed by
the contract is the retrieval key and the integrity check: a reader fetches by hash and recomputes `keccak256(body)`
to confirm the document is the one the counterparty committed to. One shared instance serves the prototype's
participants — content addressing gives a global namespace by hash.

Part of `task-e2e-wiring`; the carrier for service-to-peer CDM exchange and the cumulative `MarginCallState` fold.

## API (`/store/v1`)

- `POST /store/v1/docs` — body `{ hash, document, parties }`. Stores `document` under `hash` after verifying
  `keccak256(utf8(document)) == hash` (content addressing). `parties` is the reader allowlist (the call's two
  counterparty addresses). Idempotent; re-posting merges the allowlist.
- `GET /store/v1/docs/:hash` — returns `{ hash, document }`. Requires an `X-Party` header whose address is on the
  document's allowlist, else `403`; `404` if unknown.
- `GET /store/v1/health` — `{ ok, count }`.

## Run

```
PORT=8300 DATA_DIR=./data node src/server.ts
```

Documents are written to `DATA_DIR` as `<hash>.json`.

## First-cycle reductions

- **Asserted identity.** The reader allowlist is checked against an `X-Party` header the caller asserts; it is not
  authenticated. Production would authenticate the caller (mutual TLS, signed requests).
- **Single shared instance.** Stands in for a production shared content-addressed store / IPFS with access control, or
  per-party stores. No replication or retention policy.
