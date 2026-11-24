```yaml
id: investigation-onchain-data-protection
type: investigation
title: Protect on-chain collateral data from participants who are not party to it
status: active
review: proposed
provenance:
  conversationId: onchain-data-protection
  sourceRef: ni:///sha-256;rzAan8TnjhbAFnMqQ0ZNYZxReN3y3SlgTmAX6__Tqy4
  timestamp: 2026-11-23T01:51:26Z
  confidence: 0.75
createdAt: 2026-11-23T01:51:26Z
updatedAt: 2026-11-24T00:44:30Z
```
# Investigation: protect on-chain collateral data from participants who are not party to it

The project owner asked (2026-11-22) to start an investigation bound to `nw-assumption-besu-visibility` and to work
out what could be done to protect the information that assumption exposes. The investigation feeds
`task-onchain-privacy` and the design note proposed by `artifact-onchain-privacy-design`; it does not replace them.

## Observations (this session)

- `contracts/contracts/` holds 12 contracts. Their events carry counterparty addresses and values in clear, among
  them `MarginCall.CallIssued` / `CallAnswered` (called, agreed, disputed amounts), `CollateralControl.Pledged`,
  `ClosedOut`, `InterestStated`, `SettlementNetted`, `CcpClearing.MarginStatementIssued` (per-member `vm`, `im`),
  `MemberDefaulted` (with `loss`), `WaterfallApplied`, `RepoSettlement.DefaultNoticeServed`,
  `SecuritiesLoan.LoanBilled`, `TripartySettlement.Deposited`, and `OracleFeed.DefaultPublished(party, inDefault)`.
  `nw-assumption-besu-visibility` names only margin call amounts, states and pledges.
- `architecture/README.md` lines 57, 69, 79: each participant (pledgor, secured party, market operator) runs its own
  QBFT validator node. Every participant therefore holds the full chain state, so access control at a gateway or
  JSON-RPC endpoint does not hide data from another participant under this topology.
- `architecture/README.md` line 74: CDM document bodies are already held off-chain in the payload store with a
  per-document reader allowlist of the call's two counterparties. The exposure is the on-chain record, not the CDM
  content.
- Besu documentation marks Tessera-based private transactions deprecated from 24.12.0; `task-onchain-privacy`
  records that Besu 26.9.0 has no private transactions.
- Paladin (LF Decentralized Trust project) runs as a sidecar beside a Besu node and provides three privacy domains:
  Pente (private EVM contracts in privacy groups, executed in an ephemeral Besu EVM), Noto (notary-backed tokens) and
  Zeto (ZKP-backed tokens). The LFDT project proposal describes it as the successor of Tessera. Source: Paladin and
  LFDT documentation fetched by search in this session; not exercised.

## Data classes and readers

Data classes to protect: (D1) who has an agreement with whom; (D2) amounts and quantities; (D3) lifecycle state that
signals credit events (dispute, default, close-out, enforcement); (D4) transaction metadata (sender, timing, nonce).
Readers to consider: the two parties; the custodian, triparty agent or CCP where the agreement names one; the
oracle; a regulator; every other participant (none of D1-D3).

## Options under examination

Each option is a proposal for assessment; none is selected.

| # | Option | Hides | Cost or limit (inferred unless marked) |
|---|--------|-------|----------------------------------------|
| O1 | Data minimization: drop or hash fields the contract does not need to enforce a rule (dispute amounts, CCP VM/IM, waterfall breakdown, close-out figures) | part of D2, D3 | Low effort. Fields that escrow or a contract check reads stay in clear. |
| O2 | Pseudonymous per-agreement addresses; the address-to-party map stays in each workflow service | part of D1 | Token funding flows and the per-address oracle default flag can relink addresses. |
| O3 | Commitments with off-chain reveal: store a salted hash of amounts; the contract checks both parties' signatures over the commitment | D2 for calls and statements | Does not work for ERC-20 balances that `CollateralControl` moves (`artifact-onchain-privacy-design` item 4). |
| O4 | Field encryption to the counterparties' keys | D2, D3 from non-parties | The contract cannot evaluate encrypted values (for example pledge not above agreed amount); that check moves off-chain or to a proof. Key distribution per pair. |
| O5 | Zero-knowledge proofs and confidential tokens (for example Zeto) | D2 with on-chain rule checks | Highest effort; circuit per rule. |
| O6 | Paladin on Besu: a Pente privacy group per deal runs the call, dispute, escrow and close-out logic; collateral and cash tokens are Noto or Zeto tokens. Noto and Zeto run no general contract logic (owner, source `496b3ce…`); a Noto token in `hooks` mode calls a Pente private contract on each mint and transfer, and a Noto token can be swapped atomically with an asset a Pente contract manages (Paladin documentation, read this session) | D1-D3 from non-members; base chain holds commitments | A Noto token has one notary, which validates every transfer of that token, including transfers in deals the notary is not party to (inferred). Adds a Paladin sidecar per participant and a port of the Solidity contracts into Pente. Further limits (`docs/analysis/bank-use-of-besu.md`): group membership is fixed when the group is created; every member signs every transition; group creation and transition timing are visible to every validator; Paladin had not shipped V1 and all maintainers were from Kaleido (LFDT TAC 2026 review). |
| O7 | Network topology: a Besu network per agreement or per CCP membership; or operator-run validators with participants reading through a per-party filtered gateway | D1-D3 by separation | Breaks the single shared ledger; collateral moving across networks needs a bridge; the filtered-gateway variant trusts the operator. |
| O8 | Canton, the planned second ledger (`wp-adr-prototype-ledgers`). Documented mechanism (Canton and Digital Asset documentation, read 2026-11-23, not exercised): each transaction is split into views per stakeholder group, each view is encrypted to its recipients, and each participant node stores only its hosted parties' contracts. Visibility is declared in the Daml template (signatories, observers, controllers); a regulator can be an observer, or receive contracts by explicit disclosure. | D1-D3 from non-participants; documentation states non-stakeholders do not learn that a transaction happened | Synchronizer sequencers see recipient lists and message sizes (one Canton page says metadata is encrypted entirely; the ordering-layer page is the more specific). Fetching a contract inside a transaction can widen visibility (divulgence). A regulator observer on the deal contract sees all of it, so "some" needs a separate contract or explicit disclosure (inferred). Licence: open-source edition Apache 2.0 at `github.com/digital-asset/canton` and Daml Apache 2.0; Digital Asset maintains it and sells an Enterprise edition, which in 2023 alone had high availability, parallel processing and cloud KMS; current open-source feature coverage not verified. Splice (Global Synchronizer code) is an LFDT lab; a private synchronizer does not need it. |
| O9 | Own design, proposed by the project owner (source `ff705d7…`): encrypted envelopes on the shared Besu chain. Deal data and deal contracts are encrypted; keys are distributed to the deal's members offline; every validator stores the envelopes and their hashes; only key holders open them. Maintainer elaboration (proposed, not exercised): the chain orders and stores envelopes and does not execute deal logic; members replay the ordered envelopes off-chain and sign the resulting state hash; a regulator view key opens a header section only. | D1-D3 content from non-members; the record is held by all validators (`nw-constraint-immutability-beyond-deal-parties`) | Validators cannot enforce deal rules; confidential token movement and double-pledge prevention are unsolved by encryption alone; envelope count, timing, size and submitter are visible; ciphertext is permanent, so a leaked key exposes the deal's history; key rotation, loss and member change need a design; the project owns the protocol. The owner identified the Goldman Sachs reference as Canton (2026-11-23); the Canton documentation read in this investigation describes session keys sent with each message, encrypted to recipients' public keys, and offline key distribution is not verified there. |

D4 remains visible on the base chain under O1-O6.

## Open questions

- Whether the prototype demonstrates one mitigation or records the analysis only (`nw-prototype-scope`).
- Which readers hold a right to which data classes; this needs collateral subject-matter input.
- Whether `nw-assumption-besu-visibility` is updated to cover all 12 contracts or superseded.

## Proposed resolutions (2026-11-23)

- Regulator access: `nw-proposal-regulator-selective-disclosure`.
- Metadata visible to non-participants: `nw-proposal-visibility-metadata-scope`.
- Token design: `nw-proposal-deal-scoped-noto-hooks`.
- Evidence: `artifact-bank-use-of-besu`.
- O8 updated with Canton documentation, licence and governance facts (source `cd2e6ca…`).
