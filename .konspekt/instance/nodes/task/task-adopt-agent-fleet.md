```yaml
id: task-adopt-agent-fleet
type: task
title: Adopt the konspekt agent fleet
status: resolved
review: accepted
provenance:
  conversationId: fleet-port
  sourceRef: 98439d29e3489c9547264c7d125ced58ceaf03b5
  contentHash: 98439d29e3489c9547264c7d125ced58ceaf03b5
  timestamp: 2026-10-22T23:29:00Z
  confidence: 0.9
createdAt: 2026-10-22T23:29:00Z
updatedAt: 2026-10-22T23:29:00Z
```
# Task: Adopt the konspekt agent fleet

Bring the konspekt agent fleet into this repository as a konspekt adopter, under
`goal-test-konspekt-adoption`. The fleet is the "one human reviews many agents"
model: N proposer worktrees writing to their own outbox branches, one
deterministic committer that verifies and folds proposals onto canonical as
`review: proposed`, and a human who blesses.

Decision (source `98439d29e3489c9547264c7d125ced58ceaf03b5`): vendor the
committer engine into `.konspekt/fleet/app/` so it runs against this repo's own
`.konspekt/lib` and needs no konspekt checkout; an adopter must run the engine
locally. The engine's only external dependency, `lib/conformance.mjs`, is
byte-identical to konspekt's, so vendoring is a copy plus an import-path rewire.

First cut: the committer plus one proposer, the spec-writer — CDM's artifact
corpus (gap registers, coverage matrices, conceptual models) is document-shaped,
so a spec-writer has native work to propose. Presentation-writer and
skill-builder are deferred.

Parts:
1. Vendored engine at `.konspekt/fleet/app/`; 81 app tests pass in CDM. Done.
2. Fleet config `.konspekt/fleet/config/fleet.json`.
3. Neutral skills under `.konspekt/agents/skills/` (fleet-proposer-common,
   fleet-spec-writer, fleet-committer) mirrored to `.claude/skills/`.
4. Canonical worktree on branch `fleet` (sibling outer dir `../cdm-fleet/`), the
   spec-writer outbox, and an end-to-end fold/bless run.
