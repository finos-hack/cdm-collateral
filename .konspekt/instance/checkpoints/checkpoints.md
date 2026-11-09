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
