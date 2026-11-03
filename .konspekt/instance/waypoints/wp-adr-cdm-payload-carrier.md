```yaml
id: wp-adr-cdm-payload-carrier
kind: decision
subtype: adr
timestamp: 2026-10-24T22:39:50Z
review: accepted
provenance:
  conversationId: e2e-wiring
  sourceRef: 1f2f8020c00697a79ad759b8412ab8183e589a38
  contentHash: 1f2f8020c00697a79ad759b8412ab8183e589a38
  timestamp: 2026-10-24T22:39:50Z
  confidence: 0.8
createdAt: 2026-10-24T22:39:50Z
updatedAt: 2026-11-03T03:25:20Z
```
# ADR: CDM payload carrier — off-chain content-addressed store anchored by the on-chain hash

For service-to-peer CDM exchange and the cumulative `MarginCallState` fold, the CDM document of each lifecycle step
travels **off-chain in a content-addressed store keyed by its on-chain keccak-256 hash**. The chain carries only the
32-byte `cdmHash` commitment plus a per-step event; it does not carry the document. A party's gateway, on seeing a
step event for a call it is in, fetches the document from the store by the event's `cdmHash`, checks
`keccak256(payload) == cdmHash`, and hands it to the workflow service, which folds the step into its `MarginCallState`
via `Create_MarginCallState`. The store is a standalone service for the prototype. The IM flow
(`flow-im-margin-call-pledge`) is wired first, structured to generalise to the other CALM flows.

**Context.** The first cycle shares call state through the chain and omits the `service-to-peer-service` CDM exchange
(`nw-e2e-first-cycle-scope`). To maintain a cumulative, validated `MarginCallState`, each party needs the other's CDM
documents. Putting the documents on-chain is infeasible — size, gas, and confidentiality (consortium validators read
on-chain state, collateral terms are bilateral). The classic Besu mechanism for confidential bilateral payloads,
Tessera-based privacy groups, is deprecated (Besu 24.12.0) and removed from mainline (reported ~25.6.0); its successor,
LF Decentralized Trust's Paladin (Pente privacy domains), couples the carrier to one ledger's privacy model and works
against `concept-asr-ledger-neutrality`. An off-chain store keyed by the on-chain hash is production-legitimate,
ledger-neutral, and reuses the keccak-256 hash (ADR `wp-adr-java-cdm-stack`; commit `aa342a9`) as both the retrieval
key and the integrity check. Driven by `concept-asr-ledger-neutrality` and `concept-asr-cdm-data-layer`.

**Decision detail.** Every step is anchored by an on-chain `cdmHash`. Today `CallIssued`, `CallAnswered` and
`CollateralProposed` carry one; `ProposalDecided` and `CallSettled` do not — so `cdmHash` is added to `decideProposal`
and the settle path (`markSettled`, threaded through `CollateralControl.pledge`). The chain supplies total ordering
(block / transaction index), notification (events the gateway subscribes to), non-repudiation (the issuer signed the
hash) and durable replay (a gateway resumes from the last processed block, idempotent by call and step). The gateway
gains store read/write, event subscription and hash verification; the collateral service maintains one
`MarginCallState` per call, persisted as Rune JSON, folding its own and the peer's steps in chain order.

**Consequences.** Lifts the no-peer-messaging reduction of `nw-e2e-first-cycle-scope` (that note is amended when the
code lands). Requires a contract change (decide/settle hash anchoring) and redeploy, a new standalone store service,
and the gateway and service changes above. Production shape is a shared content-addressed store or IPFS with access
control; protocol-layer privacy (e.g. Canton/Daml) is a platform change and out of scope here. Unverified until
implemented: the fold across both services for the IM flow; behaviour of the store and verification under the four
remaining CALM flows.

Accepted by the project owner on 2026-11-03 (source `2d89f9ce09676a084c6672f5a9ba1b887d6112c5`).
