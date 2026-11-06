```yaml
id: investigation-adr-asr-traceability
type: investigation
title: Make every ADR traceable to the ASRs that drive it
status: active
review: proposed
provenance:
  conversationId: adr-asr-traceability
  sourceRef: 0953f7c00879df50b76efe55dc3ad8bdd95ed118
  contentHash: 0953f7c00879df50b76efe55dc3ad8bdd95ed118
  timestamp: 2026-11-06T21:34:07Z
  confidence: 0.8
createdAt: 2026-11-06T21:34:07Z
updatedAt: 2026-11-06T21:34:07Z
```
# Investigation: make every ADR traceable to the ASRs that drive it

The konspekt view's Decisions tab listed 3 of this instance's 23 ADRs. It lists an ADR only under an ASR with a
`drives` edge to it, and on 2026-11-06 only `wp-adr-prototype-ledgers`, `wp-adr-margin-call-state-onchain` and
`wp-adr-cdm-payload-carrier` had one; `wp-adr-cancellation-blocks-call` was the reported example. The engineer persona
defines an ADR's context as its inbound `drives` edges from ASRs, so the other 20 ADRs had no recorded context.

Scope, as set by the project owner (2026-11-06):
- In this instance, propose `drives` edges from the ASR behind each ADR that has one.
- In the konspekt standard, list the ADRs no ASR drives in the view, and warn in conformance on an ADR with no
  inbound `drives` edge. The owner classes the missing warning as a konspekt defect.
- Once every ADR passes that check, build the `adrs` list in `architecture/generate_architecture.py` from the ADR
  waypoints on disk in place of the hard-coded six.

Proposed `drives` edges (each `review: proposed`; the basis is the maintainer's reading of the ADR body):

| edge | ASR | ADR | basis |
|------|-----|-----|-------|
| `e-drv-cdmdata-amendterms` | `concept-asr-cdm-data-layer` | `wp-adr-amendment-per-pair-terms` | the amendment is a CDM document whose hash the other party consents to on-chain |
| `e-drv-callstate-cancelblocks` | `concept-asr-onchain-call-state` | `wp-adr-cancellation-blocks-call` | the call carries its cancellation state on-chain and blocks movements while a request is pending |
| `e-drv-cdmdata-cancelblocks` | `concept-asr-cdm-data-layer` | `wp-adr-cancellation-blocks-call` | each cancellation step is a cdm-ext MarginCallInstruction anchored by its hash |
| `e-drv-cdmdata-cdmevents` | `concept-asr-cdm-data-layer` | `wp-adr-cdm-collateral-events` | margin call steps recorded as a CDM-shaped CollateralEvent with CDM TransferState |
| `e-drv-cdmdata-extrune` | `concept-asr-cdm-data-layer` | `wp-adr-cdm-extension-rune` | CDM extensions written in Rune and generated like CDM |
| `e-drv-cdmdata-localext` | `concept-asr-cdm-data-layer` | `wp-adr-cdm-local-extensions` | CDM gaps closed by local extensions |
| `e-drv-cdmdata-closeout` | `concept-asr-cdm-data-layer` | `wp-adr-closeout-contract-applies-collateral` | the service computes the CDM CloseOutStatement and passes its hash |
| `e-drv-finality-closeout` | `concept-asr-settlement-finality` | `wp-adr-closeout-contract-applies-collateral` | the contract applies collateral at close-out, which the ASR names as relying on finality |
| `e-drv-cdmdata-consolerules` | `concept-asr-cdm-data-layer` | `wp-adr-console-on-extension-rules` | the console runs on the CDM extensions' rules |
| `e-drv-callstate-imseg` | `concept-asr-onchain-call-state` | `wp-adr-im-segregation` | the control contract accepts a pledge only against an agreed call |
| `e-drv-finality-imseg` | `concept-asr-settlement-finality` | `wp-adr-im-segregation` | segregated IM is held and moved by the contract on the ledger |
| `e-drv-cdmdata-interestsettle` | `concept-asr-cdm-data-layer` | `wp-adr-interest-onchain-settlement` | the CDM interest statement hash is anchored on-chain |
| `e-drv-finality-interestsettle` | `concept-asr-settlement-finality` | `wp-adr-interest-onchain-settlement` | interest settles by an on-chain tUSD transfer |
| `e-drv-cdmdata-interestrules` | `concept-asr-cdm-data-layer` | `wp-adr-interest-rate-rules-and-withholding` | how cdm-ext reads CDM CollateralInterestParameters |
| `e-drv-cdmdata-javastack` | `concept-asr-cdm-data-layer` | `wp-adr-java-cdm-stack` | CDM and the extension run on CDM's Java distribution |
| `e-drv-callstate-perparty` | `concept-asr-onchain-call-state` | `wp-adr-per-participant-services` | each party signs its own call-state changes with its own key |
| `e-drv-callstate-reval` | `concept-asr-onchain-call-state` | `wp-adr-revaluation-outstanding-im-from-calls` | the requirement is read from the on-chain state of settled calls |
| `e-drv-callstate-subst` | `concept-asr-onchain-call-state` | `wp-adr-substitution-fold-portfolio` | each substitution step is anchored by its hash on-chain |
| `e-drv-cdmdata-subst` | `concept-asr-cdm-data-layer` | `wp-adr-substitution-fold-portfolio` | each step is a CDM SubstitutionInstruction folded through cdm-ext |

No recorded ASR matches these ADRs, so they stay without a `drives` edge and the new check warns on them:
- `wp-adr-ci-runs-live-specs`
- `wp-adr-cloud-dev-environment`
- `wp-adr-console-same-origin-proxy`
- `wp-adr-oracle-prices-on-request-ratings-offchain`
- `wp-adr-ux-scenario-grid`

`wp-adr-live-stack-local-ui-driven` is superseded by `wp-adr-ci-runs-live-specs` and is exempt from the check.
