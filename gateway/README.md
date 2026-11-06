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
| POST | `/calls/:id/withdraw` | `{cdmHash}`: the calling party withdraws an unanswered call (`flow-call-cancellation`) |
| POST | `/calls/:id/cancellation` | `{cdmHash}`: either party requests the cancellation of an answered call that is not settled |
| POST | `/calls/:id/cancellation/decision` | `{accept, cdmHash}`: the other party accepts (the call is cancelled and a proposal not delivered is void) or refuses |
| POST | `/calls/:id/pledge` | approve each proposal asset and pledge (IM settle, multi-asset) |
| POST | `/calls/:id/transfer` | approve each proposal asset and settle a VM call by title transfer |
| POST | `/calls/:id/return` | release escrowed IM for an agreed return call |
| POST | `/calls/:id/return-transfer` | approve and transfer equivalent VM back for a return call |
| POST | `/calls/:id/enforce` | seize the pledgor's escrowed IM once the oracle feed records its default (secured party key) |
| POST | `/close-outs` | `{closeOutId, pledgor, owed, cdmHash}`: close out after the pledgor's default; the control contract applies escrowed IM to `owed` and returns the surplus (secured party key, `flow-close-out-netting`) |
| GET | `/close-outs?party=0x…` | close-outs the party is in (from `ClosedOut` logs): owed, applied value, statement hash |
| POST | `/substitutions` | `{substitutionId, securedParty, original, substitute, cdmHash}`: request a substitution of escrowed IM (pledgor key, `flow-substitution`) |
| POST | `/substitutions/:id/decision` | `{consent, cdmHash}`: consent to or refuse a substitution (secured party key) |
| POST | `/substitutions/:id/settle` | approve each substitute asset, then settle: substitute into escrow, originals back (pledgor key) |
| GET | `/substitutions?party=0x…` | substitutions the party is in (from `SubstitutionRequested` logs) |
| GET | `/substitutions/:id` | on-chain substitution state, original and substitute assets |
| GET | `/substitutions/:id/steps` | the substitution's steps in chain order, each with its CDM hash, block and block time (fold input) |
| POST | `/amendments` | `{amendmentId, pledgor, securedParty, terms: [{token, eligible, haircutBps}], beforeHash, cdmHash}`: propose an amendment of the pair's terms, chained from its agreement hash (either party's key, `flow-agreement-amendment`) |
| POST | `/amendments/:id/decision` | `{consent, cdmHash}`: the other party consents (the haircut terms apply to the pair) or refuses |
| GET | `/amendments?party=0x…` | amendments the party is in (from `AmendmentProposed` logs), in chain order, with state and terms |
| GET | `/amendments/:id` | on-chain amendment: parties, proposer, state, beforeHash, amendment and decision hashes, haircut terms |
| GET | `/pair-terms?pledgor&securedParty` | the pair's agreement hash, pending amendment, and each registry token's eligibility and haircut as the contract applies them |
| POST | `/interest` | `{interestId, pledgor, cashToken, amount, cdmHash}`: state the Interest Amount on cash collateral; for a positive amount approve the cash token first, and the contract pays the pledgor (secured party key, `flow-interest-on-cash`) |
| POST | `/interest/:id/pay` | approve and pay a negative Interest Amount (pledgor key) |
| GET | `/interest?party=0x…` | interest statements the party is in (from `InterestStated` logs), with the current state |
| GET | `/interest/:id` | on-chain interest statement: parties, cash token, amount, state, statement hash |
| GET | `/escrow-at?pledgor&securedParty&block` | escrowed tokens and feed prices at the end of a block (the CDM portfolio before a substitution step) |
| POST | `/oracle/defaults` | `{party, inDefault}` to the oracle feed; served only by the operator's gateway (`NODE=mkt`, publisher key) |
| GET | `/defaults/:party` | default status on the oracle feed |
| GET | `/party-calls?party=0x…` | calls whose `from` or `to` is this party (from `CallIssued` logs) |
| GET | `/calls/:id` | on-chain call state |
| GET | `/calls/:id/steps` | the call's lifecycle steps in chain order, each with its CDM hash (fold input), and for its CDM ledger anchor (G25): transaction hash, contract, network, status (`Final` once mined on QBFT, or `Reverted`) and the other events of the same transaction (`txLogs`) |
| GET | `/calls/:id/proposals/:pid/{state,assets}` | proposal state / proposed assets |
| GET | `/pledged?pledgor&securedParty&token` | escrowed balance |
| GET | `/balance?token&owner` | free token balance |
| GET | `/events` | Server-Sent Events: one chain subscription (eth_subscribe over the Besu ws) fanned out |

Amounts and quantities cross the wire as decimal strings (they exceed the JSON safe-integer range). The event stream
carries a lightweight change signal per on-chain step (`callId`, `step`, `cdmHash`), plus the `Returned`, `Enforced`,
`ClosedOut`, `Substitution{Requested,Decided,Settled}`, `Interest{Stated,Settled}` and `Amendment{Proposed,Decided}` events
of the collateral control contract and `DefaultPublished` of the oracle feed (`event`, `callId`, `closeOutId`,
`substitutionId`, `interestId` or `amendmentId`, and/or `party`);
the workflow service records the latter and relays everything to the console so state changes push instead of being
polled.
