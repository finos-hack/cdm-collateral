```yaml
id: task-repo-purchase-repurchase
type: task
title: Repo purchase and repurchase settled delivery versus payment
status: resolved
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
  contentHash: 43bd267adffbb70e3a740c20620deed96d966092
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-08T01:55:28Z
```
# Task: repo purchase and repurchase settled delivery versus payment

Row 2 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** Purchase Price and Repurchase Price computed (R6, score 3: no sample exercises it); repurchase transfer and term events usable (R10 score 4, R13 score 5).
- **Scope:** A repo between A and B, either party as seller: the CDM `TradeState` from CDM's repo samples, held by both services off-chain; the purchase on the Purchase Date and the repurchase on the Repurchase Date, each settled on-chain as securities against tUSD in one transaction.
- **`cdm-ext`:** checks that CDM's Purchase and Repurchase Price follow from the trade, if CDM's functions need it.
- **Prototype:** a delivery-versus-payment settlement for the purchase and the repurchase, the trade event hashes on-chain; a live spec.

The details are decided when the task starts.

**Design chosen 2026-11-07** (source `80d5c6596368a0436259035ca8d5c4b429f2f9e6`: "Go with 'recommended' for the rest of them"), recorded in
[[wp-adr-repo-purchase-repurchase]] (proposed).

Built on branch `repo-purchase-repurchase` (2026-11-07): cdm-ext `cdmx.collateral.repo` (`RepoPurchaseQuantity`,
`RepoPriceDifferential`, `RepoRepurchasePrice`, the `RepoSettlement` document; 7 tests), the `RepoSettlement` contract
(3 tests), the gateway routes and events, the service's `CdmRepo` with `/repos` and `/business-date` (4 tests), the
console "Repos" card (3 tests) and the live spec `flow-repo-purchase-repurchase`. All 18 live specs pass on a new
contract set (the previous deployment is kept as `besu.pre-repo-purchase-repurchase.json`).

Found in the build, beyond the ADR: CDM's `Create_BusinessEvent` leaves the Repurchase event's
`closedState -> activityDate` empty, which CDM's validation requires, so the services set it to the Repurchase Date;
CDM's `FixedAmount` returns 332.475 as 332.4749..., so `RepoRepurchasePrice` rounds the Price Differential to ten
decimals before rounding the total to the cash precision; the execution needs `executionDetails` (OffFacility) to
validate. The buyer also checks, before affirming, that the trade's price is the feed price.

**Open question for subject-matter experts (2026-11-07,** source `0ef54baaa98806298dc824298cef7111bd63236a`: "4. something for SMEs to answer"**):** the
live spec leaves the 875 tUSD Price Differential with the buyer on every run; `check` restores the free balances before
each run. Whether a live spec should also return such amounts itself is left to subject-matter experts.
