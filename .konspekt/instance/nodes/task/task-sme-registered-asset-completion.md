```yaml
id: task-sme-registered-asset-completion
type: task
title: Confirm with a business SME what completes settlement and enforcement of registered and claim-based tokens
status: open
review: accepted
provenance:
  conversationId: cdm-development
  sourceRef: ni:///sha-256;-RZvrfQ3NLZ_uyRcmtqFD8H9XlfaTBAi3_792ucIxRc
  timestamp: 2026-11-04T02:21:16Z
  confidence: 0.8
  deprecated:
    migratedAt: 2026-11-15T16:01:12Z
    sourceRef: 67989287b51231983b6e1159a2195a185f5d16b3
    contentHash: 67989287b51231983b6e1159a2195a185f5d16b3
createdAt: 2026-11-04T02:21:16Z
updatedAt: 2026-11-21T20:16:21Z
```
# Task: confirm completion for registered and claim-based tokenized collateral

Under [[goal-cdm-development]], in the SME bucket with [[task-sme-enforcement-event-definition]]. G24
([[task-cdm-gap-closure]]) records for each token which record is legally authoritative (`AuthoritativeRecordEnum`:
Bearer, Registered, Claim). Settlement (G4) and enforcement (G14) currently treat a mined on-chain transfer as
complete for every asset. For a Registered or Claim asset (tMMF in the prototype) that transfer may not move legal
title, which affects whether the secured party's interest is perfected and enforceable. Questions for the SME:

1. For a Registered asset, when is a pledge or title transfer complete: at the on-chain transfer, or when the
   transfer agent updates the register? Is the on-chain transfer an instruction to the register or evidence of it?
2. For a Claim asset (held on an intermediary's books), what must the intermediary confirm, and does the token holder
   have a proprietary claim or only a contractual one?
3. What gives the secured party control for each record type (for example under UCC Articles 8, 9 and 12, or the
   English law equivalent), and is the escrow contract enough?
4. On enforcement, who must act for each record type, and can the secured party enforce without the record keeper?
5. If the chain and the register disagree, which one prevails, and how is the difference resolved?

The answers set the completion rules in item 6 of [[nw-ledger-anchor-redesign]].

**Worked case (project owner, 2026-11-21, under [[goal-tokenized-collateral]]).** An asset manager pledges an aircraft
to a bank for a $100M loan, and tokens are issued on the SPV that holds it. The aircraft is identified by
manufacturer, model and manufacturer's serial number (MSN) on the International Registry (Cape Town Convention and
Aircraft Protocol); the loan agreement and an aircraft mortgage, registered as an international interest, link it to
the $100M; the token's offering memorandum and terms, an appraisal and the smart contract (with its DTI) link it to
the tokens. CDM 7.7.0 can hold the loan but not the aircraft or its mortgage (gap G40, finding N1). Further questions:

6. Is the aircraft a Registered asset in the prototype's terms, with the International Registry and the national
   registry as authoritative records, and does the on-chain record count for anything legally?
7. What does one token represent (SPV share, note, beneficial interest), which document fixes it, and who keeps the
   record of holders?
8. If the aircraft is already mortgaged to the lender, what consent does issuing the tokens need, and how does the
   token holders' claim rank against the registered mortgage?
9. Which document sets the token count, issue price and value at tokenization, and what in the token terms decides
   whether the token price follows the aircraft's value afterwards (NAV, redemption rights, oracle feed)?
10. Can a token backed by a physical asset be eligible collateral under a CSA, GMRA or GMSLA, or only under an
    asset-finance agreement? If the prototype should model it, which CDM additions does G40 need first?

Questions 6 to 10 are REG-6 to REG-10 in `docs/analysis/sme-question-ledger.md`.

## Research for the SME (2026-11-21, proposed, not legal advice)

Public sources only; the SME confirms or corrects each point. Points marked *(not fetched)* are from general knowledge
of the UCC and were not checked against a source in this session.

- **REG-1, Registered.** US: delivery of an uncertificated security happens when the issuer registers the purchaser
  (UCC 8-301(b)) *(not fetched)*, so the on-chain transfer is an instruction unless the transfer agent has made the
  chain part of its official record. Franklin OnChain U.S. Government Money Fund (BENJI) is that case: the transfer
  agent keeps the official record on a permissioned system built on public chains and can correct erroneous entries
  (SEC Form 497, FY2024).
- **REG-2, Claim.** US: a security entitlement arises when the intermediary credits the account (UCC 8-501), and the
  holder has a pro rata property interest in the intermediary's holding (UCC 8-503) *(not fetched)*. Commentary differs
  on whether that is proprietary or contractual. The intermediary would confirm the credit to the account.
- **REG-3, control.** US: control of an uncertificated security or a security entitlement needs the issuer's or the
  intermediary's agreement to follow the secured party's instructions without the owner's further consent (UCC
  8-106(c), (d)); neither can be compelled to agree. UCC Article 12 (controllable electronic records) does not reach
  tokenized securities: rights in the underlying asset stay with other law. England and Wales: the Property (Digital
  Assets etc) Act 2025 confirms digital assets can be personal property but sets no security regime; the Law
  Commission's proposed FCARs amendments for digital assets were not found enacted. So the escrow contract gives
  control of the token, not necessarily of the asset.
- **REG-4, enforcement.** Follows from REG-3: for Registered and Claim assets, the secured party enforces by
  instructing the record keeper under a control agreement; the record keeper must act.
- **REG-5, conflict.** For Registered assets the transfer agent's record prevails and the agent can correct entries
  (Form 497); for Claim assets the intermediary's books govern. DTC's tokenized entitlements (SEC no-action letter,
  2025-12-11) keep registered ownership unchanged and reconcile against DTC's central ledger.

Sources: UCC 8-106 (Cornell LII), Franklin Templeton Form 497 (sec.gov), DTC no-action letter (sec.gov), Mintz and
Norton Rose Fulbright on UCC Article 12, Mishcon de Reya and Birketts on the 2025 Act.

## Interim decisions (project owner, 2026-11-21)

Until the SME answers; the questions stay open.

- **REG-1, REG-2:** a Registered or Claim transfer is complete only when the record keeper confirms the register
  update or the account credit. The confirmation names the record keeper, the asset and the CDM record (the current
  provisional `TransferComplete` rule).
- **REG-3:** a Registered or Claim token is eligible collateral only if a control agreement with its record keeper is
  recorded for it. The escrow contract alone controls the token, not the asset.
- **REG-4:** enforcement of a Registered or Claim asset follows the same rule as settlement: the secured party
  instructs the record keeper, and enforcement is complete only after the record keeper's confirmation.
- **REG-5:** the record keeper's record prevails. A mismatch between the chain and that record is reported as a break,
  and the step is not complete until it is reconciled.

These rules unblock [[task-authoritative-record-settlement-enforcement]].
