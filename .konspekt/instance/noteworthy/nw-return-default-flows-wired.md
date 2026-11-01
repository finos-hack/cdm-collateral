```yaml
id: nw-return-default-flows-wired
kind: fact
review: proposed
provenance:
  conversationId: e2e-return-default
  sourceRef: 09a5861b69043c21bd8677f7d46c2ecc70bcdb07
  contentHash: 09a5861b69043c21bd8677f7d46c2ecc70bcdb07
  timestamp: 2026-11-01T16:45:36Z
  confidence: 0.85
createdAt: 2026-11-01T16:45:36Z
updatedAt: 2026-11-01T16:45:36Z
```
# flow-return and flow-default-enforcement wired, with live specs passing on a local stack

Scope (b) of [[task-e2e-remaining-flows]], on branch `e2e-return-default` (commits `2e0e130`..`11497bc`), not merged.

**setDefault fit.** `OracleFeed.setDefault` fits `flow-default-enforcement` as written. Transitions 3-5 route the
default from the secured party's service to the oracle service and on to the market operator's gateway, and the oracle
publisher is the mkt key (`contracts/scripts/deploy.ts`). No contract access control and no accepted ADR changed.

**flow-return.** The contract, gateway route, service endpoint and console actions already existed. One gap against
transition 14: the gateway subscribed only to MarginCall events, so `Returned` (CollateralControl) was never pushed.
A second gateway subscription now pushes `Returned`, `Enforced` and `DefaultPublished`; each service records them
and folds a call's MarginCallState when its `SettleCall` step arrives.

**flow-default-enforcement.** New: gateway routes `POST /calls/:id/enforce`, `POST /oracle/defaults` (served only by
the mkt gateway) and `GET /defaults/:party`; a Java/Javalin oracle service limited to default notices
(`services/oracle`, per [[wp-adr-java-cdm-stack]]; prices stay with `flow-oracle-update`); the mkt gateway (8200) and
the oracle (8100) in `orchestrate.mjs`, `scripts/live-e2e.sh` and `e2e-live-stack.yml`; a service endpoint that
sends the notice and then `enforce(callId)`; and the console action "Declare default & enforce" on a settled IM call
with collateral in escrow. Declaring and enforcing is one console action, because the CALM flow has one console
submission (transitions 1-2) before both chain writes.

**Tests.** Oracle service: 6 JUnit tests against a stub gateway. Console: 11 new vitest tests (54 in total pass).
Live: one Playwright spec per flow in `console/e2e/live.spec.ts`; each spec sets up escrow through the service API,
drives the flow in the consoles and asserts on-chain state through the gateways. Against a local live stack (Docker
Besu in a cloud container) all four live specs passed on the first run, and the two new specs passed on three
further runs. `e2e-live-stack.yml` has not run with these changes; it builds and starts the stack but does not run the
specs ([[task-live-flow-checkout-script]]).

Not done here: the "Done when" of [[task-e2e-remaining-flows]] also needs `flow-oracle-update` and
`flow-revaluation-top-up`. The task's status is unchanged.
