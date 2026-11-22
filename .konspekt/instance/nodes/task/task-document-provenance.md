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
updatedAt: 2026-11-22T03:51:06Z
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
