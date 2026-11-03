```yaml
id: task-react-console
type: task
title: React party console
status: resolved
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 91117ab560e058b945bc3eb3e35fa977f99a88b3
  contentHash: 91117ab560e058b945bc3eb3e35fa977f99a88b3
  timestamp: 2026-10-16T23:07:09Z
createdAt: 2026-10-16T23:07:09Z
updatedAt: 2026-10-17T00:22:35Z
```
# Task: React party console

Build the party console in React from the approved HTML prototype (`artifact-clickable-ui-html`,
`wp-adr-ux-scenario-grid`): scenario grid with CDM coverage, guided and free modes, scenarios as data files that
also drive the end-to-end tests. Mocked state first; later wired to the workflow services and ledger gateway.

Parked 2026-10-17T00:22:35Z (source `c559e965491f960d039091cb857d61d9cb85ac25`): the project owner cannot reach the console in the codespace yet. The console builds
and passes CI; `console/serve.sh` starts it on codespace start. Resume by checking it runs in the codespace.
