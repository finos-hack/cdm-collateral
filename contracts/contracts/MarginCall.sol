// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {CallKind, CallState, ProposalState, ResponseType, Asset, Call, Proposal} from "./CollateralTypes.sol";

/// @title Margin call contract
/// @notice Records the margin call lifecycle on-chain: issuance, response (agree / partial / dispute), collateral
/// proposal and the receiver's decision (wp-adr-margin-call-state-onchain, nw-mimic-real-flows). Each state change is
/// made by exactly one party's key — the contract enforces *who* may change state; agreement policy (who is allowed
/// to call initial margin, eligibility, concentration) stays in the workflow service. Settlement is performed by the
/// collateral control contract, which calls `markSettled` here. Every call and proposal carries the hash of its CDM
/// content so a counterparty can check the CDM it receives off-chain against the on-chain hash
/// (concept-asr-onchain-call-state).
contract MarginCall {
    address public immutable deployer;
    address public control; // the collateral control contract, set once after deployment

    mapping(bytes32 => Call) private _calls;
    mapping(bytes32 => mapping(uint256 => Proposal)) private _proposals;
    mapping(bytes32 => mapping(uint256 => Asset[])) private _proposalAssets;
    // Replacement links (task-csa-call-replacement): one replacement per cancelled call.
    mapping(bytes32 => bytes32) public replacementOf; // cancelled call -> the call that replaces it
    mapping(bytes32 => bytes32) public replaces; // replacing call -> the cancelled call

    event CallIssued(bytes32 indexed callId, address indexed from, address indexed to, CallKind kind, uint256 amount, bytes32 cdmHash);
    event CallAnswered(bytes32 indexed callId, ResponseType response, uint256 agreed, uint256 disputed, bytes32 cdmHash);
    event CollateralProposed(bytes32 indexed callId, uint256 indexed proposalId, bytes32 cdmHash);
    event ProposalDecided(bytes32 indexed callId, uint256 indexed proposalId, bool accepted, bytes32 cdmHash);
    event CallSettled(bytes32 indexed callId, bool disputedRemains, bytes32 cdmHash);
    event CallWithdrawn(bytes32 indexed callId, bytes32 cdmHash);
    event CancellationRequested(bytes32 indexed callId, address indexed by, bytes32 cdmHash);
    event CancellationDecided(bytes32 indexed callId, bool accepted, bytes32 cdmHash);
    event CallReplaced(bytes32 indexed replacedCallId, bytes32 indexed callId);

    error NotDeployer();
    error NotControl();
    error ControlAlreadySet();
    error CallExists();
    error NoSuchCall();
    error WrongParty();
    error BadState();
    error BadResponse();
    error ReturnHasNoProposal();
    error ProposalPending();
    error EmptyProposal();
    error NoSuchProposal();
    error CancellationPending();
    error NoCancellationRequest();
    error NotReplaceable();

    constructor() {
        deployer = msg.sender;
    }

    function setControl(address control_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (control != address(0)) revert ControlAlreadySet();
        control = control_;
    }

    modifier onlyControl() {
        if (msg.sender != control) revert NotControl();
        _;
    }

    // --- lifecycle, each guarded by the acting party's key ---

    function issueCall(bytes32 callId, CallKind kind, address to, uint256 amount, uint64 deadline, bytes32 cdmHash) external {
        _issue(callId, kind, to, amount, deadline, cdmHash);
    }

    /// @notice Issue a call that replaces a cancelled call (task-csa-call-replacement), for example a corrected amount.
    /// The cancelled call must have the same caller, called party and kind, and no replacement yet. Emits `CallIssued`
    /// for the new call, then `CallReplaced`. The CDM IssueCall step names the replaced call (`replacesCall`).
    function issueReplacementCall(
        bytes32 callId,
        bytes32 replacedCallId,
        CallKind kind,
        address to,
        uint256 amount,
        uint64 deadline,
        bytes32 cdmHash
    ) external {
        Call storage old = _load(replacedCallId);
        if (old.state != CallState.Cancelled || replacementOf[replacedCallId] != bytes32(0)) revert NotReplaceable();
        if (old.from != msg.sender || old.to != to || old.kind != kind) revert NotReplaceable();
        _issue(callId, kind, to, amount, deadline, cdmHash);
        replacementOf[replacedCallId] = callId;
        replaces[callId] = replacedCallId;
        emit CallReplaced(replacedCallId, callId);
    }

    function _issue(bytes32 callId, CallKind kind, address to, uint256 amount, uint64 deadline, bytes32 cdmHash) private {
        if (_calls[callId].state != CallState.None) revert CallExists();
        if (to == msg.sender || to == address(0)) revert WrongParty();
        Call storage c = _calls[callId];
        c.kind = kind;
        c.from = msg.sender;
        c.to = to;
        c.amount = amount;
        c.deadline = deadline;
        c.state = CallState.Issued;
        c.cdmHash = cdmHash;
        emit CallIssued(callId, msg.sender, to, kind, amount, cdmHash);
    }

    function respond(bytes32 callId, ResponseType response, uint256 agreed, bytes32 cdmHash) external {
        Call storage c = _load(callId);
        if (msg.sender != c.to) revert WrongParty();
        if (c.state != CallState.Issued) revert BadState();
        // A return call is agreed through the same response step as a delivery call (issue -> respond -> settle), so
        // its CDM lifecycle folds the same way (wp-adr-cdm-payload-carrier); the control contract then releases.
        if (response == ResponseType.Full) {
            c.agreed = c.amount;
            c.disputed = 0;
            c.state = CallState.Agreed;
        } else if (response == ResponseType.Partial) {
            if (!(agreed > 0 && agreed < c.amount)) revert BadResponse();
            c.agreed = agreed;
            c.disputed = c.amount - agreed;
            c.state = CallState.PartiallyAgreed;
        } else {
            c.agreed = 0;
            c.disputed = c.amount;
            c.state = CallState.Disputed;
        }
        emit CallAnswered(callId, response, c.agreed, c.disputed, cdmHash);
    }

    function propose(bytes32 callId, Asset[] calldata assets, bytes32 cdmHash) external returns (uint256 proposalId) {
        Call storage c = _load(callId);
        if (msg.sender != c.to) revert WrongParty();
        if (c.kind == CallKind.Return) revert ReturnHasNoProposal();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();
        if (c.activeProposal != 0) revert ProposalPending();
        if (c.cancellationRequestedBy != address(0)) revert CancellationPending();
        if (assets.length == 0) revert EmptyProposal();
        proposalId = c.proposalCount++;
        _proposals[callId][proposalId] = Proposal({state: ProposalState.Proposed, cdmHash: cdmHash, decisionCdmHash: bytes32(0)});
        for (uint256 i = 0; i < assets.length; i++) {
            _proposalAssets[callId][proposalId].push(assets[i]);
        }
        c.activeProposal = proposalId + 1;
        emit CollateralProposed(callId, proposalId, cdmHash);
    }

    function decideProposal(bytes32 callId, uint256 proposalId, bool accept, bytes32 cdmHash) external {
        Call storage c = _load(callId);
        if (msg.sender != c.from) revert WrongParty();
        if (c.cancellationRequestedBy != address(0)) revert CancellationPending();
        Proposal storage p = _proposals[callId][proposalId];
        if (p.state != ProposalState.Proposed) revert BadState();
        if (accept) {
            p.state = ProposalState.Accepted;
        } else {
            p.state = ProposalState.Rejected;
            c.activeProposal = 0; // the receiver may propose again
        }
        p.decisionCdmHash = cdmHash;
        emit ProposalDecided(callId, proposalId, accept, cdmHash);
    }

    /// @notice Mark a call settled. Only the control contract calls this, after it has moved collateral. `cdmHash` is
    /// the CDM SettleCallInstruction hash (wp-adr-cdm-payload-carrier); the control contract passes 0 for flows not
    /// yet CDM-bound (VM / Return).
    function markSettled(bytes32 callId, bool disputedRemains, bytes32 cdmHash) external onlyControl {
        Call storage c = _load(callId);
        if (c.cancellationRequestedBy != address(0)) revert CancellationPending();
        c.state = disputedRemains ? CallState.SettledAgreedPart : CallState.Settled;
        c.settleCdmHash = cdmHash;
        emit CallSettled(callId, disputedRemains, cdmHash);
    }

    // --- cancellation (task-csa-call-cancellation; ISO 20022 colr.005 and colr.006) ---
    // Rules are the project owner's assumptions of 2026-11-06, to be confirmed in task-sme-call-cancellation-rules.
    // Collateral moves only at settlement, so a call cancelled before settlement has moved nothing.

    /// @notice The calling party withdraws a call the called party has not answered.
    function withdrawCall(bytes32 callId, bytes32 cdmHash) external {
        Call storage c = _load(callId);
        if (msg.sender != c.from) revert WrongParty();
        if (c.state != CallState.Issued) revert BadState();
        c.state = CallState.Cancelled;
        emit CallWithdrawn(callId, cdmHash);
    }

    /// @notice Either party asks to cancel an answered call that is not settled (agreed, partly agreed or disputed).
    /// While the request is pending the call takes no proposal, decision or settlement.
    function requestCancellation(bytes32 callId, bytes32 cdmHash) external {
        Call storage c = _load(callId);
        if (msg.sender != c.from && msg.sender != c.to) revert WrongParty();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed || c.state == CallState.Disputed)) revert BadState();
        if (c.cancellationRequestedBy != address(0)) revert CancellationPending();
        c.cancellationRequestedBy = msg.sender;
        emit CancellationRequested(callId, msg.sender, cdmHash);
    }

    /// @notice The other party accepts the pending request, which cancels the call and voids a proposal not yet
    /// delivered, or refuses it, which leaves the call where it was.
    function decideCancellation(bytes32 callId, bool accept, bytes32 cdmHash) external {
        Call storage c = _load(callId);
        address requester = c.cancellationRequestedBy;
        if (requester == address(0)) revert NoCancellationRequest();
        address other = requester == c.from ? c.to : c.from;
        if (msg.sender != other) revert WrongParty();
        c.cancellationRequestedBy = address(0);
        if (accept) {
            c.state = CallState.Cancelled;
            if (c.activeProposal != 0) {
                _proposals[callId][c.activeProposal - 1].state = ProposalState.Cancelled;
                c.activeProposal = 0;
            }
        }
        emit CancellationDecided(callId, accept, cdmHash);
    }

    // --- views for the control contract and services ---

    function getCall(bytes32 callId) external view returns (Call memory) {
        return _load(callId);
    }

    function getProposal(bytes32 callId, uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[callId][proposalId];
    }

    function getProposalAssets(bytes32 callId, uint256 proposalId) external view returns (Asset[] memory) {
        return _proposalAssets[callId][proposalId];
    }

    function _load(bytes32 callId) private view returns (Call storage c) {
        c = _calls[callId];
        if (c.state == CallState.None) revert NoSuchCall();
    }
}
