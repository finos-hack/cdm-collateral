```yaml
id: task-csa-interest-on-cash
type: task
title: Build the interest on cash collateral flow (G17)
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: b569643ca62a533db49fbd5b7b981da14137e9d6
  contentHash: b569643ca62a533db49fbd5b7b981da14137e9d6
  timestamp: 2026-11-06T13:19:22Z
  confidence: 0.75
createdAt: 2026-11-06T13:19:22Z
updatedAt: 2026-11-06T15:35:07Z
```
# Task: build the interest on cash collateral flow (G17)

Split from [[task-csa-workflow-extensions]] on the project owner's instruction (2026-11-06: "a task per flow"). Row 3 of section B of the workflow map. CDM has the types only (score 2, G17, P2). Needs the CDM side in `cdm-ext`
first (interest amount, period and transfer), then the prototype flow, contracts, gateway, services, console steps and
a live spec.

## Progress 2026-11-06T15:26:06Z

- cdm-ext side built in commit `6a2dbc5` on branch `g17-interest-on-cash`:
  `cdmx.collateral.interest` (`CollateralInterestRate`, `CollateralInterestAccrual`,
  `Create_CollateralInterestStatement`), `InterestTest` 21 tests; all 147 cdm-ext tests pass. Gap register G17 set to
  partial (proposed, for review). Readings of the CDM elections proposed in [[wp-adr-interest-rate-rules-and-withholding]].
- Not done: the prototype flow (contracts, gateway, service, console, live spec, CALM flow).

## Decisions 2026-11-06T15:35:07Z

The project owner (2026-11-06): accepted [[wp-adr-interest-rate-rules-and-withholding]]. Live flow: the secured party enters the period dates and
one observed rate in the console, and every day uses the current tUSD balance in escrow; the question goes to the SME
([[task-sme-interest-daily-balances]]). Settlement: the secured party transfers tUSD to the pledgor (the pledgor to the secured party for a
negative amount), with the statement hash anchored by a new `CollateralControl` function, on a new contract set on the
same chain.
