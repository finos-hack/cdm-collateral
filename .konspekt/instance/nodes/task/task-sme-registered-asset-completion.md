```yaml
id: task-sme-registered-asset-completion
type: task
title: Confirm with a business SME what completes settlement and enforcement of registered and claim-based tokens
status: open
review: proposed
provenance:
  conversationId: cdm-development
  sourceRef: 67989287b51231983b6e1159a2195a185f5d16b3
  contentHash: 67989287b51231983b6e1159a2195a185f5d16b3
  timestamp: 2026-11-04T02:21:16Z
  confidence: 0.8
createdAt: 2026-11-04T02:21:16Z
updatedAt: 2026-11-04T02:21:16Z
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
