# SME brief: registered and claim-based tokenized collateral

For a business or legal subject-matter expert (SME). It covers questions REG-1 to REG-5 of the
[SME question ledger](sme-question-ledger.md) (task `task-sme-registered-asset-completion`). Each question gives
the prototype's context, what public sources say, and the rule the prototype uses until you answer. Please confirm
or correct each point. The research below is not legal advice: it is what the project found in public sources and
is what we would like you to check.

## The prototype in brief

Two banks exchange collateral under a CSA, a GMRA or a GMSLA. The collateral is tokens on a private Hyperledger Besu
network, and a smart contract (the escrow contract) holds pledged tokens. Each token records which record decides
who holds the asset (`AuthoritativeRecordEnum` in the CDM extension):

| Value | Meaning | Prototype example |
|---|---|---|
| Bearer | The token is the asset; the ledger is the record of ownership. | tUST (tokenized US Treasury), tUSD (deposit token) |
| Registered | The token mirrors a register kept off the ledger, for example by a transfer agent; the register decides. | tMMF (tokenized government money market fund) |
| Claim | The token is a claim on an intermediary that holds the asset; the intermediary's books decide. | none yet |

For a Bearer token, a final on-chain transfer completes settlement or enforcement. The questions are about the other
two values.

## REG-1: when is a transfer of a Registered asset complete?

**Question.** Is a pledge or title transfer complete at the on-chain transfer, or when the transfer agent updates the
register? Is the on-chain transfer an instruction to the register or evidence of it?

**What public sources say.** Under US law, delivery of an uncertificated security happens when the issuer registers
the purchaser (UCC 8-301(b); not checked against a source in this work). A transfer agent can adopt the chain as part
of its official record: Franklin Templeton's OnChain U.S. Government Money Fund (BENJI) keeps its share register on a
permissioned system built on public chains, and its transfer agent can correct erroneous entries (SEC Form 497,
FY2024).

**Prototype rule until you answer.** The transfer is complete only when the record keeper confirms the register
update. The confirmation names the record keeper, the asset and the CDM record (a margin call step or an event).

## REG-2: what must the intermediary confirm for a Claim asset?

**Question.** For a Claim asset, what must the intermediary confirm, and does the token holder have a proprietary
claim or only a contractual one?

**What public sources say.** Under US law, a security entitlement arises when the intermediary credits the account
(UCC 8-501), and the holder has a pro rata property interest in the intermediary's holding (UCC 8-503); neither was
checked against a source in this work. Commentary differs on whether that interest is proprietary or contractual.

**Prototype rule until you answer.** The transfer is complete only when the intermediary confirms the credit to the
receiving account, with the same contents as REG-1.

## REG-3: what gives the secured party control?

**Question.** What gives the secured party control for each record type (for example UCC Articles 8, 9 and 12, or
the English law equivalent), and is the escrow contract enough?

**What public sources say.**

- US: control of an uncertificated security or a security entitlement needs the issuer's or the intermediary's
  agreement to follow the secured party's instructions without the owner's further consent (UCC 8-106(c), (d)).
  Neither can be compelled to agree.
- UCC Article 12 (controllable electronic records, 2022 amendments) does not reach tokenized securities: rights in
  the underlying asset stay with other law.
- England and Wales: the Property (Digital Assets etc) Act 2025 confirms that digital assets can be personal
  property but sets no security regime. The Law Commission's proposed amendments to the Financial Collateral
  Arrangements Regulations for digital assets were not found enacted.
- So the escrow contract gives control of the token, not necessarily of the asset.

**Prototype rule until you answer.** A Registered or Claim token is eligible collateral only if a control agreement
with its record keeper is recorded for it.

## REG-4: who must act on enforcement?

**Question.** On enforcement, who must act for each record type, and can the secured party enforce without the
record keeper?

**What public sources say.** This follows from REG-3: for Registered and Claim assets, the secured party enforces by
instructing the record keeper under the control agreement, and the record keeper must act.

**Prototype rule until you answer.** Enforcement follows the settlement rule: it is complete only after the record
keeper's confirmation.

## REG-5: what if the chain and the register disagree?

**Question.** If the chain and the register disagree, which prevails, and how is the difference resolved?

**What public sources say.** For a Registered asset, the transfer agent's record prevails and the agent can correct
entries (Form 497). For a Claim asset, the intermediary's books govern. DTC's tokenized entitlements (SEC no-action
letter, 2025-12-11) leave registered ownership unchanged and reconcile against DTC's central ledger.

**Prototype rule until you answer.** The record keeper's record prevails. A mismatch between the chain and that
record is reported as a break, and the step is not complete until it is reconciled.

## Sources

- [UCC 8-106 (Cornell LII)](https://www.law.cornell.edu/ucc/8/8-106)
- [Franklin Templeton Trust, Form 497, FY2024 (sec.gov)](https://www.sec.gov/Archives/edgar/data/1786958/000174177324003833/c497.htm)
- [DTC no-action letter (sec.gov)](https://www.sec.gov/files/tm/no-action/dtc-nal-121125.pdf)
- [Mintz on UCC Article 12](https://www.mintz.com/insights-center/viewpoints/2831/2023-04-25-securing-digital-bag-newly-promulgated-ucc-article-12)
- [Norton Rose Fulbright on the 2022 UCC amendments](https://www.nortonrosefulbright.com/en/knowledge/publications/8d95e2ed/bringing-the-ucc-into-the-digital-age-review-of-the-2022-ucc-amendments)
- [Mishcon de Reya on the Property (Digital Assets etc) Act 2025](https://www.mishcon.com/news/the-property-digital-assets-etc-act-2025-digital-asset-ownership)
- [Birketts on the 2025 Act and secured lending](https://www.birketts.co.uk/legal-update/from-crypto-to-collateral-what-could-the-property-digital-assets-etc-act-2025-mean-for-secured-lending/)
