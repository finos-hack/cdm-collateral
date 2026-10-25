```yaml
id: artifact-architecture-payload-carrier-revision
name: Prototype architecture revision for the CDM payload carrier and event push
kind: doc
location: architecture/README.md
createdAt: 2026-10-25T15:09:55Z
updatedAt: 2026-10-25T15:09:55Z
review: proposed
provenance:
  sourceRef: 42bf64bf7ca0a7f912644a77ac14af106abde3dc
  contentHash: 42bf64bf7ca0a7f912644a77ac14af106abde3dc
  conversationId: spec-writer-2026-10-25
  timestamp: 2026-10-25T15:10:03.154Z
  confidence: 0.55
```
# Artifact: Prototype architecture revision for the CDM payload carrier and event push

Revision of the prototype architecture (`architecture/README.md` and the CALM model `architecture/prototype.architecture.json`,
recorded as `artifact-prototype-architecture`) for `goal-architecture-design`. It closes the ambiguity that the
architecture surfaces, last changed 2026-10-18, still describe a direct `service-to-peer-service` HTTP channel, a
ledger-event webhook, no payload store and a "design only" status, while ADR `wp-adr-cdm-payload-carrier` (review:
proposed) and the `task-e2e-wiring` commits of 2026-10-24 (`6530b14`, `3a89b7c`, `2494e39`, `688ba4b`, `9a5c8e1`,
`ac6474a`) moved CDM content to a content-addressed store anchored by the on-chain hash.

The four carried files land together; the JSON is generated from `generate_architecture.py` and drawn by
`render_architecture_page.py`. Content:

1. **CALM model.** Adds the shared `cdm-payload-store` node (`/store/v1`, per-party bearer token, fails closed);
   replaces `service-to-peer-service` with `service-to-payload-store`; replaces the `/hooks/ledger-events` webhook with
   Server-Sent Events (gateway `/ledger/v1/events`, service `/api/v1/events`); records a `cdmHash` on every lifecycle
   step event; gateway library viem; rewrites `flow-im-margin-call-pledge`, `flow-return` (`returnCollateral`
   replaces `returnPledge`) and `flow-default-enforcement` to the store-and-chain path; status "partially built"; ADR
   list adds `wp-adr-java-cdm-stack` and `wp-adr-cdm-payload-carrier`. `calm validate --strict` (CALM CLI 1.40.0):
   0 errors, 0 warnings.
2. **Renderer.** Payload store box and edge; the diagram label says CDM 7.7.0 instead of 7.6.0.
3. **README.** Build status, component table, diagram, the implemented endpoints (component READMEs stay the
   authority), flows and assumptions; the `participants.json` reference is removed (no such file in the repository).

Unverified: the rendered diagram layout was not inspected visually. Inference, not settled by canonical: with no
service-to-service channel, `flow-default-enforcement` has the pledgor learn of a default from the on-chain feed
through its own gateway; that flow is not built.
