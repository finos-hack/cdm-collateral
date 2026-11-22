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
updatedAt: 2026-11-22T20:56:04Z
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
