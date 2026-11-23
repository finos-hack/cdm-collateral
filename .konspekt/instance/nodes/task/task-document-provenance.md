```yaml
id: task-document-provenance
type: task
title: Provenance record linking a tokenized asset to its identities and legal documents
status: resolved
review: accepted
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4
  timestamp: 2026-11-21T21:42:22Z
  confidence: 0.75
createdAt: 2026-11-21T21:42:22Z
updatedAt: 2026-11-23T01:21:52Z
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

**Wired to the live stack (2026-11-22).** `deploy.ts` deploys `ProvenanceAnchors` and records it in the registry
(`contracts.provenanceAnchors`; a deployment made before this has none, and needs a reset to get it). The gateway reads
its events (`GET /ledger/v1/provenance/anchors`, `GET /ledger/v1/provenance/head/:linkId`) and anchors through the
party's key (`POST /ledger/v1/provenance/anchor`). The collateral service checks every token from what the ledger and
the payload store hold, nothing from its own state (`ProvenanceLive`; `GET /api/v1/provenance`,
`GET /api/v1/provenance/{symbol}`, with `?securedParty=`), so both parties read the same result. Each anchored hash is a
PROV-O link record or a record keeper's credential, which is anchored under its own link so the check can find it.
`POST /api/v1/provenance/seed` writes the fixture provenance of tUST and tMMF once (`ProvenanceFixtures`: synthetic
documents, moved to `src/main/resources/provenance/`; record keeper keys made for the fixture and not kept). The party
consoles show a Provenance card (`ProvenanceCard`). Live spec `flow-provenance`: A seeds through its console, both
parties read each path complete and identical, and a pledge of tMMF to bank-c is not covered by its control agreement.

**Registry entries: the aircraft case (2026-11-22).** For a token whose asset is kept in registries outside the ledger
(profile `assetRegistry`, for example "FAA Aircraft Registry"), the path is issuance, token terms, the registry's
registration of the owner (`cdmx:Registration`, in place of the custody record), constitution and valuation. Every
interest the registry shows in the asset (`cdmx:RegisteredInterest`, for example a mortgage registered as an
international interest in the International Registry) needs the interest holder's consent to the token
(`cdmx:InterestConsent`, attested by the holder), else `InterestNotConsented`. That consent rule is interim, pending
REG-8 of [[task-sme-registered-asset-completion]]. Registrations and interests are anchored as `RegistryEntry`.
Interests are taken per link, since an asset can carry several. Fixture documents under
`src/main/resources/provenance/aircraft/`; `ProvenanceAircraftTest` (8 tests). There is no aircraft token in the
deployment: CDM 7.7.0 has no asset type for it (G40), and the asset is a URN of manufacturer, model and MSN.

**Provenance gate (2026-11-22).** The deployment marks tUST and tMMF `provenanceRequired`. The secured party's service
refuses to accept a margin call proposal, or to consent to a substitution, with a marked token whose provenance path
for a pledge to it is not complete (`ProvenanceLive.refusal`); unmarked tokens are not checked, and a deployment without
the mark behaves as before. `scripts/live-e2e.sh up` seeds the fixture provenance when the deployment requires it and
nothing is anchored. The other flows apply the same gate at the step where the receiving party takes the collateral (2026-11-22): the
repo buyer's affirmation and its agreement to a substitution (the purchased securities); the securities lender's booking
and its agreement to a collateral substitution; the triparty receiver's settlement of the purchase against the
allocation, and the agent's substitution for the receiver; and the CCP's acceptance of a repo for clearing. CCP margin
and default fund payments are in tUSD, which is not marked. The credential proofs are not checked against the W3C Data Integrity test suite.

**Resolved 2026-11-22** by the project owner (source `ni:///sha-256;oNnx3i6ACO-jMJv1RjUzYyJY9r_aDT-qpXzUueFiMxY`): the done-when holds for the tUST pilot (`ProvenanceCheck`, `ProvenanceCheckTest`), and the tMMF and aircraft cases, the live stack wiring and the provenance gate are built on `main`. Not built, as the gap register records under G41: provenance for tUSD, a check at revaluation or on amendment (waits on PROV-2), and a check of the credential proofs against the W3C Data Integrity test suite.
