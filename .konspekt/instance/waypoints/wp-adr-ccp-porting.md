```yaml
id: wp-adr-ccp-porting
kind: decision
subtype: adr
timestamp: 2026-11-13T00:30:00Z
review: accepted
provenance:
  conversationId: ccp-risk
  sourceRef: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
  contentHash: 9313093366bdd34b988e9a2baa1c53ee3f5f44cc
  timestamp: 2026-11-13T00:30:00Z
  confidence: 0.45
createdAt: 2026-11-13T00:30:00Z
updatedAt: 2026-11-13T02:31:42Z
```
# ADR: BANK-C admits BANK-T as a third member with a cdm-ext CcpAdmission; a member ports its leg of a purchased cleared repo to another member with a cdm-ext CcpPorting (CDM's party change, intent Novation) that the receiving member accepts and BANK-C approves, moving the leg's value between the two members

For [[task-ccp-porting]] (section C, row 30 of the workflow map), within [[wp-adr-ccp-scope]] and after
[[wp-adr-ccp-clearing]] and [[wp-adr-ccp-margin]]. Built in the same pass as rows 28 and 29 (source
`9313093366bdd34b988e9a2baa1c53ee3f5f44cc`). Every choice below is the maintainer's proposal.

- **A third member.** Porting needs a member that is not a party to the repo. The rulebook of row 26 names A and B and
  stays unchanged; BANK-C admits BANK-T to the rulebook in effect with a cdm-ext `CcpAdmission` (the member's
  `CcpMember` with its agreement with BANK-C and a 500,000 USD share). BANK-T checks the admission and joins by paying
  its share, as A and B do. `CcpClearing.admitMember` adds it.
- **When.** A party to a purchased cleared repo that has not instructed its repurchase may port its leg once, to any
  other paid member. A refused porting may be requested again; while one is open, neither member instructs.
- **CDM record.** A cdm-ext `CcpPorting`: the rulebook hash, the repo, BANK-C in the `ClearingOrganization` role, the
  two members and which leg moves, and CDM's party change of that leg's counterparty to the receiving member, intent
  `Novation`, keyed by `GlobalKeyProcessStep`. `Qualify_Novation` is false for it, as for any party change of one leg
  that leaves the other with BANK-C (G23); the condition `ReceivingMemberOnTheLeg` checks the result instead.
- **Payment.** The leg's value to the leaving member at the feed price on the porting date, with CDM's GMRA default
  functions: for the seller the Market Value less the accrued Repurchase Price plus the variation margin it paid; for
  the buyer the accrued Repurchase Price less the variation margin it received. The receiving member pays it (a
  negative payment goes the other way), and a leaving buyer's securities move to the receiving member. The variation
  margin paid stays with the repo.
- **On-chain.** `requestPorting` (the leaving member, with the hash and the payment), `acceptPorting` (the receiving
  member, the same hash), `approvePorting` (BANK-C: moves the payment and a buyer's securities, and makes the receiving
  member the leg's party) or `refusePorting` (BANK-C or the receiving member). The receiving member is added to the
  repo's parties, so it sees the repo in its console.
- **Verification.** The receiving member and BANK-C rebuild the porting from the novation's leg, the stated date and
  price, and the chain's variation margin; while it is open the price must be the feed's. After the porting each party
  instructs from the porting's new leg.
- **Live spec.** `flow-ccp-porting`: BANK-C admits BANK-T in its console and T joins in its console; A ports its leg
  to T; T checks and accepts, BANK-C approves; T pays A the payment; on the Repurchase Date T and B repurchase through
  BANK-C; a round returns the margin; T leaves.
