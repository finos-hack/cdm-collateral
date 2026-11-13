```yaml
id: task-ccp-workflows
type: task
title: Implement the CCP collateral workflows
status: open
review: accepted
provenance:
  conversationId: e2e-remaining-flows
  sourceRef: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  contentHash: 3d50de191d1f9ab4e959c8bfb0bd04d2e397ca05
  timestamp: 2026-11-03T14:29:20Z
  confidence: 0.75
createdAt: 2026-11-03T14:29:20Z
updatedAt: 2026-11-12T15:10:00Z
```
# Task: implement the CCP collateral workflows

Section C of the workflow map (`docs/analysis/cdm-workflow-task-map.md`), from [[investigation-cdm-workflow-task-map]]. Starts after the ISDA CSA cycle
([[task-csa-workflow-extensions]]), per the build order the project owner set on 2026-11-03; the order among the four
agreement families is set in [[nw-agreement-family-order]] (business case §8 item 2).

Workflows in the analysis for CCP: margin call, default management, porting. Main CDM gaps: G23. Scope per workflow, prototype flows and live specs are
to be defined when this task starts.

**Binding switch** from [[task-triparty-reporting]] to this task on the project owner's "While PR runs - move to CCP
flows" (2026-11-12, source `8816e213ab23a58fce8e77558228fcd381a4d8f5`), on branch `triparty`, after PR #65 (rows 18
to 25) was raised.

**CDM check, 2026-11-12.** A temporary test ran CDM 7.7.0 over the prototype's bilateral repo (BANK-A sells 1,000 tUST to
BANK-B for 98,400 tUSD at 5% for 7 days) with BANK-C as the CCP:

- **Clearing.** CDM's split into two branches, each a party change to BANK-C in `ClearingOrganization` role, with the
  `Clearing` intent, validates once the instruction is run through CDM's `GlobalKeyProcessStep`; without keys the new
  counterparty's `partyReference` is empty, since `Create_PartyChange` sets it `as-key`. It gives two open repos, BANK-A
  against BANK-C and BANK-C against BANK-B, each still a repurchase agreement; the `Seller` and `Buyer` party roles are
  carried over unchanged. `Qualify_ClearedTrade` is false: it wants the original trade closed beside the two new ones,
  and the split closes nothing.
- **Porting.** A party change on the cleared repo moving BANK-B's side to BANK-D, with the `Novation` intent, validates;
  `Qualify_Novation` is false.
- **CCP margin.** A `MarginCallIssuance` for variation margin from BANK-C (`ClearingOrganization`) to a member, under an
  agreement of type `Other` ("CCP rulebook"), validates. `LegalAgreementTypeEnum` has no clearing or CCP agreement; CDM
  has ISDA SIMM for initial margin (`simmIMExposure`) and no CCP margin model.
- **Default management.** CDM has no function or event for a member default, an auction, a default waterfall or a
  default fund (G23).

**Scope chosen 2026-11-12** (source `323cd915721b60bb6900bbb2d1774d669f8870ac`: "Good with your proposals - all (a)"), recorded in [[wp-adr-ccp-scope]]: one
task per workflow, rows 26 to 30 of the workflow map, built in order from [[task-ccp-membership]].
