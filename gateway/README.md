# Ledger gateway

Ledger-neutral gateway for the CDM collateral prototype (ASR `concept-asr-ledger-neutrality`, ADR
`wp-adr-prototype-ledgers`). One instance per participant: it holds that participant's Besu node key only, signs every
write with it, submits the margin-call lifecycle to the contracts, reads on-chain state, and (via the cycle runner)
asserts settlement. Besu adapter first; the `LedgerAdapter` interface in `src/besu.ts` is the seam a second ledger
(Canton) would implement.

Part of `task-e2e-wiring`. TypeScript run directly by Node 24 (type stripping); the only dependency is `viem`.

## Prerequisites

- Besu network running (`besu/start-network.sh`, or `docker compose up -d` in `besu/`).
- Contracts deployed: `npm run deploy:besu` in `contracts/` (writes `contracts/deployments/besu.json`).

## Commands

```
npm install            # once, installs viem
npm run cycle          # drive flow-im-margin-call-pledge through two gateways and assert on-chain state
NODE=bank-a PORT=8201 npm run serve   # HTTP gateway for one participant
NODE=bank-b PORT=8202 npm run serve
```

`NODE` is a Besu node id (`bank-a`, `bank-b`, `mkt`, `bank-c`); the key is read from `besu/<NODE>/data/key`.

## HTTP API (`/ledger/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | node id and signing account |
| POST | `/calls` | issue a margin call (margin call contract) |
| POST | `/calls/:id/response` | respond (full / partial / dispute) |
| POST | `/calls/:id/proposals` | propose collateral; returns `proposalId` |
| POST | `/calls/:id/decision` | accept or reject a proposal |
| POST | `/calls/:id/pledge` | approve the control contract and pledge |
| GET | `/party-calls?party=0x…` | calls whose `from` or `to` is this party (from `CallIssued` logs) |
| GET | `/calls/:id` | on-chain call state |
| GET | `/calls/:id/proposals/:pid/{state,assets}` | proposal state / proposed assets |
| GET | `/pledged?pledgor&securedParty&token` | escrowed balance |
| GET | `/balance?token&owner` | free token balance |

Amounts and quantities cross the wire as decimal strings (they exceed the JSON safe-integer range).
