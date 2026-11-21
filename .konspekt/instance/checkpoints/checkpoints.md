# Checkpoints

Append-only log of every human `checkpoint`, one row per checkpoint in the order
written (`spec/architecture/SERIALIZATION.md` § Checkpoints). `entity` is the
conversation's active entity when the checkpoint was issued. `source` is the
`sources/` excerpt holding, verbatim, the command, the binding switches, the
pending proposals, and the open-items list. `venue` and `model` say where and on
which LLM the conversation ran. `by` is the human principal who issued it. At
open, `resume` reads the last row.

| timestamp | entity | source | venue | model | by |
|-----------|--------|--------|-------|-------|----|
| 2026-11-08T01:56:21Z | task-repo-purchase-repurchase | ni:///sha-256;C71b4_fgBqO8z56rZ0w_9mwif7V9JxEqBrGm3lbQyME | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-09T00:27:02Z | task-repo-roll | ni:///sha-256;CSWN8w4lO7_-ZT0duKRvG7AJFQ6x2VD22dY2oh1MzK8 | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-11T03:33:14Z | task-repo-buy-sell-back | ni:///sha-256;0hL_V1POCSNQlCBhogb-_ChxQTWZXDlbWVwIJDa1IQo | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-12T02:52:35Z | task-triparty-trade-start | ni:///sha-256;J3OCd5Pf3PiqXz-pPtwxDuskX71HNleCfFBtEcuWDrY | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-12T23:37:23Z | task-ccp-clearing | ni:///sha-256;T2Rbxoi0aS_bgCIkEXn378DstcnppM2WnaNBzX3ziOw | claude-code-cloud | claude-opus-5-5 | denisurusov |
| 2026-11-13T03:21:32Z | task-ccp-margin | ni:///sha-256;5_hBvUoF1L1NdOPVHcFA2wWadssBOfw40uSaUNFk1Os | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-13T03:23:59Z | task-ccp-margin | ni:///sha-256;e79AVjwMIAaXQGqr-G___D30xDctzDv5I_lBbStJ-9c | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-20T21:23:32Z | goal-tokenized-collateral | ni:///sha-256;XfCS8PZ-4UdC8EfE5dx4hYLtyO-6dGZWG5z8pyV8RqA | claude-code-cli | claude-opus-5-5 | denisurusov |
