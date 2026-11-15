```yaml
id: artifact-payload-carrier-component-docs
name: Component documentation for the CDM payload carrier
kind: doc
location: store/README.md
createdAt: 2026-10-25T15:09:55Z
updatedAt: 2026-10-25T15:09:55Z
review: accepted
provenance:
  sourceRef: ni:///sha-256;aWQYY003A94yE5wa3kfg9m5HHnl4OvKcaD_Q2desmxY
  conversationId: spec-writer-2026-10-25
  timestamp: 2026-10-25T15:10:09.382Z
  confidence: 0.65
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 42bf64bf7ca0a7f912644a77ac14af106abde3dc
    contentHash: 42bf64bf7ca0a7f912644a77ac14af106abde3dc
```
# Artifact: Component documentation for the CDM payload carrier

Corrections to three component surfaces for `task-e2e-wiring` that disagree with the code on canonical after the
2026-10-24 payload-carrier commits (ADR `wp-adr-cdm-payload-carrier`, review: proposed). It closes the ambiguity of
documentation that contradicts the implementation:

1. **`store/README.md`.** Still documents an unauthenticated `X-Party` header. Commit `ac6474a` replaced it with a
   per-party bearer token (`PARTY_TOKENS` in `store/src/server.ts`, `STORE_TOKEN` per service from
   `orchestrate.mjs`). The revision adds an Authentication section (401 on absent or unknown token, fail-closed with no
   tokens), the 400 / 403 rules of `POST /store/v1/docs`, a run line with `PARTY_TOKENS`, and replaces the
   "asserted identity" reduction with "shared-secret authentication".
2. **`contracts/README.md`.** States that "every call and proposal records a CDM content hash". Commit `6530b14` added
   `cdmHash` to `decideProposal` and `markSettled`; all five step events (`CallIssued`, `CallAnswered`,
   `CollateralProposed`, `ProposalDecided`, `CallSettled`) carry it, and `markSettled` is called from `pledge`,
   `settleByTransfer`, `returnCollateral` and `returnByTransfer` (`contracts/contracts/CollateralControl.sol`).
3. **`Cdm.java` class comment.** States that steps are not folded into a shared `MarginCallState`; commit `2494e39`
   added `CdmFold.fold`. Comment-only change; no behaviour change.

Each statement was checked against the source files named above on canonical `e2e-wiring`.
