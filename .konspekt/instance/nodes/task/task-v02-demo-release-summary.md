```yaml
id: task-v02-demo-release-summary
type: task
title: v0.2-demo release summary
status: open
review: proposed
provenance:
  conversationId: v02-demo-release-summary
  sourceRef: ni:///sha-256;xAW0L5hnTNwr61J1XP5el8MYc7zYDGS4OZN19oaICag
  timestamp: 2026-11-22T20:56:04Z
  confidence: 0.8
createdAt: 2026-11-22T20:56:04Z
updatedAt: 2026-11-22T21:13:42Z
```
# Task: v0.2-demo release summary

Under [[goal-adoption]].

Scope: bring the human-facing markdown documents and `docs/index.html` up to date with every
change merged to `main` since tag `v0.1-demo` (`268ea0c`, 2026-11-15), on branch
`v02-demo-release-summary`:

- `docs/analysis/` — SME question ledger, gap register, CDM workflow task map, findings,
  defects, coverage matrices, business case;
- `docs/sme-questions.html`, `docs/gap-register.html`, `docs/index.html`;
- component READMEs (`README.md`, `contracts/`, `gateway/`, `services/*/`, `console/`,
  `cdm-ext/`), `docs/setup/runbook-e2e.md`, `docs/presentations/project-narrative.md`;
- a release summary of the changes from `v0.1-demo` to `v0.2-demo`.

**Done 2026-11-22**, on branch `v02-demo-release-summary` (commit `e8ddf56`), for review:
`docs/releases/v0.2-demo.md`; the task map, gap register (G41), SME question ledger (REG-8, PROV-1, PROV-2 interim
decisions), component READMEs, runbook and project narrative updated; the `gaps`, `sme`, `besu` and `coverage` slides
updated, `docs/index.html`, `docs/sme-questions.html` and `docs/gap-register.html` regenerated, and `intro_deck.pdf`
re-rendered. Tests run: contracts 147 passing; `cdm-ext` 332 and collateral service 204, 0 failures. The live suite
was not run.

**Project owner's answers, 2026-11-22** (source `ni:///sha-256;MQNx5vh8ba__s7udHjHyUEPwZD5jhL8KDGl3GHWrJJc`): the reasons for the G40 and G41 rows in the task
map's "Gaps with no workflow row" table are accepted; G41 is partial (21 closed, 8 partial, 1 deferred, 9 open, 2 out
of scope); the project narrative (5 to 22 November), `architecture/README.md` and `console/README.md` are rewritten in
this task; a pull request is opened, and `v0.2-demo` is tagged on its merge commit.
