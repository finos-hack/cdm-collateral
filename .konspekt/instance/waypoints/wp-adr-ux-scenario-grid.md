```yaml
id: wp-adr-ux-scenario-grid
kind: decision
subtype: adr
timestamp: 2026-10-16T22:48:10Z
review: accepted
provenance:
  conversationId: architecture-design
  sourceRef: 71b1348bad1addc3f8adaa253f5a147a502cb15d
  contentHash: 71b1348bad1addc3f8adaa253f5a147a502cb15d
  timestamp: 2026-10-16T22:48:10Z
createdAt: 2026-10-16T22:48:10Z
updatedAt: 2026-10-16T22:48:10Z
```
# ADR: Scenario grid by agreement type and flow; HTML prototype first

The UI opens on a scenario grid: agreement type down the side (ISDA IM pledge, ISDA VM CSA title transfer, GMRA,
GMSLA, triparty, CCP margin), flow across the top (call, proposal and settlement; revaluation and top-up; return;
substitution; dispute; default and enforcement). The same business step keeps the same name in every row so a column
shows how one step differs by agreement. A scenario sets up the agreement, parties, positions and market data, then
shows the participants' consoles side by side with a ledger timeline (off-chain messages and on-chain transactions)
and a step tracker.

**Sequence.** First an interactive HTML page with mocked data and guided mode only, covering ISDA IM in full and ISDA
VM CSA as the title-transfer contrast; other rows shown as planned. After the project owner approves it, the React
party console with guided and free modes. Scenarios are data files that also drive the end-to-end tests.

**Context.** Agreement type decides the legal mechanism (pledge or title transfer), whether calls are negotiated, and
the number of parties (`docs/analysis/collateral-flows.md`). Constraint `nw-mimic-real-flows`.
