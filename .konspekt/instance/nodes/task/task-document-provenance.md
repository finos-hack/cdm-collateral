```yaml
id: task-document-provenance
type: task
title: Provenance record linking a tokenized asset to its identities and legal documents
status: open
review: proposed
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;hLFf7CFgc6WW1OwyK7s2p6b7LR0GXiCsU-NNIiIW-a4
  timestamp: 2026-11-21T21:42:22Z
  confidence: 0.75
createdAt: 2026-11-21T21:42:22Z
updatedAt: 2026-11-21T21:42:22Z
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
- **Pilot:** one simple asset first; which one is still open.
- **Format:** an existing provenance standard mapped to CDM, for interoperability, not types defined only in
  `cdm-ext`. Candidates to compare: W3C PROV-O, and W3C Verifiable Credentials for the attested links.

To decide: the pilot asset; the standard; which links carry a content hash and are anchored with `LedgerAnchor`
(new anchor kinds for agreements, registry entries and valuations); how amendments and re-valuations supersede earlier
links. Questions for an SME: [[task-sme-document-provenance]].

Done when, for the pilot asset, a function walks the path from a pledged token to the asset's authoritative record,
checks each document hash against its anchor, and reports any link that is missing or superseded, with tests.
