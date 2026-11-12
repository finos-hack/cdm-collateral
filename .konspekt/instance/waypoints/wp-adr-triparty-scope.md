```yaml
id: wp-adr-triparty-scope
kind: decision
subtype: adr
timestamp: 2026-11-12T00:36:54Z
review: proposed
provenance:
  conversationId: triparty-scope
  sourceRef: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  contentHash: 41bdcccfd2c7410720f06a21f0e5ff20ae297d3c
  timestamp: 2026-11-12T00:36:54Z
  confidence: 0.6
createdAt: 2026-11-12T00:36:54Z
updatedAt: 2026-11-12T00:36:54Z
```
# ADR: triparty covers six workflows of a triparty repo under the GMRA; a third test party BANK-T acts as the agent and a new TripartySettlement contract holds its books; the agent allocates by the CSA allocation rule

For [[task-triparty-workflows]] (section C, row 20 of the workflow map), following the project owner's choices of
2026-11-11 (source `41bdcccfd2c7410720f06a21f0e5ff20ae297d3c`: "1a 2a 3a 4a 5a 6a"), after the CDM check recorded in that task:

- **Agreement.** Triparty repo under the GMRA. The trade and the cash reuse the repo rows 1 to 11; securities lending
  through an agent is out of scope.
- **The agent.** A third test party, BANK-T, with its own Besu account and a third instance of the collateral service
  and gateway, started by `live-e2e.sh`. The giver and the receiver agree only the exposure and the profile; BANK-T's
  service allocates, values and substitutes. A new `TripartySettlement` contract holds the collateral the giver
  deposits, as the agent's books.
- **Allocation rule.** The CSA allocation the prototype already has: cheapest eligible asset first, within the haircuts
  and concentration limits of the profile, over the giver's balance held by the agent.
- **Default.** Follows the underlying GMRA (T15) and is out of row 20; row 11 applies if needed.
- **CDM gaps.** No agent allocation, substitution, triparty delivery method or agent report (T7, T8, T9, T12). They
  stay in the coverage matrix only; no `defects.md` entry, since nothing in CDM fails.
- **Process.** One task per workflow under [[task-triparty-workflows]], in this build order, each with its own live
  spec; the task map's section C has one row per workflow. Rows 20 to 25 are triparty; CCP moves to row 26.

1. [[task-triparty-terms-profile]]: Triparty terms and the collateral profile.
2. [[task-triparty-trade-start]]: Triparty trade start: allocation by the agent and DvP of the cash.
3. [[task-triparty-revaluation]]: Triparty daily revaluation by the agent, with top-up or release.
4. [[task-triparty-substitution]]: Triparty substitution by the agent.
5. [[task-triparty-trade-end]]: Triparty trade end: release of the collateral against repayment.
6. [[task-triparty-reporting]]: The triparty agent's report to both parties.

**Consequences.**
- A third party in the live stack: `live-e2e.sh`, the orchestrator, the deployment and the console gain BANK-T.
- A third settlement contract beside `RepoSettlement` and `SecuritiesLoan`.
- The live specs must leave the shared balances, the agent's books included, as they found them.
- The details of each workflow are decided in its own task, after a temporary test of CDM's functions.
