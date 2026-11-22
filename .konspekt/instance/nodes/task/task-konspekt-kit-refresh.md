```yaml
id: task-konspekt-kit-refresh
type: task
title: Refresh the vendored konspekt kit from konspekt main
status: open
review: proposed
provenance:
  conversationId: konspekt-kit-refresh
  sourceRef: ni:///sha-256;6GeYYxRpR9dtmUBSchT0VVVfCSN768IF6r1HjN6e84k
  timestamp: 2026-11-22T19:59:28Z
  confidence: 0.75
createdAt: 2026-11-22T19:59:28Z
updatedAt: 2026-11-22T19:59:28Z
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
