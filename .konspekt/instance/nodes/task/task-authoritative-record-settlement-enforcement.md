```yaml
id: task-authoritative-record-settlement-enforcement
type: task
title: Make settlement and enforcement depend on the token's authoritative record
status: open
review: accepted
provenance:
  conversationId: tokenized-collateral
  sourceRef: ni:///sha-256;aJTyNDE7zn5LV5S5ukttpknDpzHaSsIWhmvpRGu1YQQ
  timestamp: 2026-11-20T20:06:53Z
  confidence: 0.8
createdAt: 2026-11-20T20:06:53Z
updatedAt: 2026-11-22T02:58:01Z
```
# Task: make settlement and enforcement depend on the token's authoritative record

Under [[goal-tokenized-collateral]]. G24 ([[task-cdm-gap-closure]]) records for each token which record is legally
authoritative (`AuthoritativeRecordEnum`: Bearer, Registered, Claim). Settlement (G4) and enforcement (G14) do not read
it: a mined on-chain transfer counts as complete for every asset.

Done when:

- For a Bearer asset, settlement and enforcement behave as today.
- For a Registered or Claim asset (tMMF in the prototype), a movement or enforcement is complete only after the record
  keeper's confirmation, in the extension (`cdm-ext`) and in the prototype services.
- Tests cover each of the three values.

Blocked on the SME's answer to what the confirmation is ([[task-sme-registered-asset-completion]]).
Unblocked 2026-11-21 by the project owner's interim decisions recorded there (confirmation required for
settlement and enforcement; a record-keeper control agreement for eligibility; the record keeper's record prevails,
a mismatch is a break). The SME's answers may still change them.

## Design decisions (project owner, 2026-11-21)

- **Record keeper:** a transfer-agent role in the oracle service, signing with the mkt key. It watches tMMF moves into
  and out of escrow, updates its own register and writes a confirmation on chain.
- **Scope:** CSA settlement (pledge, transfer, return) and CSA enforcement. Repo, GMSLA and triparty flows stay as
  they are and are follow-ups.
- **Enforcement hash:** the service builds an `EnforcementInstruction` with `Create_CollateralEnforcement`, stores it,
  and the contract's `enforce` takes and emits its `cdmHash`, so an Enforcement `LedgerAnchor` can be built.
- **Control agreement:** recorded in the token registry (`deploy.ts` `TOKENS`) with `authoritativeRecord` and
  `recordKeeper`; a Registered or Claim token without one is not eligible.

## Progress (2026-11-21)

Built for the CSA flows, as decided above:

- `cdm-ext`: `TokenizedAsset.controlAgreement`, `EligibleUnderControl` (REG-3), `RegisterBreaks` (REG-5),
  `RecordKeeperConfirmation.transactionHash`; `TransferComplete` cites the interim rules. `LedgerTest` 20 tests.
- Contracts: `RecordKeeperRegister` (the record keeper's `RegisterConfirmed` events); `CollateralControl.enforce`
  takes and emits the `cdmHash` of the CDM `CollateralEnforcement`. 145 contract tests.
- `deploy.ts`: tMMF is Registered, kept by "MMF Transfer Agent" under control agreement `CA-TMMF-2026-01`; a
  Registered or Claim token without one is not made eligible.
- Gateway: `/calls/{id}/enforcement`, `/register/tokens`, `/register/transfers`, `/register/confirmations`;
  `RegisterConfirmed` is relayed to the services.
- Oracle service: `TransferAgent` keeps the tMMF register and confirms each transaction that moves tMMF;
  `PUT /oracle/v1/register/paused` holds it for tests.
- Collateral service: `cdm-state` reports `recordKeeper` and `settlementComplete` (`CdmRecordKeeper`, outside the
  fold cache); `enforce` builds, stores and anchors a `CollateralEnforcement` (`CdmEnforcement`);
  `/calls/{id}/enforcement` and `/register/breaks`; the baseline schedule applies `EligibleUnderControl`.
  `CdmRecordKeeperTest` 7 tests.
- Live spec `flow-registered-collateral`: a tMMF pledge and its enforcement each wait for the transfer agent, and the
  register shows a break until it confirms. Local run after a reset: 54 passed.

Not done: repo, GMSLA and triparty flows do not apply the rule; the console does not show the completion.
