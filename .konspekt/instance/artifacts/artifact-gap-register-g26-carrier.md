```yaml
id: artifact-gap-register-g26-carrier
name: Gap register G26: need-site after the payload carrier
kind: doc
location: docs/analysis/gap-register.md
createdAt: 2026-10-25T15:09:55Z
updatedAt: 2026-10-25T15:09:55Z
review: accepted
provenance:
  sourceRef: 42bf64bf7ca0a7f912644a77ac14af106abde3dc
  contentHash: 42bf64bf7ca0a7f912644a77ac14af106abde3dc
  conversationId: spec-writer-2026-10-25
  timestamp: 2026-10-25T15:10:09.711Z
  confidence: 0.5
```
# Artifact: Gap register G26 need-site after the payload carrier

Revision of one row of `../../../docs/analysis/gap-register.md` (recorded as `artifact-cdm-gap-register`) for
`task-cdm-gap-closure`. G26 (no mapping to ISO 20022 colr or FpML collateral messages) names its need-site as
"off-chain messages between services (`service-to-peer-service`)". ADR `wp-adr-cdm-payload-carrier` (review:
proposed) and the CALM revision `artifact-architecture-payload-carrier-revision` retire that relationship; CDM content
now passes as documents through the payload store. The revision changes the need-site to "off-chain CDM documents
between services (`service-to-payload-store`, ADR `wp-adr-cdm-payload-carrier`)". No other row changes.

Unresolved: this revises a document already recorded by `artifact-cdm-gap-register`, and depends on the CALM revision
proposed beside it.
