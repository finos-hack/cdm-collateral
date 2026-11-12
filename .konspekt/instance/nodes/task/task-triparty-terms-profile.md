```yaml
id: task-triparty-terms-profile
type: task
title: Triparty terms and the collateral profile
status: open
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
# Task: Triparty terms and the collateral profile

Row 20 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (proposed; the project owner's choices of 2026-11-11).

- **CDM status:** Terms: no triparty agreement type (T1, score 1); the agent as a party passes validation (T2). Profile: `EligibleCollateralSpecification` validates and `HaircutFor` gives its haircuts (T3, T4); concentration limits generic (T5).
- **Scope:** The triparty terms between the giver, the receiver and the agent BANK-T (the underlying GMRA, the agent, the profile), and the collateral profile: eligible assets, haircuts and concentration limits. The agent as a third test party in the live stack.
- **`cdm-ext`:** a triparty terms type naming the three parties and the profile, with CDM's `EligibleCollateralSpecification` as the profile.
- **Prototype:** BANK-T: a Besu account and a third collateral service and gateway started by `live-e2e.sh`; the terms held by the three services and their hash on a new `TripartySettlement` contract; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.
