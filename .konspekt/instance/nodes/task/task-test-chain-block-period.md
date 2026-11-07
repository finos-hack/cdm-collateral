```yaml
id: task-test-chain-block-period
type: task
title: Shorten the Besu block period of the test network to 1 s
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  contentHash: bd141dbb1d4a0af39adbee338b1c51f72f79914b
  timestamp: 2026-11-07T18:54:12Z
  confidence: 0.75
createdAt: 2026-11-07T18:54:12Z
updatedAt: 2026-11-07T18:54:12Z
```
# Task: shorten the Besu block period of the test network to 1 s

Split from [[task-live-spec-duration]] on the project owner's instruction (2026-11-07, "all three tasks"); the
evidence is in that task's findings.

The QBFT block period is 2 s (`besu/qbftConfigFile.json`, `besu/networkFiles/genesis.json`). A 1 s period saves about
0.5 s per transaction, but only after [[task-gateway-receipt-poll]]. It needs a new genesis: a chain reset and a
redeploy of the contracts and the live stack, locally, in CI and in the codespace. Do it after the other two.
