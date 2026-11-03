```yaml
id: wp-adr-oracle-prices-on-request-ratings-offchain
kind: decision
subtype: adr
timestamp: 2026-11-03T15:31:39Z
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 9fb38c6c305f7d6f3e87894c56f343b421c5df99
  contentHash: 9fb38c6c305f7d6f3e87894c56f343b421c5df99
  timestamp: 2026-11-03T15:31:39Z
createdAt: 2026-11-03T15:31:39Z
updatedAt: 2026-11-03T15:31:39Z
```
# ADR: The oracle feed carries prices only, published on request; ratings stay off-chain

The oracle service (`services/oracle`) keeps mock market data per collateral token: a price and a rating. It
writes prices to the `OracleFeed` contract through the market operator's gateway (the only gateway holding the
publisher key) on request (`POST /oracle/v1/prices/publish`) and whenever the operator edits a price
(`PUT /oracle/v1/market-data/{symbol}`); there is no periodic publication. Ratings stay in the oracle's mock market
data and are not written on chain. Each party reads prices from the feed through its own gateway
(`GET /ledger/v1/prices`, `GET /ledger/v1/prices/:token`).

**Context.** `flow-oracle-update` described the oracle publishing "NAV / price and rating data" to the on-chain
feed, but `OracleFeed` stores prices and default status only. Writing ratings on chain would need a contract change
and a redeployment of every chain.

**Consequences.** No contract change. The flow description and the `oracle-to-gateway` relationship in
`architecture/prototype.architecture.json` say prices only. A rating check on chain (gap G11, [[task-cdm-gap-closure]])
would revisit this decision. On-request publication keeps the live specs deterministic: a spec changes a price and
restores it. Rejected alternatives: on-chain ratings now; periodic republication on a timer.

Accepted by the project owner on 2026-11-03 (both recommended options chosen).
