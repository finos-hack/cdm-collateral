```yaml
id: wp-adr-revaluation-outstanding-im-from-calls
kind: decision
subtype: adr
timestamp: 2026-11-03T16:24:46Z
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 7b7af5a7e92584d713a86f7f0a6dd5c3e64bb860
  contentHash: 7b7af5a7e92584d713a86f7f0a6dd5c3e64bb860
  timestamp: 2026-11-03T16:24:46Z
createdAt: 2026-11-03T16:24:46Z
updatedAt: 2026-11-03T16:24:46Z
```
# ADR: Revaluation compares the pledged IM with the outstanding IM from calls; the operator edits prices in a console view

In `flow-revaluation-top-up` the secured party's collateral service (`GET /api/v1/revaluation`) compares two amounts
between the pair:

- **Requirement:** the agreed amounts of settled IM calls, less settled return calls, read from chain. Enforced calls
  are excluded.
- **Value:** the pledged quantity of each token at the oracle feed price, after the eligibility haircut.

A shortfall at or above the IM agreement's minimum transfer amount (USD 500,000) gives a top-up IM call amount,
rounded up to USD 10,000 (`console/src/domain/reference.ts`). The secured party issues that call from its console, and
it follows `flow-im-margin-call-pledge` ([[task-revaluation-top-up-modelling]], option 1).

The market operator edits prices in a new console route, `#/live/operator`. It calls the oracle service through the
same-origin proxy `/svc/oracle`. The oracle publishes the edit to the feed before keeping it
([[wp-adr-oracle-prices-on-request-ratings-offchain]]).

**Context.** The prototype has no IM model: SIMM is out of scope (gap G13). The only record of how much IM is owed is
the calls the parties agreed and settled.

**Consequences.**
- No new input and no stored requirement per agreement.
- The requirement moves only when calls settle. A market move in the trades is not seen, only a move in the collateral
  value.
- Rejected alternatives:
  - an IM requirement entered by the secured party (closer to practice; needs a stored requirement);
  - API-only price edits (the flow's console steps would stay unimplemented).

Accepted by the project owner on 2026-11-03 (both recommended options chosen). How the rule treats top-up calls and
enforcement is in [[nw-revaluation-top-up-excluded]].
