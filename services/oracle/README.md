# Oracle service

Off-chain oracle endpoints (architecture node `oracle-service`), shared and run by the market data operator. Java 21 +
Javalin (ADR `wp-adr-java-cdm-stack`). It writes to the oracle feed contract only through the operator's own ledger
gateway (`NODE=mkt`, relationship `oracle-to-gateway`). That gateway signs with the publisher key, the only key
`OracleFeed` accepts for writes.

Scope: the default notice of `flow-default-enforcement`, the market data and price publication of
`flow-oracle-update`, and, since `v0.1-demo`, the record keeper of the tokens whose authoritative record is kept off
the ledger (`TransferAgent`, `task-authoritative-record-settlement-enforcement`). The transfer agent keeps the tMMF
register: for each ledger transaction that moves tMMF it updates the register and confirms on chain through the
operator gateway (`RecordKeeperRegister`, interim rules REG-1, REG-2 and REG-4). At start it rebuilds the register from
the transfers already confirmed. A paused agent confirms nothing, so a live spec can show a step that waits for it.

| Method | Path (`/oracle/v1`) | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| POST | `/defaults` | `{party: 0x…, inDefault?: boolean (default true), notifiedBy?: string}`. Forwarded to the operator gateway's `POST /ledger/v1/oracle/defaults`; returns after the feed write is mined |
| GET | `/defaults/{party}` | default status on the feed, read through the operator gateway |
| GET | `/market-data` | the operator's market data: per token the price and rating |
| PUT | `/market-data/{symbol}` | edit a token's price or rating; a price change is published to the feed |
| POST | `/prices/publish` | publish the current price of one token (`{symbol}`) or of all tokens to the feed |
| GET | `/register` | the tokens the transfer agent keeps and whether it is paused |
| GET | `/register/{symbol}` | the register of one token: holders and units, `paused`, and the last error if any |
| PUT | `/register/paused` | `{paused: boolean}`: pause or resume the transfer agent's confirmations (used by the live specs) |

Environment: `PORT` (default 8100), `GATEWAY_URL` (default `http://localhost:8200`, the operator's gateway),
`TRANSFER_AGENT_PERIOD_MS` (default 1000, how often the transfer agent reads new transfers).

```bash
mvn -q -f services/oracle/pom.xml package   # unit tests (stub gateway) + target/oracle-service.jar
```
