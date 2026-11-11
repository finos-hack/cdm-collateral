```yaml
id: wp-adr-repo-default-close-out
kind: decision
subtype: adr
timestamp: 2026-11-11T13:07:05Z
review: accepted
provenance:
  conversationId: repo-default-close-out
  sourceRef: e1f2afbe9b0618c7020e6ec16844cce661c77ef2
  contentHash: e1f2afbe9b0618c7020e6ec16844cce661c77ef2
  timestamp: 2026-11-11T13:07:05Z
  confidence: 0.55
createdAt: 2026-11-11T13:07:05Z
updatedAt: 2026-11-11T13:09:45Z
```

# ADR: a GMRA default terminates every Transaction of the pair with CDM's termination event and settles one net balance in the Base Currency

**Correction, 2026-11-11 (maintainer, during the build):** choice 1a was put to the project owner as CDM's termination
event "with intent `Termination`". CDM 7.7.0's `EventIntentEnum` has no `Termination` value, and `Qualify_Termination`
requires the intent to be absent. The event carries no intent; it is CDM's termination event and qualifies as
`Termination`. Only the wording of the choice changes.

For [[task-repo-default-close-out]] (section C, row 11 of the workflow map), within [[wp-adr-repo-gmra-scope]]. The
project owner chose on 2026-11-11 (source `e1f2afbe9b0618c7020e6ec16844cce661c77ef2`): (1a) CDM's termination event
with intent `Termination` ends each Transaction; (2a) the Default Market Value of securities is the oracle's on-chain
price at the Default Valuation Time; (3a) the net balance covers every open repo and buy/sell-back of the pair, the
Cash Margin and Margin Securities held, and income due and unpaid; (4a) a Default Notice through `services/oracle`
triggers it, and with `automaticEarlyTermination` elected an Act of Insolvency terminates without notice; (5a) the
securities stay where they are and only the net balance moves on-chain; (6a) defect D25 is not reported. The rest of
this record is the maintainer's proposal.

**What CDM gives** (checked 2026-11-11 over a `CdmRepo` repo and buy/sell-back). No GMRA Event of Default, Default
Market Value or close-out netting. `Create_TerminationInstruction` gives a termination that `Qualify_Termination`
accepts once the closed state's `activityDate` is set; it carries no amount. CDM's repurchase event fails
`Qualify_Repurchase` (D25), so it is not used here.

- **Event of Default.** The oracle's default record (`OracleFeed.setDefault`) is the Event of Default, as in
  `flow-default-enforcement`. The non-defaulting party serves a Default Notice naming the Early Termination Date: a
  `cdm-ext` record whose hash `RepoSettlement` stores. When the pair's GMRA elections set `automaticEarlyTermination`,
  the Early Termination Date is the date the oracle records the default, and no notice is served. The oracle does not
  say whether the default is an Act of Insolvency; the prototype treats every recorded default as one when the election
  is set.
- **Termination.** On the Early Termination Date every open Transaction of the pair ends with CDM's termination event
  (`Create_TerminationInstruction`, no intent, `activityDate` the Early Termination Date), one event per
  Transaction. Pending instructions on those Transactions lapse.
- **Values.** For each Transaction, from the non-defaulting party's side: the Repurchase Price accrued to the Early
  Termination Date (`RepoRepurchasePrice` to a date, less interim interest paid; for a buy/sell-back, less the income
  deduction), owed by the Seller; and the Default Market Value of the Equivalent Securities, the oracle price at the
  Default Valuation Time (the elections' `valuationTime` and `businessCenter`) times the quantity, owed by the Buyer.
- **Margin and income.** Cash Margin held by a party under the pair's GMRA calls is owed back at its amount; Margin
  Securities held at their Default Market Value. Agreed income (manufactured income) that was due and not paid is owed
  by the party that should have paid it.
- **Net balance.** A `cdm-ext` GMRA close-out statement sums every amount owed each way into one balance in the Base
  Currency and names the party that pays it. It carries the termination events, the values and the balance; its hash is
  stored on-chain. Both parties compute the same statement from the chain's prices and the trades.
- **Settlement.** No securities move. The non-defaulting party records the close-out on `RepoSettlement`: the
  Transactions close, the statement hash and the balance are stored. The party that owes the balance then pays it in
  the Base Currency token; until paid it stays recorded as owed.
- **Prototype.** A default close-out action in the console for the non-defaulting party, the statement view for both,
  and a live spec that records a default, closes out a repo and a buy/sell-back of the pair that offset in quantity (so
  no securities drain from the persistent chain) and settles the balance. The spec restores the defaulting party's
  default status as it found it.
- **Margin settled.** Each held-margin entry names the GMRA calls it came from; after a close-out the margin views no
  longer count those calls.

**Consequences.**
- `cdm-ext` gains the Default Notice record, the per-Transaction default values and the GMRA close-out statement, next
  to the ISDA 2002 close-out in `cdmx.collateral.closeout`.
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-default-close-out.json`.
- The rules are assumptions listed in [[task-sme-repo-default-close-out-rules]].
