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
| 2026-11-08T01:56:21Z | task-repo-purchase-repurchase | 27b087a73564619b24cfb65a6c09288b97d50679 | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-09T00:27:02Z | task-repo-roll | d21fc48b36944a4fbd6e4d4026675ce3e2b3e297 | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-11T03:33:14Z | task-repo-buy-sell-back | b9cd17c9a39e6d6f90331802d858be9ada6a2eb9 | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-12T02:52:35Z | task-triparty-trade-start | 192657479c68616a6e61de3c8d5a76ab318901e6 | claude-code-cli | claude-opus-5-5 | denisurusov |
| 2026-11-12T23:37:23Z | task-ccp-clearing | 700466a205e2279df322aa7b80b8f4c974f634b0 | claude-code-cloud | claude-opus-5-5 | denisurusov |
| 2026-11-13T03:21:32Z | task-ccp-margin | 0ee82781230ef3cda0411cba0db2583b828ab9ca | claude-code-cli | claude-opus-5-5 | denisurusov |
