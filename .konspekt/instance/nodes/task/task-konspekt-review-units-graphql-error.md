```yaml
id: task-konspekt-review-units-graphql-error
type: task
title: Report a one-line error, not a stack trace, when review-units.mjs --api graphql cannot reach GraphQL
status: resolved
review: accepted
provenance:
  conversationId: konspekt-kit-refresh-rest-fallback
  sourceRef: ni:///sha-256;Y5OTivZPha4le_cJOqThz2JLJVHWYoHQIRPJP7Jxn7c
  timestamp: 2026-11-22T21:38:22Z
  confidence: 0.8
createdAt: 2026-11-22T21:38:22Z
updatedAt: 2026-11-23T01:23:54Z
```
# Task: report a one-line error, not a stack trace, when `review-units.mjs --api graphql` cannot reach GraphQL

Under [[goal-test-konspekt-adoption]], which reports problems with the konspekt kit back to konspekt. Found in
[[task-konspekt-kit-refresh-rest-fallback]]; the project owner asked for this task on 2026-11-22.

Observed in this repository's `.konspekt/lib/review-units.mjs` (konspekt `tools/review-units.mjs` at `73b98aa`): in
a session where GitHub GraphQL is refused, `node .konspekt/lib/review-units.mjs --check --api graphql` exits 1 and
prints Node's uncaught-error output: the `gh api graphql` command line and a stack trace. In `auto` mode the same
failure gives a one-line notice and falls back to REST. Cause: the `catch` around `graphqlUnits(repo)` (line 265)
rethrows the error when `api === "graphql"` (line 266), and nothing above it catches it.

Done when, with `--api graphql` forced and GraphQL unavailable, the tool prints one line on stderr naming the mode and
`gh`'s reason (for example `review-units: GitHub GraphQL unavailable (<reason>); --api graphql forces GraphQL, use
--api auto or --api rest`) and exits non-zero, with no stack trace. The fix belongs in konspekt
(`tools/review-units.mjs`), reported there as an issue or pull request; this repository takes it by re-vendoring the
tool, as in [[task-konspekt-kit-refresh-rest-fallback]].

**Accepted 2026-11-22** by the project owner, with its decomposes edge (source `ni:///sha-256;C3WoiSeBXK7F8X3cwdh02iFP0iCEUdZaIBVYuSv7EuU`). Reported to konspekt 2026-11-22, as the project owner directed: task atom `task-review-units-graphql-error` in the konspekt instance (`finos-labs/konspekt` `05ea9a0`, `review: proposed`, under `investigation-task-pr-map`), and a konspekt checkpoint on it (`a6e0186`) so that it is offered when konspekt work resumes. This task closes when the fix is re-vendored here.

**Resolved 2026-11-22** by the project owner (source `ni:///sha-256;TQSVIbbj6Y8DWBRBoxTWV49PMzDNZsts63TD77wR-KE`), before the fix is re-vendored: the defect is reported to konspekt (task atom `task-review-units-graphql-error`, `finos-labs/konspekt` `05ea9a0`) and is tracked there. At resolution the vendored `.konspekt/lib/review-units.mjs` still rethrows under `--api graphql`.
