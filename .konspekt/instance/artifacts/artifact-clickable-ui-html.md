```yaml
id: artifact-clickable-ui-html
name: Clickable UI prototype (HTML)
kind: prototype
location: ui-prototype/clickable.html
review: proposed
provenance:
  conversationId: architecture-design
  sourceRef: 71b1348bad1addc3f8adaa253f5a147a502cb15d
  contentHash: 71b1348bad1addc3f8adaa253f5a147a502cb15d
  timestamp: 2026-10-16T22:52:27Z
  confidence: 0.7
createdAt: 2026-10-16T22:52:27Z
updatedAt: 2026-10-16T23:02:19Z
```
# Clickable UI prototype (HTML)

Single-page clickable prototype (`wp-adr-ux-scenario-grid`), guided mode only, invented test data, no backend.
Home: scenario grid, agreement type × flow. Seven scenarios: ISDA IM call with proposal and pledge, partial agreement
with dispute and rejected proposal, revaluation and top-up, return, default and enforcement; ISDA VM CSA call by
title transfer and return. Each scenario shows the participants' consoles side by side, a step tracker with CALM step
numbers and standard references, and a ledger timeline split into off-chain messages and on-chain transactions.
Published at https://claude.ai/artifact/D3AfKPtqnA6owUUjiQRepc. Checked with Playwright: every scenario clicks
through to completion with no console errors and no horizontal scroll at 400 px.

Revised 2026-10-16T23:02:19Z (source `01ed3cb87a05376b16fc5b6d38e98b90a97f732d`): CDM coverage badge per grid cell and capability chips per step; columns Interest and
income, Terms amendment, Loan return / recall; repo and GMSLA dispute cells planned (rows R9, S8).
