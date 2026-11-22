```yaml
id: task-substitution-ledger-anchors
type: task
title: Build ledger anchors for collateral substitutions
status: resolved
review: accepted
provenance:
  conversationId: tokenized-collateral
  timestamp: 2026-11-22T03:05:00Z
  confidence: 0.8
createdAt: 2026-11-22T03:05:00Z
updatedAt: 2026-11-22T20:04:22Z
```
# Task: build ledger anchors for collateral substitutions

Under [[goal-tokenized-collateral]]. G25 ([[task-cdm-gap-closure]]) anchors margin call steps and, since
[[task-authoritative-record-settlement-enforcement]], enforcements. `AnchoredRecordEnum` has `Substitution`, and the
substitution events carry the CDM hash, but the collateral service builds no substitution anchor.

Done when the service builds the `LedgerAnchor` of each substitution record from the chain events, both parties build
the same anchor, the substitution state reports its status, and the flow-substitution live spec checks it.

Scope extended 2026-11-22 (project owner): the same `AnchoredRecordEnum` extension also gives the repo, securities loan
and triparty movement records anchor kinds of their own, so `CdmRecordKeeper.movements` passes the record's
`AnchorStatus` to `TransferComplete` in place of the transaction's finality
([[task-authoritative-record-other-flows]]). The extension is agreed with [[task-document-provenance]], which adds kinds
for agreements, registry entries and valuations, before either changes it.

Decided 2026-11-22 (project owner): the triparty profile's `Deposited` and `Withdrawn` carry no CDM document, so they
have no anchor and keep the transaction's finality as their anchor status in `CdmRecordKeeper.movements`; every other
repo, loan and triparty movement passes its record's `AnchorStatus`.

Resolved 2026-11-22 (project owner), PRs #88 and #90. The collateral service builds the `Substitution` anchor of each
folded substitution step from the gateway's step events (`CdmAnchors.substitutionAnchors`), and the substitution
`cdm-state` reports `anchors`, `anchored` and `anchorHash`; `flow-substitution` checks that the three anchors are
Complete and equal on both parties. `AnchoredRecordEnum` has `Repo`, `SecuritiesLoan` and `Triparty`: the gateway's
`/register/movements` reports each movement's document hash, and `CdmRecordKeeper.movements` passes the movement
anchor's status to `TransferComplete` (`flow-registered-collateral-gmsla` checks the delivery's anchor on both parties).
The triparty profile's `Deposited` and `Withdrawn` keep the transaction's finality. Not yet exercised against chain
data: close-out and triparty purchase movements of tMMF.
