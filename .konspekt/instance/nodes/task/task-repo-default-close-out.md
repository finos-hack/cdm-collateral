```yaml
id: task-repo-default-close-out
type: task
title: Repo default and close-out under GMRA paragraph 10
status: open
review: accepted
provenance:
  conversationId: repo-gmra-scope
  sourceRef: 098fab36b2d91ff22a659917fbb8c77ca7aa4108
  contentHash: 098fab36b2d91ff22a659917fbb8c77ca7aa4108
  timestamp: 2026-11-07T23:11:58Z
  confidence: 0.8
createdAt: 2026-11-07T23:11:58Z
updatedAt: 2026-11-11T13:09:45Z
```

# Task: repo default and close-out under GMRA paragraph 10

Row 11 of the repo workflows (section C of the workflow map), added to [[task-repo-gmra-workflows]] by the project
owner on 2026-11-07 (source `098fab36b2d91ff22a659917fbb8c77ca7aa4108`: "3. 11th task"), after the ten workflows of [[wp-adr-repo-gmra-scope]].

- **CDM status:** absent (R20 default and R23 close-out, score 0).
- **Scope:** GMRA paragraph 10: an Event of Default; the Repurchase Date of every repo accelerated; the Default Market
  Value of the securities and cash each party owes under the default valuation terms; the amounts netted to one
  balance payable by one party.
- **`cdm-ext`:** the GMRA close-out calculation over the terms of [[task-repo-gmra-terms]], alongside the ISDA 2002
  Section 6(e) close-out in `cdmx.collateral.closeout`.
- **Prototype:** default notices through `services/oracle` as in `flow-default-enforcement`; the net balance settled
  on-chain; a live spec.

The details are decided when the task starts. Design chosen 2026-11-11 (source `e1f2afbe9b0618c7020e6ec16844cce661c77ef2`): CDM's termination event per
Transaction, oracle prices as Default Market Values, one net balance over every Transaction, margin and unpaid income,
a Default Notice or automatic early termination, and only the balance settled ([[wp-adr-repo-default-close-out]],
accepted 2026-11-11); the rules are assumptions in [[task-sme-repo-default-close-out-rules]].

**CDM check, 2026-11-11** (a temporary test over a repo and a buy/sell-back built by `CdmRepo`, purchase 2026-11-09,
Repurchase Date 2026-11-16, an Event of Default on 2026-11-12):

- CDM has no GMRA default: no Event of Default, default notice, Default Market Value or close-out netting. Its
  `EventsOfDefault` type is the ISLA (GMSLA) election and `AutomaticEarlyTermination` the ISDA one.
- Three CDM routes close the trade or bring its Repurchase Date forward, none with an amount:
  - CDM's repurchase event (`ResolveRepurchaseTransferInstruction`) on the default date: valid, intent `Repurchase`, the
    trade `Terminated`; `Qualify_Repurchase` is false, on the Repurchase Date too (defect D25).
  - `Create_TerminationInstruction` on the default date: `Qualify_Termination` holds; CDM validation fails until the
    closed state's `activityDate` is set (as `CdmRepo` already does for reprice and roll).
  - `Create_EffectiveOrTerminationDateTermChangeInstruction` moving the termination date to the default date: valid,
    qualifies as `Renegotiation`; the trade stays open.
- The Repurchase Price to the default date is `cdm-ext` `RepoPriceDifferential` to a date. The Default Market Values,
  the netting and the balance are new; `cdmx.collateral.closeout` holds the ISDA 2002 Section 6(e) types only.
