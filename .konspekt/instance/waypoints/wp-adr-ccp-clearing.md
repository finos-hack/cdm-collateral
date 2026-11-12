```yaml
id: wp-adr-ccp-clearing
kind: decision
subtype: adr
timestamp: 2026-11-12T22:50:00Z
review: accepted
provenance:
  conversationId: ccp-clearing
  sourceRef: 0072e61cda902e466726ca3c65c8c1ad61b3f089
  contentHash: 0072e61cda902e466726ca3c65c8c1ad61b3f089
  timestamp: 2026-11-12T22:50:00Z
  confidence: 0.55
createdAt: 2026-11-12T22:50:00Z
updatedAt: 2026-11-12T22:50:00Z
```
# ADR: a booked and affirmed bilateral repo is submitted by the seller, affirmed by the buyer and accepted by BANK-C, which novates it by CDM's clearing split into two repos with BANK-C; the purchase and the repurchase each settle in one transaction through CcpClearing

For [[task-ccp-clearing]] (section C, row 27 of the workflow map), within [[wp-adr-ccp-scope]] and after
[[wp-adr-ccp-membership]]. The project owner chose option (a) for all eight questions on 2026-11-12 (source
`0072e61cda902e466726ca3c65c8c1ad61b3f089`: "Go with (a) for all"). The rest of this record is the maintainer's proposal.

- **When (1a).** A repo booked and affirmed on `RepoSettlement`, before its purchase settles.
- **Submission (2a, 3a).** The seller submits the repo with the hash of the clearing document; the buyer affirms the same
  hash; BANK-C accepts when the rulebook is in effect, both parties are paid members, the security is eligible (tUST or
  tAGY) and the trade checks, or refuses with the hash of a reason, and the repo stays bilateral.
- **CDM record (4a).** A cdm-ext `CcpNovation`: the rulebook hash, the bilateral trade hash, BANK-C in the
  `ClearingOrganization` role, and CDM's clearing event: a split, intent `Clearing`, keyed by CDM's
  `GlobalKeyProcessStep`, with three branches: a party change of the buyer to BANK-C (BANK-A sells to BANK-C), a party
  change of the seller to BANK-C (BANK-C sells to BANK-B), each adding BANK-C's `ClearingOrganization` role, and a
  quantity change to zero that closes the bilateral trade.
- **On-chain (5a).** On acceptance `CcpClearing` closes the bilateral repo on `RepoSettlement` as `Novated` (a call
  only `CcpClearing` may make), keeps the cleared repo with its two legs, and raises each member's cleared-repo count,
  so neither may leave.
- **Settlement (6a).** Each member instructs the cdm-ext `RepoSettlement` document of its own leg (the seller the
  BANK-A–BANK-C leg, the buyer the BANK-C–BANK-B leg); the second instruction moves the securities from the seller to the
  buyer and the cash from the buyer to the seller in one transaction, so BANK-C, the counterparty to both legs, nets
  to zero. The repurchase is the same on the Repurchase Date and lowers both cleared-repo counts.
- **Verification (7a).** Each party rebuilds the `CcpNovation` from the bilateral trade and the rulebook and checks its
  hash before it affirms, accepts or instructs.
- **Live spec (8a).** `flow-ccp-clearing`: A and B book and affirm a repo; the seller submits, the buyer affirms and
  BANK-C accepts; the bilateral repo is `Novated`; the purchase settles through BANK-C; a member cannot leave while it
  clears; the repurchase settles through BANK-C; leaving is possible again.
