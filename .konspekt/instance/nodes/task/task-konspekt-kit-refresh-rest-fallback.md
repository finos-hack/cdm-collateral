```yaml
id: task-konspekt-kit-refresh-rest-fallback
type: task
title: Refresh review-units.mjs from konspekt main for the REST fallback
status: open
review: accepted
provenance:
  conversationId: konspekt-kit-refresh-rest-fallback
  sourceRef: ni:///sha-256;hvZtMGBcgRmOfnaMzR0IwF1htyo2uGy3kt_XmQvMwhI
  timestamp: 2026-11-22T21:21:07Z
createdAt: 2026-11-22T21:21:07Z
updatedAt: 2026-11-22T21:21:07Z
```
# Task: refresh review-units.mjs from konspekt main for the REST fallback

Under [[goal-test-konspekt-adoption]]. Follows [[task-konspekt-kit-refresh]].

Refresh `.konspekt/lib/review-units.mjs` from konspekt `main` (`24c52b4` or later), which adds
`--api auto|graphql|rest`: GraphQL by default, REST with a one-line stderr notice when GraphQL is unavailable, so a
session with REST-only GitHub access can derive the review-unit log.

Steps, as written by the project owner:

1. Clone `finos-labs/konspekt` read-only next to this repository.
2. `node <konspekt>/setup/init.mjs --check` from the repository root: exactly two DRIFT lines expected,
   `.konspekt/lib/review-units.mjs` and `.github/workflows/konspekt-conformance.yml`; stop and report if there are
   others.
3. Copy only the tool (`<konspekt>/tools/review-units.mjs` to `.konspekt/lib/review-units.mjs`); do not run
   `init.mjs --add conformance --force`, which would restore the push-to-main trigger of `konspekt-conformance.yml`
   removed on purpose ([[task-ci-actions-minutes]]). Re-run `--check`: only the workflow drift remains.
4. `.konspekt/OPERATING.md` § Review units: add the GraphQL-with-REST-fallback sentence and the `--api` override.
5. Verify: `validate.mjs`, `review-units.mjs --check` (auto) and `--check --api rest`, both reporting the log up to
   date (REST/GraphQL parity for CDM's pull requests).
6. Land by branch rebased on `main` and pull request, signed off; bind the code commit in `changes/changed.md`,
   record the commands in `commands/`; after the merge regenerate the review-unit log and commit it; confirm the
   binding audit and conformance checks are green, then ask the project owner before resolving.

Accepted, with its decomposes edge, by the project owner on 2026-11-22 (source `ni:///sha-256;hvZtMGBcgRmOfnaMzR0IwF1htyo2uGy3kt_XmQvMwhI`).
