```yaml
id: task-triparty-trade-end
type: task
title: Triparty trade end: release of the collateral against repayment
status: resolved
review: accepted
provenance:
  conversationId: triparty-scope
  sourceRef: ni:///sha-256;uCFqE3GZejmU7rs2-A1jFqCW9PhOIAzqqN8WMPrmca4
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
    contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-13T15:22:33Z
```
# Task: Triparty trade end: release of the collateral against repayment

Row 24 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Absent: no settlement through the agent (T9, score 0); the repurchase event is CDM's (row 3, defect D25).
- **Scope:** On the Repurchase Date the agent releases the allocated collateral to the giver's balance against the repurchase price paid to the receiver.
- **`cdm-ext`:** the release event over the allocation, beside CDM's repurchase event.
- **Prototype:** the contract settles the repayment against the release; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.

**Binding switch** from [[task-triparty-substitution]] to this task on the project owner's "start on row 24"
(2026-11-12), on branch `triparty`, while the substitution's full live run finishes.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the trade-start repo (500,000 tUSD at 5% to 2026-11-19,
3,000 tUST and 2,190 tAGY held), and over the repo as a substitution left it (3,998 tUST and 1,190 tAGY):

- **Repurchase event.** The prototype's `CdmRepo.repurchaseEvent` (CDM's `ResolveRepurchaseTransferInstruction` and
  `Create_BusinessEvent`) on the Repurchase Date, and on an earlier date, validates over both, carries the `Repurchase`
  intent and closes the trade as `Terminated`; `Qualify_Repurchase` is false (D25) and so is `Qualify_Termination`.
- **Collateral left in the closed trade.** The event sets the cash quantity of the trade lot to zero and leaves the
  collateral portfolio as it was: the terminated trade still holds 3,000 tUST and 2,190 tAGY (or 3,998 and 1,190). CDM
  has no step that releases the collateral of a repo at its end.
- **Repurchase Price.** cdm-ext `RepoRepurchasePrice` gives 500,486 on both, whole tUSD.
- **Settlement document.** The bilateral `CdmRepo.repurchase` (cdm-ext `RepoSettlement`, one security transfer) refuses
  the triparty repo: its trade lot has the cash only, no security price quantity.
- **Transfers.** A CDM `ScheduledTransfer` per held asset (`Principal`, from the Buyer to the Seller on the Repurchase
  Date) validates. `DeliveryMethodEnum` has `DeliveryVersusPayment`, `FreeOfPayment`, `PreDelivery` and `PrePayment`,
  none through an agent (T9).

**Design chosen 2026-11-12** (source `baffa673bcccdc9dd2a5d617bd8963a25cdd4e41`: "1. All a"), recorded in
[[wp-adr-triparty-trade-end]]; the trade-end rules are questions for an SME in [[task-sme-triparty-trade-end]].

**Built 2026-11-12** to [[wp-adr-triparty-trade-end]]:

- **cdm-ext** (`cdmx.collateral.triparty`): `TripartyTradeEnd` (conditions `RepurchaseEvent`, `ReleaseCoversHolding`,
  `CashAgainstRelease`, `CashIsTheRepurchasePrice`, `OnTheRepurchaseDate`) and `TripartyReleaseCoversHolding`.
- **Contract** `TripartySettlement`: `RepoState.Repurchased`; `prepareTradeEnd` (the agent; no substitution pending;
  afterwards no revaluation, substitution or request), `settleRepurchase` (the giver: the Repurchase Price to the
  receiver and the holding to its free account in one transaction; the repo no longer counts as open), `tradeEndOf`.
  1 new hardhat test (127 pass).
- **Gateway** routes `/ledger/v1/triparty/repos/:id/trade-end` (GET, POST) and `/repurchase`; the state name
  `repurchased`.
- **Service** `CdmTriparty.tradeEnd`, `verifyTradeEnd`, `tradeEndView`; the agent's preparation on its business date
  equal to the Repurchase Date; the giver settles only a trade end it rebuilt from the chain at the block before; the
  receiver checks it the same way. `CdmTripartyTradeEndTest`, 2 tests.
- **Console**: `Prepare trade end` in `#/live/T`, `Settle repurchase (N tUSD)` in the giver's repo row, the trade end
  with its check, and `repurchased on-chain ✓`.
- **Live spec** `flow-triparty-trade-end`, which also ends the other settled repos under the B-giver terms and
  terminates the terms, so open triparty repos no longer accumulate across runs. The five triparty specs passed
  together on a new deployment (chain reset), 3.9 min.

**Full run 2026-11-12** on that deployment: `cdm-ext` 313 tests, collateral service 132, 127 contract tests, gateway and
console typechecks, 138 console tests, and the live suite, 47 of 47 in 29.6 min (the triparty specs a second time on the
same chain, after the first run had terminated the B-giver terms).
