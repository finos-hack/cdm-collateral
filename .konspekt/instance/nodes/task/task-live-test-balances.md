```yaml
id: task-live-test-balances
type: task
title: Keep the live test parties funded across suite runs
status: open
review: proposed
provenance:
  conversationId: csa-section-b
  sourceRef: ae1744d7ebd05addf2d84102c8c1dd7f4eecb5c2
  contentHash: ae1744d7ebd05addf2d84102c8c1dd7f4eecb5c2
  timestamp: 2026-11-07T20:46:35Z
  confidence: 0.6
createdAt: 2026-11-07T20:46:35Z
updatedAt: 2026-11-07T20:46:35Z
```
# Task: keep the live test parties funded across suite runs

Found while measuring [[task-gateway-receipt-poll]] (2026-11-07). The live specs run on a persistent chain, and each
suite run moves value from the pledgor A to the secured party B: default enforcement and close-out take A's escrow,
VM calls and netting pay B. After four full runs on one contract set, A's free tUSD was 98,752 of the 6.4 million
minted at deploy, and pledge, transfer and settlement netting reverted with `ERC20InsufficientBalance`
(`0xe450d38c`), failing four specs for a reason unrelated to the change under test.

Today a fresh contract set (move `contracts/deployments/besu.json` aside, `scripts/live-e2e.sh up`) restores the
balances. Options: (a) the suite tops A up to a fixed balance before it starts (dev-only `mint` on the tokens), (b)
each spec that moves value to B moves it back at the end, or (c) keep redeploying. The choice changes how CI and the
codespace seed the chain.
