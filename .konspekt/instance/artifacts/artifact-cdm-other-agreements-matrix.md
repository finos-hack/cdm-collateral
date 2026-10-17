```yaml
id: artifact-cdm-other-agreements-matrix
name: CDM coverage of collateral management — repo, securities lending, triparty, CCP margin
kind: document
location: docs/analysis/cdm-other-agreements-coverage-matrix.md
version: cdm-7.6.0
review: accepted
provenance:
  conversationId: cdm-data-taxonomy
  sourceRef: 0b576199aa677a19c4afe85ad893f9bdd3466fb1
  contentHash: 0b576199aa677a19c4afe85ad893f9bdd3466fb1
  timestamp: 2026-10-15T23:10:47Z
  confidence: 0.7
createdAt: 2026-10-15T23:10:47Z
updatedAt: 2026-10-17T01:16:19Z
```
# CDM coverage of collateral management — repo, securities lending, triparty, CCP margin

First-pass coverage matrices for four agreement families (GMRA repo, GMSLA
securities lending, triparty, CCP margin) on CDM 7.6.0, using the CSA matrix
method, with findings O1–O3 and O8–O12 (O4–O7 removed at the owner's request) and a cross-family comparison including the CSA
scores. Method step 5 (cross-check against release notes and working-group
scope) not yet done. Several rows rest on name search only, as marked.

Netting rows (and finding M5 in the findings document) were added and accepted on 2026-10-15.

Revised 2026-10-16T23:02:27Z (source `01ed3cb87a05376b16fc5b6d38e98b90a97f732d`): rows R24, S26 (collateral proposal and acceptance, score 2), T16, C17 (not applicable),
a cross-family comparison row and a "Flows and capabilities" section mapping UI grid columns to capability rows.

Revised 2026-10-16T23:07:09Z (source `91117ab560e058b945bc3eb3e35fa977f99a88b3`): collateral proposal split into proposal (2) and acceptance or rejection (0);
added C18 collateral substitution at the CCP (2).

Revised 2026-10-17T01:16:19Z (source `9ab0cbf86284cce4606e93eabb8507c9d009d7b7`): release note, base release CDM 7.7.0; scores unchanged.
