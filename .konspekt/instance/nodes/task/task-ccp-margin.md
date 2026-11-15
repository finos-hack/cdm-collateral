```yaml
id: task-ccp-margin
type: task
title: CCP daily variation margin and initial margin
status: resolved
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: ni:///sha-256;N4gtG4mbzjE1QoXqgyZKO4nB6ax62aB4uQadg_YPaCg
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
    contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-13T15:22:33Z
```
# Task: CCP daily variation margin and initial margin

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 28 of the workflow map. BANK-C calls each member daily for variation margin on its cleared repos and for initial margin at the rulebook's percentage of the exposure, as CDM MarginCallIssuance under the CCP rulebook, settled in tUSD.

**Design proposed 2026-11-13** in [[wp-adr-ccp-margin]], built without design questions at the project owner's
request (source `9313093366bdd34b988e9a2baa1c53ee3f5f44cc`). SME questions in [[task-sme-ccp-margin]].

**CDM check 2026-11-13, for the design.** CDM's `MarginCallIssuance` from BANK-C to a member validates with
`RegMarginTypeEnum` `VM` for the variation margin call and `NonRegIM` for the initial margin call, under
`callAgreementType` `Other` with `otherAgreement` "CCP rulebook". CDM's `RepoTransactionExposure` gives a cleared leg's
GMRA Transaction Exposure; both legs give the same value, since they have the same terms. CDM has no CCP margin model
(ISDA SIMM only) and no record of a member's margin over its cleared trades (G23).

**Built 2026-11-13** to [[wp-adr-ccp-margin]]:

- **cdm-ext** (`cdmx.collateral.ccp`): `CcpVariationMarginLine` and `CcpMarginStatement` with CDM's calls, functions
  `CcpRepoExposure`, `CcpMemberVariationMargin`, `CcpInitialMarginRequired`, `CcpLinesWithoutTheMember`, `CcpCallCount`
  and `CcpCallAmount`. `CcpRiskTest`, 3 tests.
- **Contracts**: `CcpClearing` takes the oracle feed at deployment and gains `issueMargin`, `payMargin`,
  `cancelMarginRound` (a member in the round in default), the views `marginRound`, `roundMembers`, `roundRepos` and
  `marginRoundsOf`, and per repo `vmBalance`; a member holding initial margin cannot leave (`MarginHeld`). 3 hardhat
  tests.
- **Gateway** routes `/ledger/v1/ccp/margin` (POST issue; GET by CCP), `/:id`, `/:id/pay` (approves the net first),
  `/:id/cancel`.
- **Service** `CdmCcp.marginStatement`, `parseMargin`, `statedPrice`, `dateKey`; `/api/v1/ccp/margin` routes: BANK-C's
  preview and issue, each member's check of its statement and payment. `CdmCcpRiskTest`, 2 tests.
- **Console** the margin section of the CCP card: BANK-C's preview, issue and cancel; each member's statement and pay.
- **Live spec** `flow-ccp-margin`, after `flow-ccp-clearing`.

**Fix 2026-11-13, found in the live runs.** `flow-two-way-im-default` and `flow-repo-purchase-repurchase` failed once
the chain had several runs of history: every console button stayed disabled past the 30 s step timeout. The console
waits for its refresh after each action, and the service's `/api/v1/repo-margin` took about 8.5 s, because each
pending-instruction count refetched the gateway's `/repos` (every repo the party was ever in) about 13 times per
request. `App.purchasedRepos()` now fetches the purchased repos once per request and passes them to the counts; the
request takes about 0.5 s on a fresh chain and about 1.1 s after a full run. Full live run on a reset chain: 53 passed.
