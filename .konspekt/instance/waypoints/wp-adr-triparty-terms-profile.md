```yaml
id: wp-adr-triparty-terms-profile
kind: decision
subtype: adr
timestamp: 2026-11-12T00:45:37Z
review: accepted
provenance:
  conversationId: triparty-terms-profile
  sourceRef: ni:///sha-256;AgQB7ZI3RfjJfdb1Rt1wDzqbECK7Lk9ZaYGCGoJqyPM
  timestamp: 2026-11-12T00:45:37Z
  confidence: 0.55
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 6d0f24d02ec0a2e8263d04901b8f42e3e7519c33
    contentHash: 6d0f24d02ec0a2e8263d04901b8f42e3e7519c33
createdAt: 2026-11-12T00:45:37Z
updatedAt: 2026-11-12T01:07:01Z
```
# ADR: the triparty terms are a cdm-ext TripartyTerms with the profile as CDM's EligibleCollateralSpecification, proposed by the giver and affirmed by the receiver and the agent BANK-T on a new TripartySettlement contract

For [[task-triparty-terms-profile]] (section C, row 20 of the workflow map), within [[wp-adr-triparty-scope]]. The
project owner chose on 2026-11-11 (source `6d0f24d02ec0a2e8263d04901b8f42e3e7519c33`: "1a 2a 3a 4a 5a 6a 7a"), after the CDM check recorded in
[[task-triparty-workflows]]: CDM has the `TripartyAgent` party role and the profile as an
`EligibleCollateralSpecification`, and no triparty agreement type (T1). The rest of this record is the maintainer's
proposal.

- **The agent (1a).** BANK-T uses the Besu node and account the network already runs as `bank-c`, which nothing used.
  The node keeps its name `bank-c`; the party is BANK-T, console party `T`. `orchestrate.mjs` starts a third gateway
  (`bank-c`, port 8203) and a third collateral service (`PARTY_ID=T`, port 8003) and mints the store token for it.
  BANK-T's service registers only the health, context and triparty routes; the bilateral CSA, repo and lending routes
  stay on A and B.
- **Terms (3a).** `cdm-ext` `TripartyTerms` [rootType] in `cdmx.collateral.triparty`: the three parties as CDM
  `Party` with their roles (`PartyRoleEnum` `TripartyAgent` for the agent; the giver and the receiver by name), the
  hash of the GMRA terms in force between the giver and the receiver, the Base Currency, the effective date and the
  profile. Conditions: three distinct parties, the agent's role, a profile with at least one included asset.
- **Profile (4a).** The CSA baseline schedule as CDM's `EligibleCollateralSpecification`
  (`CdmAgreement.baselineSchedule`): tUST at a 2% haircut, tAGY at 3%; tMMF and tUSD are not eligible. The CSA
  schedule the live stack uses carries no concentration limit, so the profile adds one, in CDM's
  `ConcentrationLimit` on the tAGY criterion: at most 50% of the allocated value after haircuts. `cdm-ext`'s
  `ConcentrationLimitBreaches` evaluates it from `task-triparty-trade-start` on.
- **Agreement (2a).** BANK-A is the giver and BANK-B the receiver; either may propose the terms, naming itself as the
  giver. The giver's service builds the terms, stores the document for all three parties and records its hash on
  `TripartySettlement`. The receiver's service and BANK-T's service each fetch the document, check that it parses,
  validates and equals the terms they build themselves (the receiver also checks the GMRA terms hash against its own
  GMRA terms in force), and affirm the hash. The terms take effect when both have affirmed. Either may refuse a
  proposal instead.
- **No amendment (5a).** One set of terms in effect per giver, receiver and agent. A new proposal is refused while
  one is proposed or in effect. The giver or the receiver can terminate terms in effect, so that a live spec can
  leave the chain as it found it; from `task-triparty-trade-start` on, termination is refused while collateral is
  allocated.
- **Contract (7a).** A new `TripartySettlement` contract: `proposeTerms`, `affirmTerms`, `refuseTerms`,
  `terminateTerms` and their views, with the states Proposed, Effective, Refused and Terminated. Deposits and
  allocation come in `task-triparty-trade-start`. Deploying it adds a contract to the deployment; the existing
  contracts are redeployed with it, and the previous deployment is kept as `besu.pre-triparty-terms.json`.
- **Console (6a).** A third route `#/live/T` for BANK-T, which shows a "Triparty (agent)" card; A and B show a
  "Triparty terms" card. Live spec `flow-triparty-terms`: A proposes in its console, B and T affirm in theirs, the
  three services show the same terms in effect, then A terminates them.

**Consequences.**
- A third party in the live stack: the orchestrator, the gateway, the store tokens, the registry and the console.
- The baseline profile is an assumption stated from the CSA rows, not from a triparty agent's profile; the questions
  are in [[task-sme-triparty-terms-profile]].
