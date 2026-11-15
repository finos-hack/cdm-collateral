```yaml
id: task-konspekt-index-cross-mode-portability
type: task
title: Add cross-mode portability to konspekt's index.html
status: resolved
review: accepted
provenance:
  conversationId: konspekt-cross-mode-portability
  sourceRef: ni:///sha-256;-lLwoIar8HH6jxxEZeH42SGBPMqqTm_j4heO9-acA9A
  timestamp: 2026-11-04T02:34:39Z
  confidence: 0.9
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: d88914e2fa4bc037b42cbbff68355e13232ed16d
    contentHash: d88914e2fa4bc037b42cbbff68355e13232ed16d
createdAt: 2026-11-04T02:34:39Z
updatedAt: 2026-11-04T02:59:07Z
```
# Task: add cross-mode portability to konspekt's index.html

Under [[goal-test-konspekt-adoption]] (feed what this adopter learns back to the konspekt standard). Requested by the
project owner on 2026-11-04.

Update `index.html` in the konspekt repository (github.com/finos-labs/konspekt) so the benefits it states include
portability between modes of one vendor's tools (Claude Code web, Claude Code local/IDE, claude.ai chat), next to
portability between vendors. Basis and evidence: [[nw-konspekt-cross-mode-portability]]. State the limit too: a mode
without repository access (claude.ai chat) cannot read the graph.

The konspekt repository is not attached to this project's sessions; the change is made there, through a pull request
or by the project owner. The page's current wording has not been read yet (unverified).

## Progress — 2026-11-04

Pull request https://github.com/finos-labs/konspekt/pull/102 (branch `claude/index-cross-mode-portability`, commit
`3f76163`, DCO signed off by the project owner at their instruction): a "For you" benefit item, "one project state
across cloud, CLI and IDE sessions", and an extended FAQ answer under "Why not the model's built-in memory?" that
states the limit for a chat with no repository access. Both slides were rendered at 1600×900 with no overflow. The
task stays open until the pull request is merged.

## Resolution — 2026-11-04

finos-labs/konspekt#102 was merged by the project owner at 2026-11-04T02:58:40Z (head `1b301ae`). Besides the
`docs/index.html` change, the PR binds it to konspekt's `task-presentation-refresh` (`53b4a80`) and fixes the
`audit` check failing on `main` by binding `99c67af` (`ROADMAP.md`) to `task-promo-video` (`1b301ae`). Resolved on
merge, as the project owner instructed.
