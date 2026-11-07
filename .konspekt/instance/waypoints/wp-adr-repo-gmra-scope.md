```yaml
id: wp-adr-repo-gmra-scope
kind: decision
subtype: adr
timestamp: 2026-11-07T22:35:17Z
review: proposed
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.7
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-07T22:35:17Z
```
# ADR: repo under the GMRA covers all ten workflows; repos are CDM trades held by both services and settled on-chain; margin is maintained on Net Exposure by title transfer

For [[task-repo-gmra-workflows]] (section C, row 1 of the workflow map), following the project owner's choices of
2026-11-07 (source `43bd267adffbb70e3a740c20620deed96d966092`: "let's do all 10 flows" and "1. a 2. a 3. a 4. a 5. a 6. a"):

- **Scope.** All ten workflows the analysis lists for repo: terms, margin maintenance, reprice, adjustment, roll,
  repurchase, pair-off, buy/sell-back, substitution and income.
- **Where the repos live.** Each repo is a CDM `TradeState` built from CDM's repo samples and held by both parties'
  services off-chain. The purchase and the repurchase settle on-chain as delivery versus payment, security token
  against tUSD. The trade events that change a repo (reprice, adjustment, roll, pair-off, substitution) run through
  CDM's own functions; the chain records each event's hash and any transfer it causes.
- **Margin transfer (GMRA paragraph 4).** Outright title transfer of cash or securities through the `MarginCall`
  contract and the VM settlement path. The call amount is the pair's Net Exposure across all repos once it passes
  the minimum transfer amount. Reprice and adjustment are the alternative ways to settle that exposure, chosen per call.
- **GMRA terms (G20).** A `cdm-ext` type holding the Annex I elections the ten workflows need: Margin Ratio basis,
  minimum transfer amount, margin transfer method, Net Margin interest, the income payment rule and the default
  valuation terms. Amendment (G19) changes these terms the same way the CSA amendment does.
- **Defect D2.** The margin ratio (defined as market value divided by purchase price, applied as a multiplier) is
  corrected in `cdm-ext`, as D1 was, with tests.
- **Directions and buy/sell-back.** A and B can each be buyer or seller, so the pair has repo and reverse repo between
  them, and Net Exposure nets across both directions. Buy/sell-back is a trade type on the same flows, with its own
  `cdm-ext` qualification and economics (G33).
- **Process.** As in section B: one task per workflow under [[task-repo-gmra-workflows]], in this build order, each
  with its own live spec; the task map's section C has one row per workflow.

1. [[task-repo-gmra-terms]]: GMRA agreement terms and their amendment.
2. [[task-repo-purchase-repurchase]]: Repo purchase and repurchase settled delivery versus payment.
3. [[task-repo-margin-maintenance]]: Repo margin maintenance: Net Exposure and margin transfer.
4. [[task-repo-reprice]]: Repo repricing.
5. [[task-repo-adjustment]]: Repo adjustment.
6. [[task-repo-substitution]]: Repo substitution of purchased securities.
7. [[task-repo-income]]: Repo interest and manufactured income.
8. [[task-repo-roll]]: Repo roll.
9. [[task-repo-pair-off]]: Repo pair-off.
10. [[task-repo-buy-sell-back]]: Buy/sell-back.

**Consequences.**
- The prototype carries trades for the first time: until now the services held agreements and calls, and the trades
  behind a call only as reconciliation snapshots.
- New on-chain settlement: delivery versus payment in one transaction.
- Default and close-out under GMRA paragraph 10 (R20, R23, score 0) is not one of the ten workflows.
- The details of each workflow (which elections, which CDM samples, the contract changes) are decided in its own task.
