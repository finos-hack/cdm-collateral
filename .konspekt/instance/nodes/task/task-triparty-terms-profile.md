```yaml
id: task-triparty-terms-profile
type: task
title: Triparty terms and the collateral profile
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
# Task: Triparty terms and the collateral profile

Row 20 of section C of the workflow map, split from [[task-triparty-workflows]] within
[[wp-adr-triparty-scope]] (accepted; the project owner's choices of 2026-11-11).

- **CDM status:** Terms: no triparty agreement type (T1, score 1); the agent as a party passes validation (T2). Profile: `EligibleCollateralSpecification` validates and `HaircutFor` gives its haircuts (T3, T4); concentration limits generic (T5).
- **Scope:** The triparty terms between the giver, the receiver and the agent BANK-T (the underlying GMRA, the agent, the profile), and the collateral profile: eligible assets, haircuts and concentration limits. The agent as a third test party in the live stack.
- **`cdm-ext`:** a triparty terms type naming the three parties and the profile, with CDM's `EligibleCollateralSpecification` as the profile.
- **Prototype:** BANK-T: a Besu account and a third collateral service and gateway started by `live-e2e.sh`; the terms held by the three services and their hash on a new `TripartySettlement` contract; a live spec.

The details are decided when the task starts, after a temporary test of CDM's functions over the prototype's repo.

**Design chosen 2026-11-11** (source `6d0f24d02ec0a2e8263d04901b8f42e3e7519c33`: "1a 2a 3a 4a 5a 6a 7a"), recorded in [[wp-adr-triparty-terms-profile]]
(accepted 2026-11-11); the terms and the profile are questions for an SME in [[task-sme-triparty-terms-profile]].

**Build, 2026-11-11.**

- `cdm-ext`: `TripartyTerms` (`cdmx.collateral.triparty`) with the conditions PartiesNamed, ThreeParties, AgentRole and
  ProfileIncludesAnAsset; `TripartyTermsTest` (3 tests).
- Contract: `TripartySettlement` (`proposeTerms`, `affirmTerms`, `refuseTerms`, `terminateTerms`, `getTerms`,
  `currentTerms`, `termsOf`); 2 contract tests.
- Gateway `/ledger/v1/triparty/terms...`; service `CdmTriparty` and `/api/v1/triparty...`; `PARTY_ID=T` runs only the
  triparty routes; `orchestrate.mjs` and `live-e2e.sh` start gateway 8203 and service 8003 for BANK-T on `bank-c`.
- Console: "Triparty terms" card for A and B, the agent's console at `#/live/T`; live spec `flow-triparty-terms`.
- **Observation for `task-triparty-trade-start`.** CDM's `CheckCriteria` has no case for an `AssetIdentifier`
  criterion: its switch falls to `default False`. `ConcentrationLimitBreaches`, which checks each criterion with it,
  therefore finds no collateral under the profile's tAGY limit: 60% tAGY gives no breach
  (`TripartyTermsTest.cdmsCriteriaCheckDoesNotMatchTheProfilesIsinCriteria`). `cdm-ext`'s `HaircutFor` matches the
  same criterion by ISIN. Allocation against the limit needs either a per-ISIN concentration check in `cdm-ext` or the
  profile's criteria stated by asset type and issuer.

The project owner chose on 2026-11-12 (source `1ab22fca0b3d8cc65894a6f24667c190f1c1ee0e`: "1a 1a 2. add them"): the observation is recorded as defect
D30 in `docs/analysis/defects.md`; the fix is a per-ISIN concentration check in `cdm-ext`, built in
[[task-triparty-trade-start]]; the architecture description gains the securities loan and triparty settlement
contracts and the triparty agent's actor.
