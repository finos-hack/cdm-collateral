// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

// Shared vocabulary for the margin call and collateral control contracts. The enums mirror the off-chain
// console/CDM lifecycle (cdm-ext cdmx.collateral.margincall) so on-chain state and CDM state line up.

enum CallKind {
    IM, // initial margin: collateral is pledged into the control contract (segregation, wp-adr-im-segregation)
    VM, // variation margin: title passes by transfer
    Return // release of collateral already delivered
}

enum CallState {
    None,
    Issued,
    Agreed,
    PartiallyAgreed,
    Disputed,
    Settled,
    SettledAgreedPart
}

enum ProposalState {
    None,
    Proposed,
    Accepted,
    Rejected
}

enum ResponseType {
    Full,
    Partial,
    Dispute
}

struct Asset {
    address token;
    uint256 qty;
}

struct Call {
    CallKind kind;
    address from; // caller; for IM/VM the collateral receiver, for a Return call the party asking for release
    address to; // party called to deliver (IM/VM) or to agree and release (Return)
    uint256 amount; // scaled by OracleFeed.PRICE_SCALE
    uint256 agreed;
    uint256 disputed;
    uint64 deadline;
    CallState state;
    bytes32 cdmHash; // hash of the CDM MarginCallIssuance content (concept-asr-onchain-call-state)
    uint256 proposalCount;
    uint256 activeProposal; // (proposalId + 1) of the Proposed/Accepted proposal; 0 when none is live
    bytes32 settleCdmHash; // hash of the CDM SettleCallInstruction, 0 until settled (wp-adr-cdm-payload-carrier)
}

struct Proposal {
    ProposalState state;
    bytes32 cdmHash;
    bytes32 decisionCdmHash; // hash of the CDM DecideProposalInstruction, 0 until decided (wp-adr-cdm-payload-carrier)
}

// Substitution of pledged initial margin (ISDA CSA Paragraph 4(d); cdm-ext cdmx.collateral.substitution, G16). The
// prototype's agreement elects consent for the pledgor (Paragraph 13 (f)(ii)), so every substitution needs the secured
// party's consent before it settles.
enum SubstitutionState {
    None,
    Requested,
    Consented,
    Refused,
    Settled
}

enum AmendmentState {
    None,
    Proposed,
    Agreed,
    Refused
}

/// An amendment of the agreement terms between a pledgor and a secured party (task-csa-amendment). Either party
/// proposes, the other consents or refuses; on consent the haircut terms apply to that pair.
struct Amendment {
    address pledgor;
    address securedParty;
    address proposer;
    AmendmentState state;
    bytes32 beforeHash; // the pair's agreement hash the amendment applies to (0 for the baseline)
    bytes32 proposeCdmHash; // hash of the CDM CollateralAgreementAmendment
    bytes32 decisionCdmHash; // hash of the decision document, 0 until decided
}

/// One token's eligibility and haircut after an amendment.
struct HaircutTerm {
    address token;
    bool eligible;
    uint16 haircutBps;
}

enum InterestState {
    None,
    Stated, // negative amount, awaiting the pledgor's payment
    Settled
}

/// Interest on cash collateral for one Interest Period (G17). amount > 0 is paid by the secured party to the pledgor,
/// amount < 0 by the pledgor to the secured party; in units of the cash token.
struct InterestStatement {
    address pledgor;
    address securedParty;
    address cashToken;
    int256 amount;
    InterestState state;
    bytes32 cdmHash; // hash of the CDM CollateralInterestStatement
}

struct Substitution {
    address pledgor;
    address securedParty;
    SubstitutionState state;
    bytes32 requestCdmHash; // hash of the CDM SubstitutionInstruction (request)
    bytes32 decisionCdmHash; // hash of the CDM SubstitutionInstruction (consent or refusal), 0 until decided
    bytes32 settleCdmHash; // hash of the CDM SubstitutionInstruction (settle), 0 until settled
}
