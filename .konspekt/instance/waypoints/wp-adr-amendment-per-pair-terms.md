```yaml
id: wp-adr-amendment-per-pair-terms
kind: decision
subtype: adr
timestamp: 2026-11-06T17:04:10Z
review: accepted
provenance:
  conversationId: csa-section-b
  sourceRef: ni:///sha-256;zArMQ4bdy8gUjuLt9XxEpKxdF9ZQXDoMHc0DlirUpfE
  timestamp: 2026-11-06T17:04:10Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 578226982772d99dbb0570851616daaed670e859
    contentHash: 578226982772d99dbb0570851616daaed670e859
createdAt: 2026-11-06T17:04:10Z
updatedAt: 2026-11-06T19:18:15Z
```
# ADR: amended terms chain per pair; the contract holds haircuts, the services hold elections

For `flow-agreement-amendment` ([[task-csa-amendment]]), within the owner's choice that one party proposes with the CDM amendment's
hash, the other consents on-chain and the contract applies the new haircuts per pair:

- `CollateralControl` keeps the global eligibility schedule until a pair's first agreed amendment, then copies it for
  the pair and applies the amendment's haircut terms to the copy. Later changes to the global schedule do not reach an
  amended pair.
- Each pair has an `agreementHash`: zero for the baseline, then the hash of the last agreed
  `CollateralAgreementAmendment`. A proposal carries `beforeHash`, which must equal it, and only one amendment is
  pending per pair. Agreed amendments therefore form one chain, and each service folds them in chain order from the
  baseline (CDM's sample 2018 NY law IM CSA with the prototype's parties and an MTA of USD 500,000).
- Elections (MTA, rounding) are not on-chain. They travel in the CDM document; the services apply them to revaluation.
  The haircuts are both in the document (`scheduleAfter`) and on-chain; a service reports the terms as verified only
  when its folded schedule and hash match the contract.
- Before consenting, the other party's service verifies the document against the terms in force and checks that the
  on-chain haircut terms are the document's haircut changes. The decision itself is a small JSON document (amendment
  id, amendment hash, consent, party, date), anchored by its hash; it is not a CDM type.

**Context.** CDM 7.7.0 holds the eligibility schedule outside the `LegalAgreement`; cdm-ext amends both in one
`CollateralAgreementAmendment`.

**Consequences.**
- A pair's terms depend on every agreed amendment's document being in the payload store; a missing document stops the
  fold and the service reports the terms as unverified.
- The amendment form changes the pledgor's MTA and one token's haircut per amendment; the API takes several haircuts.
- The live spec amends and then restores the baseline terms, so the other specs run against the baseline.
