```yaml
id: wp-adr-gmsla-terms
kind: decision
subtype: adr
timestamp: 2026-11-11T15:30:34Z
review: proposed
provenance:
  conversationId: gmsla-terms
  sourceRef: 0993e4fa3e595a8c5ff438c2ddcfc242e6a1bc95
  contentHash: 0993e4fa3e595a8c5ff438c2ddcfc242e6a1bc95
  timestamp: 2026-11-11T15:30:34Z
  confidence: 0.65
createdAt: 2026-11-11T15:30:34Z
updatedAt: 2026-11-11T15:30:34Z
```
# ADR: GMSLA terms are CDM's LegalAgreement with its GMSLA elections and a cdm-ext record of the elections CDM lacks; amendments use the CollateralControl chain under kind GMSLA

For [[task-gmsla-terms]] (section C, row 12 of the workflow map), within [[wp-adr-securities-lending-gmsla-scope]]. The
project owner chose on 2026-11-11 (source `0993e4fa3e595a8c5ff438c2ddcfc242e6a1bc95`: "1a 2a 3a 4a 5a"), after the CDM check recorded in that task. The
rest of this record is the maintainer's proposal.

- **Representation (G21).** `cdmx.collateral.gmsla.GmslaTerms` holds CDM's `LegalAgreement` unchanged: agreement type
  `MasterAgreement`, master agreement type `GMSLA`, publisher ISLA, vintage 2010, English law, BANK-A and BANK-B as the
  contractual parties and as Party1 and Party2 in `agreementTerms`, and CDM's `GlobalMasterSecuritiesLendingAgreement`
  under `masterAgreementElections -> islaGmsla`. Next to it a `GmslaPrototypeElections` record holds the elections
  CDM's type lacks. A `cdm-ext` condition requires the master agreement type `GMSLA` when the GMSLA elections are
  present (defect D28).
- **Baseline elections.** Base Currency USD; the standard definition of Market Value; aggregation `Aggregated`
  (paragraph 5.4), loans not grouped; netting of deliveries (paragraph 5.6) and the failure-to-redeliver indemnity
  (paragraph 6.4) apply; notification time 10:00 London (`GBLO`); automatic early termination not applicable for
  either party.
- **Elections CDM lacks.** A minimum transfer amount for each party, USD 250,000, applied to the aggregated mark; a
  default margin of 102% for loans that state none. The rebate rate, the lending fee rate, each loan's margin and the
  recall terms (CDM's `RecallProvision`) stay on each loan, as CDM has them.
- **Amendment (S2).** `GmslaTermsAmendment` holds the terms before and after, the elections that changed, and the
  event and effective dates; `cdm-ext` qualifies it as a terms change (CDM's `Create_AgreementTermsChange` returns
  nothing for a GMSLA). On-chain it uses `CollateralControl`'s terms amendment chain under kind
  `keccak256("GMSLA")`, with propose and consent as for the GMRA; no contract change and no new deployment.
- **On-chain state.** Only the hash of the terms in force, as for the GMRA: zero for the baseline, then the hash of the
  last agreed amendment. Each service folds the agreed amendments from the baseline and reports the terms as verified
  when the fold ends at the on-chain hash.
- **Prototype.** A "GMSLA terms" panel in both consoles shows the elections, the hash and whether they are verified,
  and proposes a change to one election. The live spec `flow-gmsla-terms` checks that both parties hold the same
  terms, has A propose a new notification time and B agree, checks both folds, and restores the baseline.

**Consequences.**
- No lending workflow reads the elections yet; loan delivery and marking are the first.
- The baseline elections are assumptions for an SME ([[task-sme-gmsla-terms-baseline]]).
