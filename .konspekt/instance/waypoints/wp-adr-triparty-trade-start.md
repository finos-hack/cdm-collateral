```yaml
id: wp-adr-triparty-trade-start
kind: decision
subtype: adr
timestamp: 2026-11-12T01:20:36Z
review: proposed
provenance:
  conversationId: triparty-trade-start
  sourceRef: dfc25e3ca5487c53cf915b0e61638c428cd4e377
  contentHash: dfc25e3ca5487c53cf915b0e61638c428cd4e377
  timestamp: 2026-11-12T01:20:36Z
  confidence: 0.55
createdAt: 2026-11-12T01:20:36Z
updatedAt: 2026-11-12T01:20:36Z
```
# ADR: a triparty repo starts with the giver's deposit at the agent and the pair's request; the agent allocates by the giver's ranking within the profile's haircuts and per-ISIN limits and builds the CDM repo; the purchase settles the cash against the allocation on TripartySettlement

For [[task-triparty-trade-start]] (section C, row 21 of the workflow map), within [[wp-adr-triparty-scope]] and on the
terms of [[wp-adr-triparty-terms-profile]]. The project owner chose on 2026-11-12 (source `dfc25e3ca5487c53cf915b0e61638c428cd4e377`:
"1a 2a 3a 4a 5a 6a 7a 8a 9a"), after the CDM check recorded in that task: an allocated triparty repo is a valid CDM
repo, and no CDM repo can exist before the allocation. The rest of this record is the maintainer's proposal.

- **Deposit (1a, 3a, 5a).** Under triparty terms in effect, the giver deposits tokens with `TripartySettlement`, which
  holds them in the giver's free account for those terms, and states each token's rank. The giver can withdraw free
  collateral at any time. The terms cannot be terminated while a deposit or a repo remains.
- **Request (1a).** The giver proposes a cdm-ext `TripartyRepoRequest`: the terms it is under, the trade id, the
  Purchase Price in tUSD, the rate and the Purchase and Repurchase Dates. Its hash is recorded on-chain; the receiver's
  service checks the document and the receiver affirms it.
- **Allocation (2a, 3a, 4a).** The agent's service allocates from the giver's free account: in the giver's ranking,
  each asset valued at the oracle feed price less the profile's haircut, until the value after haircuts covers the
  Purchase Price (the haircuts take the place of the GMRA margin ratio); the last asset is rounded up to whole units,
  as in the CSA allocation (`AllocateCollateral`). An asset under a concentration limit is capped at the whole units
  whose value after haircuts stays within its limit of the Purchase Price. When the free account cannot cover the
  Purchase Price within the limits, nothing is allocated. A new `cdm-ext` per-ISIN concentration check (the local fix
  for D30) confirms the allocation is within the profile's limits.
- **CDM repo (7a).** The agent builds the repo as CDM's execution event: the giver as seller, the receiver as buyer,
  BANK-T in the `TripartyAgent` role, the profile as the eligible collateral, and one collateral position per
  allocated asset with its own quantity. The cdm-ext `TripartyAllocation` holds the request hash, the positions with
  their prices, haircuts and values, the required and allocated values and the execution event; its hash is recorded
  on-chain with the tokens and amounts. The giver's and the receiver's services rebuild the allocation from the
  request, the profile, the free account, the stated prices (checked against the feed) and the giver's ranking.
  `CdmRepo` gains a reader for the allocated form; the bilateral repos keep theirs.
- **Purchase (6a).** The receiver affirms the allocation hash on `TripartySettlement`, which in one transaction moves
  the Purchase Price in tUSD from the receiver to the giver and the allocated tokens from the giver's free account to
  the repo's account, which the receiver holds by title under the GMRA. The repo is not booked on `RepoSettlement`.
  The receiver can refuse an allocation instead, and the agent allocates again.
- **Console (8a).** The giver deposits, withdraws and requests in the "Triparty terms" card; the receiver affirms the
  request and the allocation; the agent allocates in `#/live/T` and shows the allocation with its values and limits.
- **Live spec (8a, 9a).** `flow-triparty-trade-start`, with BANK-B as the giver and BANK-A as the receiver, so that
  its terms are not the A-to-B terms `flow-triparty-terms` terminates: B deposits 2,000 tUST and 4,000 tAGY for a
  500,000 tUSD repo, which the agent cannot cover within the 50% tAGY limit; B deposits 1,000 more tUST and the agent
  allocates 3,000 tUST and the tAGY that covers the rest; A settles the purchase; B withdraws its free deposit. Each
  run leaves one open triparty repo and its collateral at the agent until trade end (row 24) closes it.

**Consequences.**
- `TripartySettlement` gains deposits, withdrawals, requests, allocations and the purchase; a new deployment.
- The allocation rules are assumptions; the questions are in [[task-sme-triparty-trade-start]].
