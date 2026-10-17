```yaml
id: artifact-cdm-csa-coverage-matrix
name: CDM coverage of collateral management — ISDA credit support documents
kind: document
location: docs/analysis/cdm-csa-coverage-matrix.md
version: cdm-7.6.0
review: accepted
provenance:
  conversationId: cdm-data-taxonomy
  sourceRef: e4b447e13cef62282de0670bc02b310467ef5d04
  contentHash: e4b447e13cef62282de0670bc02b310467ef5d04
  timestamp: 2026-10-15T12:32:58Z
  confidence: 0.7
createdAt: 2026-10-15T12:32:58Z
updatedAt: 2026-10-17T01:16:19Z
```
# CDM coverage of collateral management — ISDA credit support documents

First-pass coverage matrix of CDM 7.6.0 against a reference capability map for
ISDA credit support documents: 20 capability rows scored 0–5 with file-level
evidence, plus finding F2: margin call types are not used by any function or
business event. Several rows rest on name search only, as marked in the
document.

Netting rows (and finding M5 in the findings document) were added and accepted on 2026-10-15.

Revised 2026-10-16T23:02:19Z (source `01ed3cb87a05376b16fc5b6d38e98b90a97f732d`): new row for collateral proposal and acceptance (score 2 from a check of the CDM 7.6.0
source; maintainer's reading) and a "Flows and capabilities" section mapping UI grid columns to capability rows.

Revised 2026-10-16T23:07:09Z (source `91117ab560e058b945bc3eb3e35fa977f99a88b3`): collateral proposal split into proposal (2) and acceptance or rejection (0).

Revised 2026-10-17T01:16:19Z (source `9ab0cbf86284cce4606e93eabb8507c9d009d7b7`): release note, base release CDM 7.7.0; scores unchanged.
