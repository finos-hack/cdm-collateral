```yaml
id: task-sme-interest-daily-balances
type: task
title: Confirm with a business SME how the daily cash balances and rates of an Interest Period are taken
status: open
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;ykrq4pPBDS2eLjEFB1dOXGBJbTH45C7F9YkutihIlE4
  timestamp: 2026-11-06T15:35:07Z
  confidence: 0.7
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 16dca9f0c1765191fa8235340845c442d5744245
    contentHash: 16dca9f0c1765191fa8235340845c442d5744245
createdAt: 2026-11-06T15:35:07Z
updatedAt: 2026-11-06T15:52:55Z
```
# Task: confirm how daily cash balances and rates are taken for collateral interest

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-enforcement-event-definition]] and
[[task-sme-registered-asset-completion]]. `Create_CollateralInterestStatement` (G17, [[task-csa-interest-on-cash]])
accrues interest on one cash balance and one observed rate per calendar day of the Interest Period. The prototype's
live flow uses one rate entered by the secured party and the current tUSD balance in escrow for every day (the project
owner's interim choice, 2026-11-06). Questions for the SME:

1. Which balance counts for a day: the cash held at the end of the day, at a cut-off time, or the settled balance only?
   How are cash transfers in flight on that day treated?
2. Which rate applies on a non-business day, and on which day is the rate observed (same day, or with a lookback)?
3. Who supplies the balances and rates for the statement (the secured party as calculation agent, a custodian or a
   rate source), and can the pledgor dispute them?
4. For tokenized cash on a ledger, does the on-chain balance at the end of a calendar day (by block time) serve as the
   day's balance?

The answers set how the live flow builds its `CashCollateralDay` list.
