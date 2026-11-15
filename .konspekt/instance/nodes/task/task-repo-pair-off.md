```yaml
id: task-repo-pair-off
type: task
title: Repo pair-off
status: resolved
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: ni:///sha-256;STJirKt2MoMm9lBaaCwnSam9QDrdl3_syYsofLZjtpE
  timestamp: 2026-11-07T22:35:17Z
  confidence: 0.65
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 43bd267adffbb70e3a740c20620deed96d966092
    contentHash: 43bd267adffbb70e3a740c20620deed96d966092
createdAt: 2026-11-07T22:35:17Z
updatedAt: 2026-11-11T01:11:49Z
```
# Task: repo pair-off

Row 9 of the repo workflows (section C of the workflow map), split from [[task-repo-gmra-workflows]] within
[[wp-adr-repo-gmra-scope]] (the project owner's choices of 2026-11-07).

- **CDM status:** usable as is (R13, score 5); a trade event, not netting of collateral movements (R22). Corrected 2026-11-10: CDM's
  pair-off only tags the trades with a package and settles nothing, and its instructions fail CDM's own validation (D24).
- **Scope:** Offsetting repos between the pair closed against each other, through CDM's `Create_PairOffInstruction`, with one net settlement.
- **`cdm-ext`:** none expected. Corrected 2026-11-10: the pair-off event without CDM's faulty instructions, its qualifier and
  the net settlement ([[wp-adr-repo-pair-off]]).
- **Prototype:** the pair-off event and its net settlement on-chain; a live spec.

The details are decided when the task starts. Design chosen 2026-11-10 (source `2733275ab3cc72d223729efa4a32ccae2f360c80`):
the paired repurchase legs settle net, full pair-off only ([[wp-adr-repo-pair-off]], accepted 2026-11-11); the rules are
assumptions in [[task-sme-repo-pair-off-rules]].

**Check for gap G30 (defect D7) when the task starts:** CDM's repo qualification accepts one `InterestRatePayout` only. Run a
temporary test over the pair-off: count the payouts and evaluate CDM's qualification function on each resulting trade.
Record the result in the G30 row of `docs/analysis/cdm-workflow-task-map.md` (checked on 2026-11-10 for the repo events of `CdmRepo` built through row C8).
Done 2026-11-10 for CDM's pair-off of two offsetting repos: each trade keeps one `InterestRatePayout` and qualifies as a
repo. Repeated 2026-11-10 for the `cdm-ext` pair-off event `RepoPairOffEvent`: the same result, kept as the test
`PairOffTest.eachPairedTradeStillQualifiesAsARepoWithOnePayoutGapG30`.

**Built 2026-11-10:** `cdm-ext` (`RepoPairOffEvent`, `RepoIsPairOff`, `RepoPairOffSettlement`, `RepoPairOffNetAmount`), the
`PairOff` phase of `RepoSettlement`, the gateway and service routes, the console's pair-off actions and the live spec
`flow-repo-pair-off`, which passes on a local stack.
