```yaml
id: task-ci-deploy-dropped-tx
type: task
title: Diagnose a deploy transaction that is never mined in the CI live stack
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: 372780d60f7248052397745dfba1afcf3e3d00f9
  contentHash: 372780d60f7248052397745dfba1afcf3e3d00f9
  timestamp: 2026-11-06T21:19:41Z
  confidence: 0.7
createdAt: 2026-11-06T21:19:41Z
updatedAt: 2026-11-06T21:20:00Z
```
# Task: diagnose a deploy transaction that is never mined in the CI live stack

On PR #28 the `live-stack` job of [[task-ci-live-e2e-stack]] failed in "Build, deploy and start the live stack": the
deploy script waited 3 minutes for the receipt of the tMMF mint to bank-a (`0xe83390…`) and timed out. After block 14
every Besu node reported `0 tx / 0 pending`, so no node held the transaction. The rerun passed. The cause is unknown; a
nonce gap (the transaction held as a future transaction) is a hypothesis the CI log could not confirm, because the
deploy script printed no nonces and the Besu log was the last 200 INFO lines per node.

The project owner chose (2026-11-06, source `372780d60f7248052397745dfba1afcf3e3d00f9`) to add diagnostics in a separate small PR:

- `contracts/scripts/deploy.ts` assigns nonces itself and waits 60 s for each receipt. On a timeout it prints the
  transaction's nonce, the account's latest and pending nonces, the block number, `eth_getTransactionByHash` and
  `txpool_besuTransactions`. If the transaction is mined it reads the receipt; if the node does not know it, it sends it
  again once with the same nonce; if the node holds it, it waits once more.
- On failure, the CI "Besu logs" step prints the last 1000 log lines per node, `txpool_besuStatistics`,
  `txpool_besuTransactions` and the deployer's latest and pending nonces on each node.

## Progress 2026-11-06T21:20:00Z

Built on branch `deploy-dropped-tx` (commit `493672b`). A deploy with a 1.5 s receipt timeout
(`DEPLOY_RECEIPT_TIMEOUT_MS=1500`) went through the timeout path for every transaction: the mined case read the
receipt and the pooled case waited once more; the resend case (the node does not know the transaction) was not
reached, since the local chain dropped nothing. The live stack restarted on that deployment (earlier set kept as
`besu.pre-deploy-diag.json`) and the live specs passed 11/11. The CI step ran locally against the four nodes.
The Besu log level is unchanged (INFO); a finer level for the transaction pool alone needs a log4j configuration
per node.
