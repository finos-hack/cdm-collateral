```yaml
id: task-konspekt-re-seeding
type: task
title: konspekt re-seeding
status: resolved
review: accepted
provenance:
  conversationId: konspekt-re-seeding
  sourceRef: ni:///sha-256;X0_bvuPkEF43h_xYFW1wq0w2UHOa9SqSGz3M_QbiEUw
  timestamp: 2026-11-15T14:55:58Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: be7815334afc8921538e8467c7c61c0a00381ad4
    contentHash: be7815334afc8921538e8467c7c61c0a00381ad4
createdAt: 2026-11-15T14:55:58Z
updatedAt: 2026-11-15T16:29:10Z
```
# Task: konspekt re-seeding

Under [[goal-test-konspekt-adoption]]. Created by the project owner (source `be7815334afc8921538e8467c7c61c0a00381ad4`) on branch `konspekt-re-seeding`.
Scope: migrate this instance to the `ni:///sha-256` references of konspekt `main` (`d23ac1a`, PR #112), by the procedure in konspekt `setup/README.md` § Migrating an adopter instance to `ni:` references.

**Done 2026-11-15** (uncommitted on `konspekt-re-seeding`):

- Kit refreshed from konspekt `d23ac1a`: `--add conformance|notify|claude-code --force` (adds `lib/locator-reach.mjs`) and
  `--vendor-persona engineer`. The three `.github/workflows/konspekt-*.yml` and `.claude/settings.json` restored:
  `konspekt-conformance.yml` keeps the no-push-to-main trigger (task-ci-actions-minutes); the others differed only in
  line endings.
- `tools/migrate-ni.mjs --repo-url https://github.com/denisurusov/cdm-collateral --ref main`: 244 sources and 383 commands
  copied to `sha-256/`, 627 `deprecated.md` rows, 270 entities, 918 transition cells, 7 checkpoint cells, 483 executed-log
  cells; `project.md` gained the git `store` block and `locators.allow`.
- A stray blank line in `transitions.md` (line 1056, from `ea620110`) made the script read the next row as a table header
  and skip the 457 rows after it; the checker reported them as `legacy-ref-after-migration`. The blank line was removed and
  the script re-run.
- Checks: a second run changes no file; `validate.mjs` 0 errors (1 pre-existing orphan warning, `node-app-setup`);
  binding audit clean.
- Rechecked against konspekt `11626c1` (PR #113, the `migrate-ni.mjs` blank-line fix, `nw-migrate-ni-table-blank-line`):
  `--check` unchanged and a re-run changes no file. This session's commands are recorded in `commands/executed.md`.

**Accepted and resolved 2026-11-15** by the project owner (source `ni:///sha-256;IdkCgyJ2Trhzht84jTS8Ij9ktdaSml3_G3dewCNlJTA`).
- The repository moved to `finos-hack/cdm-collateral`; the `store` resolve URLs in `project.md` and the `origin` remote now point there.
- Follow-up on branch `repo-move-links`: the docs, deck slides, setup guides, architecture renderer and `nw-ci-live-stack-first-run` link to `finos-hack/cdm-collateral`. `intro_deck.pdf` regenerated with the new address.
