```yaml
id: task-konspekt-index-cross-mode-portability
type: task
title: Add cross-mode portability to konspekt's index.html
status: open
review: accepted
provenance:
  conversationId: konspekt-cross-mode-portability
  sourceRef: d88914e2fa4bc037b42cbbff68355e13232ed16d
  contentHash: d88914e2fa4bc037b42cbbff68355e13232ed16d
  timestamp: 2026-11-04T02:34:39Z
  confidence: 0.9
createdAt: 2026-11-04T02:34:39Z
updatedAt: 2026-11-04T02:50:57Z
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
