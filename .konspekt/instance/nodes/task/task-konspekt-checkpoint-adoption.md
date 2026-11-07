```yaml
id: task-konspekt-checkpoint-adoption
type: task
title: Re-seed the konspekt kit from the local standard to adopt checkpoint and resume
status: open
review: proposed
provenance:
  conversationId: konspekt-checkpoint
  sourceRef: 230f9e855232d941fc6e7cbd34dfdf92a93163da
  contentHash: 230f9e855232d941fc6e7cbd34dfdf92a93163da
  timestamp: 2026-11-07T22:13:30Z
  confidence: 0.8
createdAt: 2026-11-07T22:13:30Z
updatedAt: 2026-11-07T22:13:30Z
```
# Task: re-seed the konspekt kit from the local standard to adopt checkpoint and resume

Under [[goal-test-konspekt-adoption]]. The project owner asked on 2026-11-07 to re-seed the konspekt instance and its
files from the local konspekt repository (`finos-labs/konspekt` at `76c4430`), to start using its new checkpoint and
resume feature (konspekt PR #105, `task-session-checkpoint` there).

`setup/init.mjs --check` found two installed files behind the standard: the SessionStart hook
(`.claude/hooks/load-mandatory-skills.sh`, which now injects the last checkpoint) and the checker
(`.konspekt/lib/conformance.mjs`, which now checks the checkpoint log). Both were regenerated with `--add claude-code
--force` and `--add conformance --force`; neither had local edits. The scaffold templates were applied by hand, since
`--check` does not cover them: the "Checkpoint and resume" section of `.konspekt/OPERATING.md`, the checkpoint bullet
of the `AGENTS.md` stanza, and an empty `instance/checkpoints/checkpoints.md`. After the update all 26 installed files
match their templates and the instance validates.
