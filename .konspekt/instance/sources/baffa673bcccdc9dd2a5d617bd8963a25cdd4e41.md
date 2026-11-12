## Maintainer

## Design options

These are for `task-triparty-trade-end`. Option (a) is the one I recommend in each case.

1. **Who settles:** (a) the agent prepares the trade-end document and records its hash, then the giver settles in one transaction: it pays the Repurchase Price against the release; (b) the giver settles alone, without the agent.
2. **Date:** (a) only on the Repurchase Date, taken from the agent's business date; (b) also early.
3. **Cash:** (a) the Repurchase Price goes from the giver to the receiver in the same transaction; (b) through an account at the agent.
4. **Collateral:** (a) the whole holding returns to the giver's free account at the agent, from where the giver can withdraw it; (b) straight to the giver's wallet.
5. **Pending substitution at the Repurchase Date:** (a) it blocks trade end until it is answered or withdrawn; (b) it is withdrawn automatically.
6. **CDM record:** (a) a cdm-ext `TripartyTradeEnd` document: the repo, CDM's repurchase event, and a cdm-ext release that lists one transfer per held asset plus the cash transfer, which must match the holding; (b) CDM's repurchase event only.
7. **Verification:** (a) the giver and receiver recompute it from the chain at the block before, as for substitution.
8. **Contract:** (a) `prepareTradeEnd` (agent) and `settleRepurchase` (giver), with the repo ending as `repurchased`, needing a new deployment; (b) one agent call that pulls the cash from the giver.
9. **Open repos left by earlier runs:** (a) the live spec also ends every other settled repo under the B-giver terms, at each repo's Repurchase Date, then terminates the terms, so runs stop accumulating repos; (b) only its own repo.
10. **Live spec:** (a) `flow-triparty-trade-end`: B's repo reaches its Repurchase Date, T prepares, B settles 500,486 tUSD to A against the release, and B withdraws.

## User

1. All a 2. Yes 3. Start building row 24 and make sure to keep workflow task markdown up to date
