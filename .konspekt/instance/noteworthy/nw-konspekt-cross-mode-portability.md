```yaml
id: nw-konspekt-cross-mode-portability
kind: fact
review: accepted
provenance:
  conversationId: konspekt-cross-mode-portability
  sourceRef: d88914e2fa4bc037b42cbbff68355e13232ed16d
  contentHash: d88914e2fa4bc037b42cbbff68355e13232ed16d
  timestamp: 2026-11-04T02:34:39Z
  confidence: 0.85
createdAt: 2026-11-04T02:34:39Z
updatedAt: 2026-11-04T02:46:43Z
```
# Fact: konspekt state in the repository carries project context across Claude modes, not only across vendors

Observed by the project owner on 2026-11-04. Claude Code web (cloud sessions), Claude Code local (CLI and IDE) and
claude.ai chat each keep their own session history and memory:

- a local Claude Code session keeps its transcript and memory under `~/.claude/` on the machine that ran it;
- a Claude Code web session runs in a temporary container; files outside the pushed repository are deleted when the
  container is reclaimed (for example the gitignored binding marker in `.claude/.binding/`);
- claude.ai chat memory and project knowledge are read only by claude.ai chats.

None of the three reads another's conversations. Account-level claude.ai preferences are the observed exception: they
were present in the Claude Code web session of 2026-11-04.

The committed repository is the surface all modes with a checkout read. `.konspekt/instance/` (sources, transitions,
acceptances) and `AGENTS.md` / `OPERATING.md` are in it, so a session in any mode starts from the same accepted project
state. Evidence: on 2026-11-04 a Claude Code web session with no prior context wrote `docs/project-narrative.md` from
the graph alone, covering decisions made in earlier local and cloud sessions.

**Scope decision (project owner, 2026-11-04):** the graph stays repository-based. claude.ai chats have no repository
access and so cannot read the graph; `.konspekt/instance/` is not added to claude.ai project knowledge for now.

Feedback to the konspekt standard: [[task-konspekt-index-cross-mode-portability]].
