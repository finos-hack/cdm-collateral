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
updatedAt: 2026-11-21T19:45:00Z
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
