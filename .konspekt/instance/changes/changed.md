# Changed code (engineer layer)

Append-only log binding each committed code change to the entity it was about,
one row per (entity, commit, file) in commit order (top to bottom is the
timeline). `timestamp` is the ISO 8601 time the row was written. `commit` is an
opaque revision token (the git commit SHA in a git repo); `file` is a
repo-relative path that commit touched for that entity. The diff itself is not
stored here — it lives in version control, recoverable by `commit`.

Rows are written at commit time, so a row points at the commit made just before
it. Bookkeeping commits — those touching only `.konspekt/instance/**` — are
excluded.

| entity | commit | file | timestamp |
|--------|--------|------|-----------|
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .claude/hooks/load-mandatory-skills.sh | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .claude/hooks/require-binding.sh | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .github/workflows/konspekt-binding-audit.yml | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/OPERATING.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/binding-audit.json | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/changes/changed.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/commands/executed.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/edges/edges.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/nodes/goal/goal-test-konspekt-adoption.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/nodes/task/task-repo-setup-iteration.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/project.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/sources/b625196f2f2fd6cf48bdbf8771dabda407a20f1e.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/instance/transitions/transitions.md | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/lib/binding-audit.mjs | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/lib/conformance.mjs | 2026-10-15T02:15:43Z |
| task-repo-setup-iteration | 2bd570ec6bd32ebcff5a6168fd01260b87fed17f | .konspekt/spec/personas/engineer/AGENTS.md | 2026-10-15T02:15:43Z |
| goal-data-cdm-taxonomies-specs | 9c2b9aa13312a3ba058e8c135fe7b254c04e6206 | .gitignore | 2026-10-15T12:22:58Z |
| task-cdm-current-state-analysis | fd3851eb0240bbe8c060a51211f78cb1b831ff2c | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T12:33:08Z |
| task-cdm-current-state-analysis | 40a0f83e827a49331a05c384224f7d0eb5c921ce | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T22:31:52Z |
| task-cdm-current-state-analysis | 9c0a2e66faa60068677c123dbbf53b00aa79f96f | docs/analysis/cdm-csa-coverage-matrix.md | 2026-10-15T22:33:28Z |
