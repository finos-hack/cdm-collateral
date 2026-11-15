```yaml
id: task-ci-actions-minutes
type: task
title: Cut the GitHub Actions minutes each row spends
status: resolved
review: accepted
provenance:
  conversationId: gmsla-rebate
  sourceRef: ni:///sha-256;MkiMPYZRrEaQRBWxbmX6k4r9J2ipKjghlZpI2z9Hv1U
  timestamp: 2026-11-11T23:11:59Z
  confidence: 0.9
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 23cb42d62c48a430012c9c96c6f18443f9941fbf
    contentHash: 23cb42d62c48a430012c9c96c6f18443f9941fbf
createdAt: 2026-11-11T23:11:59Z
updatedAt: 2026-11-11T23:11:59Z
```
# Task: cut the GitHub Actions minutes each row spends

Under [[goal-end-to-end-flow]]. The project owner reported on 2026-11-11 that the repository is running out of GitHub
Actions minutes. Measured with `gh run list` over the last 60 runs: `e2e-live-stack` took about 21 minutes a run and
ran twice per row (on the pull request and on the push to `main` at merge), about 42 of the roughly 50 minutes a row
cost; the other workflows together about 10 minutes per row, half of it on the push to `main`.

The project owner chose (source `23cb42d62c48a430012c9c96c6f18443f9941fbf`: "1a for now. 2. yes 3. not yet"):
- `e2e-live-stack` runs only on demand (`workflow_dispatch`). The full live suite runs locally before every pull
  request and its result is in the PR body. This changes [[wp-adr-ci-runs-live-specs]] for now.
- `cdm-ext`, `console`, `gateway` and `konspekt conformance` no longer run on the push to `main`; the pull request run
  checks the same commit, since branches are rebased on `main` before their PR.
- Rows are not batched into fewer PRs, for now.
