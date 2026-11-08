```yaml
id: wp-adr-repo-gmra-terms
kind: decision
subtype: adr
timestamp: 2026-11-07T23:26:59Z
review: accepted
provenance:
  conversationId: repo-gmra-terms
  sourceRef: 9146674da13957a4cd21ae92f51ab6ebc712c90c
  contentHash: 9146674da13957a4cd21ae92f51ab6ebc712c90c
  timestamp: 2026-11-07T23:26:59Z
  confidence: 0.7
createdAt: 2026-11-07T23:26:59Z
updatedAt: 2026-11-07T23:46:22Z
```

# ADR: GMRA terms are a cdm-ext wrapper over CDM's LegalAgreement; amendments form a second hash chain per pair in CollateralControl

For [[task-repo-gmra-terms]] (section C, row 1 of the workflow map), within [[wp-adr-repo-gmra-scope]], following the
project owner's choices of 2026-11-07 (source `9146674da13957a4cd21ae92f51ab6ebc712c90c`: "1. a 2. a 3. a 4. a 5. a"):

- **Representation (G20).** `cdmx.collateral.gmra.GmraTerms` holds a CDM `LegalAgreementBase` (agreement type
  `MasterAgreement`, master agreement type `GMRA`, publisher ICMA, vintage 2011, English law, the two contractual
  parties), the Party1 and Party2 roles as CDM `Counterparty` records, and a `GmraElections` record. CDM 7.7.0's
  `GlobalMasterRepoAgreement` has no attributes; CDM's `LegalAgreement` requires `agreementTerms`, and an empty GMRA
  election block does not survive serialisation, so the agreement is the base type and the elections sit next to it.
  The document stays valid CDM JSON. (Amended during the build, 2026-11-07: the option chose `LegalAgreement` with the
  empty block.)
- **Elections and the baseline.** Base Currency USD; the Margin Ratio is per trade (the trade's `marginPercentage`),
  with an agreement default for trades that state none; a minimum transfer amount of USD 250,000 for each party;
  margin transferred as cash or securities by title transfer, due one business day after the call; Net Margin interest
  on cash margin at the overnight rate the oracle publishes; income on purchased securities paid to the seller on the
  income payment date (paragraph 5); default valuation by the non-defaulting party at a stated valuation time, with
  automatic early termination off (paragraph 10).
- **Amendment (G19).** `GmraTermsAmendment` holds the terms before and after, the elections that changed, and the
  event and effective dates; `cdm-ext` qualifies it as a terms change (CDM's `AgreementTermsChangeInstruction` carries
  CSA elections only). On-chain, `CollateralControl` gets a second hash chain per pair, keyed by agreement kind, with
  propose and consent as for the CSA amendment; the CSA chain is unchanged. This needs a new deployment.
- **On-chain state.** Only the hash of the terms in force: zero for the baseline, then the hash of the last agreed
  amendment. The elections travel in the CDM documents the services exchange; each service reports the terms as
  verified when its fold from the baseline ends at the on-chain hash.
- **Prototype.** A "GMRA terms" panel in both consoles shows the elections, the hash and whether they are verified,
  and proposes a change to one election. The live spec `flow-repo-gmra-terms` checks that both parties hold the same
  terms, has A propose a new minimum transfer amount and B agree, checks both folds, and restores the baseline.

**Consequences.**
- The GMRA chain is per unordered pair (the GMRA has no pledgor and secured party); the CSA chain stays per
  (pledgor, secured party).
- No repo workflow reads the elections yet; the margin maintenance task is the first.
- The elections the other workflows need beyond these are added by those tasks as amendments of the type.
