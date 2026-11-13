```yaml
id: task-ccp-membership
type: task
title: CCP membership and rules: BANK-C, its rulebook, the members' default fund contributions
status: open
review: accepted
provenance:
  conversationId: ccp-scope
  sourceRef: 323cd915721b60bb6900bbb2d1774d669f8870ac
  contentHash: 323cd915721b60bb6900bbb2d1774d669f8870ac
  timestamp: 2026-11-12T18:25:00Z
  confidence: 0.6
createdAt: 2026-11-12T18:25:00Z
updatedAt: 2026-11-12T19:40:00Z
```
# Task: CCP membership and rules: BANK-C, its rulebook, the members' default fund contributions

Under [[task-ccp-workflows]], per [[wp-adr-ccp-scope]]. Row 26 of the workflow map. BANK-C as a fourth test party with its service and gateway; the CCP contract; the rulebook (the IM percentage, the eligible members, the default fund sizes) agreed by BANK-A and BANK-B as members; each member's default fund contribution in tUSD.

**Design chosen 2026-11-12** (source `041be7509af8f3a7990e6b1056c58cb4967eb42a`: "(A) for each"), recorded in [[wp-adr-ccp-membership]].

**CDM check 2026-11-12, during the build.** CDM's `LegalAgreementBase` of type `Other` validates for an agreement
between the CCP and one member. Its `contractualParty` is `(2..2)`: an agreement naming BANK-C, BANK-A and BANK-B fails
cardinality validation, so the rulebook in [[wp-adr-ccp-membership]] ("CDM's `LegalAgreement` of type `Other` between
BANK-C and the members") is built as one `LegalAgreementBase` per member under one cdm-ext `CcpRulebook`. CDM's
`LegalAgreement` is not used: it requires `agreementTerms`, and no CDM agreement terms describe a CCP rulebook.

**Built 2026-11-12** to [[wp-adr-ccp-membership]]:

- **cdm-ext** (`cdmx.collateral.ccp`): `CcpRulebook` (conditions `CcpRole`, `PartiesNamed`, `MembersAreNotTheCcp`,
  `DistinctMembers`, `CcpIsAContractualParty`, `SharesMakeTheFund`, `PositiveRateAndAmounts`, `OneCurrency`) and
  `CcpMember` (conditions `PositiveShare`, `RulebookAgreement`, `MemberIsAContractualParty`); function
  `CcpMembersWithoutTheCcp`. `CcpRulebookTest`, 5 tests.
- **Network**: a fifth Besu node `ccp` (non-validator, RPC 8553), whose node key is BANK-C's account; `besu/`
  scripts, `deploy.ts` (1,000,000 tUSD minted to BANK-C), `orchestrate.mjs` and `scripts/live-e2e.sh` start and check it.
- **Contract** `CcpClearing`: `publishRulebook` (the hash, the members and shares, and the capital paid in one
  transaction; one rulebook per CCP), `join` (the member pays its share; the rulebook is `Effective` once every named
  member has paid and stays so), `leave` (a paid member with no cleared repo gets its share back), `rulebook`,
  `members`, `rulebookOf`, `clearedCount` (zero until [[task-ccp-clearing]]). 3 hardhat tests.
- **Gateway** routes `/ledger/v1/ccp/rulebook` (POST publish; GET by CCP, `?block=`), `/ccp/rulebook/:hash` (GET),
  `/:hash/join`, `/:hash/leave`.
- **Service** `PARTY_ID=C` (BANK-C, role Central Counterparty, gateway 8204, port 8004; CCP routes and the event
  stream only); `CdmCcp.build`, `verify`, `view`; `/api/v1/ccp`, `/ccp/rulebook`, `/ccp/join`, `/ccp/leave`; each member
  checks the document, the token, the capital and the members and shares on chain before it joins. `CdmCcpTest`, 2 tests.
- **Console** `#/live/C` (BANK-C's console: publish), and the CCP card in `#/live/A` and `#/live/B` (join, leave).
  `CcpConsole.test.tsx`, 3 tests.
- **Live spec** `flow-ccp-membership`, passing on a fresh chain and on a second run that reuses the rulebook.
