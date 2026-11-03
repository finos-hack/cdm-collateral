# Oracle service

Off-chain oracle endpoints (architecture node `oracle-service`), shared and run by the market data operator. Java 21 +
Javalin (ADR `wp-adr-java-cdm-stack`). It writes to the oracle feed contract only through the operator's own ledger
gateway (`NODE=mkt`, relationship `oracle-to-gateway`). That gateway signs with the publisher key, the only key
`OracleFeed` accepts for writes.

Current scope: the default notice of `flow-default-enforcement`. Prices, NAV, ratings and the mock market data source
belong to `flow-oracle-update` and are not served yet (`task-e2e-remaining-flows`).

| Method | Path (`/oracle/v1`) | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| POST | `/defaults` | `{party: 0x…, inDefault?: boolean (default true), notifiedBy?: string}`. Forwarded to the operator gateway's `POST /ledger/v1/oracle/defaults`; returns after the feed write is mined |
| GET | `/defaults/{party}` | default status on the feed, read through the operator gateway |

Environment: `PORT` (default 8100), `GATEWAY_URL` (default `http://localhost:8200`, the operator's gateway).

```bash
mvn -q -f services/oracle/pom.xml package   # unit tests (stub gateway) + target/oracle-service.jar
```
