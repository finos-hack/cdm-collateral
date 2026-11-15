```yaml
id: task-triparty-substitution
type: task
title: Triparty substitution by the agent
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
# Task: Triparty substitution by the agent

Row 23 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Data only (T8, score 2): `CollateralPortfolio` can hold a reallocated portfolio; the repo substitution event (R11) is instructed by the trade parties.
- **Scope:** The giver asks for allocated collateral back; the agent replaces it with other eligible collateral of at least the required value from the giver's balance.
- **`cdm-ext`:** the agent's substitution over the allocation.
- **Prototype:** BANK-T's service substitutes; the contract swaps the assets on the agent's books; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.

**Binding switch** from [[task-triparty-revaluation]] to this task on the project owner's "4. Row 23" (2026-11-12),
on branch `triparty`.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the trade-start repo (3,000 tUST and 2,190 tAGY held;
the booked trade names BANK-B as `Seller`, BANK-A as `Buyer` and BANK-T as `TripartyAgent`):

- **Swap as a terms change.** Giving back 1,000 tAGY for 998 tUST, or all 2,190 tAGY for 2,186 more tUST (the asset
  leaves the portfolio), through `Create_SubstitutionInstruction` with the trade's own Purchase Date: the event
  validates, the repo stays a repurchase agreement and the Repurchase Price stays 500,486.11. cdm-ext
  `RepoIsSubstitution` is true and `RepoIsCollateralTopUp` and `RepoIsCollateralRelease` are false, so the three tell
  a substitution from a top-up and a release; CDM's `Qualify_Substitution` and `Qualify_Adjustment` are false (D20,
  D22).
- **Intent.** CDM's `EventIntentEnum` has no collateral substitution; `Reallocation` is for block-trade allocations,
  and `Qualify_Reallocation` stays false with it set (it needs a split).
- **Workflow.** CDM's `Create_ProposedWorkflowStep` holds the giver's request as an `EventInstruction` with the
  giver's identifier and an approval by BANK-T (`WorkflowStepApproval`), and `Create_AcceptedWorkflowStep` holds the
  agent's event; both validate. The accepted step's `previousWorkflowStep` is a key reference, empty unless the
  proposed step carries a key. CDM names no instructing party on the event itself; the agent is a party of the step.

**Design chosen 2026-11-12** (source `38140e048d810e158beb273724813d18a6c01704`: "(a) for all"), recorded in
[[wp-adr-triparty-substitution]]; the substitution rules are questions for an SME in [[task-sme-triparty-substitution]].

**Built 2026-11-12** to [[wp-adr-triparty-substitution]]:

- **cdm-ext** (`cdmx.collateral.triparty`): `TripartySubstitutionRequest` (condition `PositiveWholeUnits`),
  `TripartySubstitution` (conditions `DeclinedMovesNothing`, `SubstitutedReturnsTheUnits`, `SubstitutedIsCovered`,
  `NoReplacementInTheReturnedAsset`), `TripartyRequesterEnum`, `TripartySubstitutionOutcomeEnum`; `TripartyLessUnits`
  and `SubstituteTriparty`, which reuse the revaluation's top-up functions. `TripartySubstitutionTest`, 6 tests.
- **Contract** `TripartySettlement`: one history of holding changes per repo (`changesOf`: revaluation, substitution,
  declined), `requestSubstitution` (the giver or the agent; one pending per repo), `withdrawSubstitution` (the
  requester), `substitute` and `declineSubstitution` (the agent), `pendingSubstitutionOf`. 1 new hardhat test (126
  pass).
- **Gateway** routes `/ledger/v1/triparty/repos/:id/changes`, `/substitution` (GET pending, POST request),
  `/substitution/withdraw`, `/substitute`, `/substitution/decline`.
- **Service** `CdmTriparty.substitutionRequest`, `substitute` (the terms change qualified by `RepoIsSubstitution`, or
  `RepoIsCollateralRelease` when nothing replaces the units, and CDM's proposed and accepted workflow steps),
  `verifySubstitution`, `excessUnits`, `substitutionView`; routes for the giver's request and withdrawal and the agent's
  substitute and rebalance (its own request for the units over a limit recorded in the latest change); the giver's and
  the receiver's check of each change from the chain at the block before. `CdmTripartySubstitutionTest`, 3 tests.
- **Console**: `Request substitution` in the giver's repo row, `Substitute collateral` and `Swap out N excess <token>`
  in `#/live/T`, each substitution with its outcome and check.
- **Live spec** `flow-triparty-substitution`. bank-b's tUST test balance target is now 15,000. The agent-started swap of
  an excess is covered by the service and console tests, not by a live spec.

**Full run 2026-11-12** on a new deployment (chain reset): `cdm-ext` 313 tests, collateral service 130, 126 contract
tests, gateway and console typechecks, 137 console tests; the live suite ran 44 of 46 specs, all passing, before the
cloud environment restarted; the remaining two (`flow-triparty-revaluation`, `flow-triparty-substitution`) passed on
their own after the stack came back, once the feed prices and the agent's business date the interrupted spec had moved
were restored by hand. `flow-triparty-substitution` now has twice the default test time: after a service restart each
party rechecks every earlier change of the open triparty repos, and the open repos accumulate across runs until trade
end ([[task-triparty-trade-end]]).
