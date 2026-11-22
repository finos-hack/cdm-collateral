```yaml
id: task-document-provenance
type: task
title: Provenance record linking a tokenized asset to its identities and legal documents
status: open
review: accepted
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4
  timestamp: 2026-11-21T21:42:22Z
  confidence: 0.75
createdAt: 2026-11-21T21:42:22Z
updatedAt: 2026-11-22T15:20:46Z
```
# Task: provenance record linking a tokenized asset to its identities and legal documents

Under [[goal-tokenized-collateral]]; gap G41 (finding N2). A secured party, an auditor or a court needs to follow the
path from a pledged token back to the asset it represents: the parties (LEIs), the asset identifiers (ISIN or CUSIP;
for an aircraft, manufacturer, model and MSN), the documents that create each link (security or loan agreement, the
registry entry that perfects it, the SPV's constitution, the token terms, the valuation), and the token (DTI, network,
contract). Today each link is held by a different record keeper and none of them refers to the others. CDM 7.7.0
attachments carry no content hash, and `relatedAgreements` links agreements only to other agreements.

Decisions so far (project owner, 2026-11-21):

- **Scope:** every tokenized asset the prototype holds (tUST, tMMF, tUSD) and the aircraft case
  ([[task-sme-registered-asset-completion]], G40).
- **Pilot:** tUST (2026-11-21): a Bearer token, so the ledger is the authoritative record, with the fewest documents
  behind it. tMMF follows, to test a register kept off the ledger.
- **Format:** existing standards mapped to CDM, for interoperability (2026-11-21): W3C PROV-O for the graph of
  links between identities and documents, and W3C Verifiable Credentials for the record keepers' signed statements
  that a link holds.

To decide: which links carry a content hash and are anchored with `LedgerAnchor`
(new anchor kinds for agreements, registry entries and valuations); how amendments and re-valuations supersede earlier
links. Questions for an SME: [[task-sme-document-provenance]].

Overlaps with work merged since (PR #75, 2026-11-21):

- `TokenizedAsset.controlAgreement` references the control agreement (UCC 8-106) as a plain string. It is one of the
  links this record covers: it needs a content hash, a record keeper and validity dates like the others. It matters
  for tMMF and other Registered or Claim tokens, not for the tUST pilot (a Bearer token needs no control agreement).
- The record keeper's register (`CdmRecordKeeper`, the transfer-agent stand-in, `LedgerFact` and the register
  reconciliation) is where a record keeper's signed statements about holdings would come from.
- [[task-substitution-ledger-anchors]] builds substitution anchors in the collateral service. New anchor kinds for
  agreements, registry entries and valuations extend the same `AnchoredRecordEnum` and the same anchor-building code,
  so the two tasks agree on the extension before either changes it.

Done when, for the pilot asset, a function walks the path from a pledged token to the asset's authoritative record,
checks each document hash against its anchor, and reports any link that is missing or superseded, with tests.

**tUST pilot built (2026-11-22, [[wp-adr-document-provenance]]).**

- `cdm-ext`: `AnchoredRecordEnum` gains `AssetDocument`, `Valuation` and `RegistryEntry`; the record hash is keccak-256
  over the record's JCS canonical form. `LedgerTest` covers an `AssetDocument` anchor.
- `contracts/ProvenanceAnchors.sol`: emits `ProvenanceAnchored(token, linkId, cdmHash, revisionOf, anchoredBy)`, one
  chain of revisions per link (a revision must name the current head). Agreements between two parties stay anchored in
  `CollateralControl` and `TripartySettlement`; no existing contract was keyed by token, so the token-level anchor
  events needed their own emitter.
- `services/collateral`: `ProvRecords` (PROV-O JSON-LD link records), `Jcs` (RFC 8785, integers only),
  `ProvCredentials` (Verifiable Credentials on P-256 `did:key`, `ecdsa-jcs-2019`), `ProvenanceCheck` (the path walk),
  with fixture documents under `src/test/resources/provenance/tust/` and `ProvenanceCheckTest`.

The check reports, per relation of the path: missing, not anchored, anchor not complete, conflicting current records,
document missing or altered, unattested or bad credential, and superseded against the version the secured party pinned
at the pledge. By asset: issuance against a holding other than the custody record's, issuance beyond the face amount
held, a second token on the same holding (double tokenization), and units on the ledger beyond the units issued.

**tMMF case built (2026-11-22).** `ProvenanceCheck` takes the token's profile from the gateway's registry
(`authoritativeRecord`, `recordKeeper`, `controlAgreement`) and the pledge's secured party. For a Registered or Claim
token the path is issuance, token terms, the record keeper's register statement (in place of the custody record),
constitution, valuation and the control agreement (interim rule REG-3 of [[task-sme-registered-asset-completion]]).
It also reports a register statement or control agreement not from the token's record keeper, a control agreement
other than the one the token names, and one with another secured party. The holding terms are now `amountBacking`
(issuance) and `amountHeld` (custody record or register statement), since fund shares have no face amount. Fixture
documents under `src/test/resources/provenance/tmmf/`; `ProvenanceTmmfTest` (10 tests).

Not yet done: deploying `ProvenanceAnchors` and reading its events through the gateway into the collateral service, a
console view and a live spec; `RegistryEntry` links (the aircraft case, G40). The credential proofs are not checked
against the W3C Data Integrity test suite.
