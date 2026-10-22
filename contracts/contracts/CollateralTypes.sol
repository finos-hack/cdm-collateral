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
}

struct Proposal {
    ProposalState state;
    bytes32 cdmHash;
}
