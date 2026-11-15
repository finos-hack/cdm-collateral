```yaml
id: wp-adr-repo-pair-off
kind: decision
subtype: adr
timestamp: 2026-11-10T23:26:13Z
review: accepted
provenance:
  conversationId: repo-pair-off
  sourceRef: ni:///sha-256;1rByYLqVhnkU_dZFCsGCIRnP5HhZtPtVtcSGpaQCY3g
  timestamp: 2026-11-10T23:26:13Z
  confidence: 0.6
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 2733275ab3cc72d223729efa4a32ccae2f360c80
    contentHash: 2733275ab3cc72d223729efa4a32ccae2f360c80
createdAt: 2026-11-10T23:26:13Z
updatedAt: 2026-11-11T00:12:48Z
```

# ADR: two offsetting repos pair off on their common Repurchase Date with one net cash payment, through a cdm-ext pair-off event

For [[task-repo-pair-off]] (section C, row 9 of the workflow map), within [[wp-adr-repo-gmra-scope]]. The project owner
chose on 2026-11-10 (source `2733275ab3cc72d223729efa4a32ccae2f360c80`): CDM's pair-off package with a `cdm-ext` net
settlement of the paired repurchase legs ("1a"); full pair-off only; and for defect D24 a `cdm-ext` replacement for the
instruction with its own qualifier. The rest of this record is the maintainer's proposal.

**Why CDM alone does not do it.** CDM's `Create_PairOffInstruction` only adds a package reference to each trade's
execution details and leaves the trades open; nothing settles. Its instructions also fail CDM's own `Instruction`
condition `NewTrade` (D24).

- **Which repos.** Two repos between the same two parties in opposite directions, both purchased, with the same
  security, quantity, cash token and Repurchase Date. Equal quantities only; partial pair-off and pairing of the
  purchase legs are not covered.
- **Event.** `cdm-ext` builds a `BusinessEvent` whose two instructions carry only the `before` trade states (which passes
  `NewTrade`) and whose after trade states are the same trades with CDM's package reference (`Create_PackageExecutionDetails`,
  list identifier the pair reference, components the two trade identifiers). A `cdm-ext` qualifier checks the matching
  rules and that nothing but the execution details changed. `Qualify_PairOff` is not used.
- **Net settlement.** On the common Repurchase Date the two repurchase legs net: the securities returns cancel, so no
  securities move, and the party whose Repurchase Price is higher (as Seller) pays the other the difference. Nothing
  moves when the two are equal. One `cdm-ext` settlement document names both repos and the net amount and payer; both
  services build it and instruct its hash.
- **Agreement.** Either party proposes the pair-off of two of its repos with the other party; the other party's service
  rebuilds the event and the settlement document and instructs the same hash, or refuses, and each repo repurchases
  normally.
- **Settlement.** `RepoSettlement` gains a pair-off phase over two repos. The second matching instruction marks both
  repos repurchased and moves the net cash in one transaction. A pending repurchase instruction on either repo blocks
  the pair-off, and a settled pair-off clears the repos' pending phases.
- **Date.** The services propose and instruct only when the business date is the Repurchase Date; the contract checks no
  dates, as for the repurchase.
- **Prototype.** An action in the Repos card and a live spec.

**Consequences.**
- `cdm-ext` gains the pair-off event, its qualifier and the net settlement; the task's "`cdm-ext`: none expected" no
  longer holds.
- A contract change and a new deployment; the previous one is kept as `besu.pre-repo-pair-off.json`.
- The rules are assumptions listed in [[task-sme-repo-pair-off-rules]].
