```yaml
id: nw-live-spec-balance-depletion
kind: constraint
review: proposed
provenance:
  conversationId: e2e-return-default
  sourceRef: 09a5861b69043c21bd8677f7d46c2ecc70bcdb07
  contentHash: 09a5861b69043c21bd8677f7d46c2ecc70bcdb07
  timestamp: 2026-11-01T16:45:36Z
  confidence: 0.8
createdAt: 2026-11-01T16:45:36Z
updatedAt: 2026-11-01T16:45:36Z
```
# Repeated live spec runs drain the pledgor's balances on the persistent chain

The live specs run against a chain that keeps its state between runs, and the deployment mints the opening balances
once (`contracts/scripts/deploy.ts`: bank-a 400,000 tUST, 15,000,000 tUSD). The specs never top them up.

Observed on 2026-11-01 against a local live stack: on the second full run of `console/e2e/live.spec.ts`, the VM spec
failed because A's tUSD balance (6,411,000 after the first run) was below the new VM call (USD 8,162,000), so
`settleByTransfer` reverted. The VM spec moves a random USD 1,000,000-9,999,000 in tUSD per run. The IM pledge
spec leaves its tUST in escrow, and the default-enforcement spec moves escrowed tUST to the secured party for good.
The two new specs use small amounts (at most a few thousand tUST per run) to slow this down, but they do not stop it.

A fresh chain (`live-e2e.sh reset`, or the CI runner) restores the balances. Options for [[task-live-flow-checkout-script]]
or [[task-e2e-remaining-flows]]: cap the VM amount by the deliverer's free balance, mint test balances from the
deployer before each run, or reset the chain before the scripted run. Each live spec also fails, not skips, under
`E2E_REQUIRE_STACK=1` when this happens.
