```yaml
id: task-live-spec-balance-aware-amounts
type: task
title: Size the live specs' call amounts to the pledgor's free on-chain balance
status: abandoned
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: ni:///sha-256;0hlFQV8xd73G9okbxKfW6xFMfpOx1pkfo8VxH7RNZ8c
  timestamp: 2026-11-01T22:01:07Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 1b285cf65903a9859ebebd69d0887fc0271041c0
    contentHash: 1b285cf65903a9859ebebd69d0887fc0271041c0
createdAt: 2026-11-01T22:01:07Z
updatedAt: 2026-11-12T00:00:26Z
```
# Task: size the live specs' call amounts to the pledgor's free balance

Found while verifying [[task-live-flow-checkout-script]] on 2026-11-01. Every run of the live specs in
`console/e2e/live.spec.ts` moves tokens on the chain: the VM spec transfers tUSD title from the pledgor to the secured
party, and the IM spec moves tUST into escrow. Both pick a random amount from 1,000,000 to 9,999,000 USD so that the
call's label is unique on a persistent chain. On the long-lived Windows chain the pledgor had 4,185,000 tUSD and
22,000 tUST free. VM calls above that balance reverted in `settleByTransfer` and were left `agreed`.

The project owner chose option (a): the specs read the pledgor's free balance and size each call to fit, so they keep
passing on a long-lived chain without a reset. To think through before building:
- where the balance is read from: the console's on-chain balance table, the service, or the gateway;
- how to keep the label unique when the amount range shrinks; the label is how a spec finds its own call;
- what a spec does when the free balance is below the margin call's minimum transfer amount (MTA): skip with a
  clear reason, or fail;
- whether the IM spec's escrowed tUST ever returns. A return flow would release it once
  [[task-e2e-remaining-flows]] adds one;
- the same rule for the flows that the cloud session adds to `live.spec.ts`.

Rejected options, kept for the record: (b) topping up the pledgor's test tokens in deploy or test setup; (c) running
`live-e2e.sh reset` when it happens, which deletes the chain and the stored documents.

Re-parented on 2026-11-03 from [[task-e2e-wiring]] (resolved with a narrowed scope) to [[goal-end-to-end-flow]] by the project owner (source `2d89f9ce09676a084c6672f5a9ba1b887d6112c5`).

The project owner closed as abandoned the task on 2026-11-11 (source `9331a6a4b0aafc5103c06651a1a61309c35e4f3e`: "4. b"): out of date: [[task-live-test-balances]] (resolved) keeps the test parties funded across runs instead.
