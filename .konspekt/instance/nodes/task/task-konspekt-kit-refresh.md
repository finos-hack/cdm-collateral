```yaml
id: task-konspekt-kit-refresh
type: task
title: Refresh the vendored konspekt kit from konspekt main
status: resolved
review: accepted
provenance:
  conversationId: konspekt-kit-refresh
  sourceRef: ni:///sha-256;6GeYYxRpR9dtmUBSchT0VVVfCSN768IF6r1HjN6e84k
  timestamp: 2026-11-22T19:59:28Z
  confidence: 0.75
createdAt: 2026-11-22T19:59:28Z
updatedAt: 2026-11-22T20:05:41Z
```
# Task: Refresh the vendored konspekt kit from konspekt main

Under [[goal-test-konspekt-adoption]]. Follows [[task-konspekt-re-seeding]].

Scope: regenerate this repository's projections of the konspekt kit from konspekt
`main` (`8a5c53e`), locally on branch `movement-ledger-anchors`, not pushed:

- `node <konspekt>/setup/init.mjs --add conformance --force` and
  `--vendor-persona engineer`, which bring in konspekt's review-unit changes
  (PR #122): the `direct` state and the `landed`/`match` columns in the
  checker and the engineer SPEC.md, and a binding audit that counts a squash or
  rebased commit as bound through `changes/review-units.md`.
- Keep `.github/workflows/konspekt-conformance.yml`'s no-push-to-main trigger
  (task-ci-actions-minutes).
- Leave the files whose drift is line endings only.
- Checks: `init.mjs --check`, `.konspekt/lib/validate.mjs`, `.konspekt/lib/binding-audit.mjs`.

**Done 2026-11-22**, locally on `movement-ledger-anchors`, not pushed: `ce8e1a7` refreshes `.konspekt/lib/conformance.mjs`,
`binding-audit.mjs` and the engineer persona from konspekt `8a5c53e`; `4f27a88` installs `.konspekt/lib/review-units.mjs`
from konspekt `5b47860`. Checks: validate 0 errors (1 pre-existing orphan warning, `node-app-setup`), binding audit clean,
fleet app tests 142/142. `init.mjs --check` still lists 5 files: four with line-ending drift only, and
`konspekt-conformance.yml` with this repository's no-push-to-main trigger.

**Accepted and resolved 2026-11-22** by the project owner (source `ni:///sha-256;Ro6tTs7j-8VzyJ6EAm276xnWWKiCFMo0ECxGewUmP-k`).
