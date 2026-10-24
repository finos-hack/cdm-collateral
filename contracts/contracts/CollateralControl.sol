// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarginCall} from "./MarginCall.sol";
import {OracleFeed} from "./OracleFeed.sol";
import {CallKind, CallState, ProposalState, Asset, Call, Proposal} from "./CollateralTypes.sol";

/// @title Collateral control contract
/// @notice Performs settlement against the state recorded in the margin call contract (control-to-margin-call) and
/// the oracle feed (control-to-oracle-feed). For initial margin it is the segregated custodian: pledged tokens enter
/// escrow and leave only by return or enforcement (wp-adr-im-segregation). For variation margin title passes
/// directly. Every settlement path checks that the call is in an agreed state and, for a delivery, that the receiver
/// accepted the proposal and its value after haircuts covers the agreed amount — the same checks the console's rule
/// engine mimics.
contract CollateralControl is ReentrancyGuard {
    address public immutable deployer;
    MarginCall public immutable marginCall;
    OracleFeed public immutable oracle;

    struct Eligibility {
        bool eligible;
        uint16 haircutBps; // 0..10000
    }

    mapping(address => Eligibility) public eligibility;

    // Pledged collateral held in escrow for initial margin, pooled per (pledgor, secured party).
    mapping(address => mapping(address => mapping(address => uint256))) private _pledged;
    mapping(address => mapping(address => address[])) private _pledgedTokens;
    mapping(address => mapping(address => mapping(address => bool))) private _inList;

    event Pledged(bytes32 indexed callId, address indexed pledgor, address indexed securedParty, uint256 value);
    event Transferred(bytes32 indexed callId, address indexed from, address indexed to, uint256 value);
    event Returned(bytes32 indexed callId, address indexed securedParty, address indexed pledgor);
    event Enforced(bytes32 indexed callId, address indexed securedParty, address indexed pledgor);

    error NotDeployer();
    error WrongKind();
    error WrongParty();
    error BadState();
    error ProposalNotAccepted();
    error Ineligible(address token);
    error ValueBelowAgreed(uint256 value, uint256 agreed);
    error ReleaseExceedsCall(uint256 value, uint256 amount);
    error ReturnMustEqualCall(uint256 value, uint256 amount);
    error NotPledged(address token, uint256 held, uint256 asked);
    error NoDefault(address party);
    error NothingPledged();

    constructor(MarginCall marginCall_, OracleFeed oracle_) {
        deployer = msg.sender;
        marginCall = marginCall_;
        oracle = oracle_;
    }

    /// @notice Configure the initial-margin eligibility schedule used for the on-chain value check.
    function setEligibility(address token, bool eligible, uint16 haircutBps) external {
        if (msg.sender != deployer) revert NotDeployer();
        eligibility[token] = Eligibility({eligible: eligible, haircutBps: haircutBps});
    }

    /// @notice Pledge the accepted proposal's collateral into escrow for an initial-margin call. `cdmHash` is the CDM
    /// SettleCallInstruction hash, anchored on-chain for the payload carrier (wp-adr-cdm-payload-carrier).
    function pledge(bytes32 callId, uint256 proposalId, bytes32 cdmHash) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.IM) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();
        if (marginCall.getProposal(callId, proposalId).state != ProposalState.Accepted) revert ProposalNotAccepted();

        Asset[] memory assets = marginCall.getProposalAssets(callId, proposalId);
        uint256 value = _valueAfterHaircut(assets);
        if (value < c.agreed) revert ValueBelowAgreed(value, c.agreed);

        for (uint256 i = 0; i < assets.length; i++) {
            IERC20(assets[i].token).transferFrom(c.to, address(this), assets[i].qty);
            _addPledge(c.to, c.from, assets[i].token, assets[i].qty);
        }
        marginCall.markSettled(callId, c.disputed > 0, cdmHash);
        emit Pledged(callId, c.to, c.from, value);
    }

    /// @notice Settle a variation-margin call by moving title directly from the deliverer to the receiver.
    function settleByTransfer(bytes32 callId, uint256 proposalId) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.VM) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();
        if (marginCall.getProposal(callId, proposalId).state != ProposalState.Accepted) revert ProposalNotAccepted();

        Asset[] memory assets = marginCall.getProposalAssets(callId, proposalId);
        for (uint256 i = 0; i < assets.length; i++) {
            IERC20(assets[i].token).transferFrom(c.to, c.from, assets[i].qty);
        }
        marginCall.markSettled(callId, c.disputed > 0, bytes32(0)); // VM not CDM-bound yet (wp-adr-cdm-payload-carrier)
        emit Transferred(callId, c.to, c.from, _marketValue(assets));
    }

    /// @notice Agree a return call and release escrowed initial margin back to the pledgor (secured party's key).
    function returnCollateral(bytes32 callId, Asset[] calldata release) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.Return) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (c.state != CallState.Issued) revert BadState();

        address pledgor = c.from;
        address securedParty = c.to;
        uint256 value = _valueAfterHaircut(release);
        if (value > c.amount) revert ReleaseExceedsCall(value, c.amount);

        for (uint256 i = 0; i < release.length; i++) {
            uint256 held = _pledged[pledgor][securedParty][release[i].token];
            if (release[i].qty > held) revert NotPledged(release[i].token, held, release[i].qty);
            _pledged[pledgor][securedParty][release[i].token] = held - release[i].qty;
        }
        marginCall.markSettled(callId, false, bytes32(0)); // Return not CDM-bound yet (wp-adr-cdm-payload-carrier)
        for (uint256 i = 0; i < release.length; i++) {
            IERC20(release[i].token).transfer(pledgor, release[i].qty);
        }
        emit Returned(callId, securedParty, pledgor);
    }

    /// @notice Agree a variation-margin return by transferring equivalent credit support back (deliverer's key).
    function returnByTransfer(bytes32 callId, Asset[] calldata assets) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.Return) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (c.state != CallState.Issued) revert BadState();

        uint256 value = _marketValue(assets);
        if (value != c.amount) revert ReturnMustEqualCall(value, c.amount);

        marginCall.markSettled(callId, false, bytes32(0)); // VM Return not CDM-bound yet (wp-adr-cdm-payload-carrier)
        for (uint256 i = 0; i < assets.length; i++) {
            IERC20(assets[i].token).transferFrom(c.to, c.from, assets[i].qty);
        }
        emit Returned(callId, c.to, c.from);
    }

    /// @notice Seize all pledged collateral after the oracle feed records the pledgor's default (secured party's key).
    function enforce(bytes32 callId) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.IM) revert WrongKind();
        if (msg.sender != c.from) revert WrongParty();
        address securedParty = c.from;
        address pledgor = c.to;
        if (!oracle.isDefaulted(pledgor)) revert NoDefault(pledgor);

        address[] memory tokens = _pledgedTokens[pledgor][securedParty];
        uint256 moved;
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 held = _pledged[pledgor][securedParty][tokens[i]];
            if (held == 0) continue;
            _pledged[pledgor][securedParty][tokens[i]] = 0;
            moved += held;
            IERC20(tokens[i]).transfer(securedParty, held);
        }
        if (moved == 0) revert NothingPledged();
        emit Enforced(callId, securedParty, pledgor);
    }

    // --- views ---

    function pledgedBalance(address pledgor, address securedParty, address token) external view returns (uint256) {
        return _pledged[pledgor][securedParty][token];
    }

    function pledgedTokens(address pledgor, address securedParty) external view returns (address[] memory) {
        return _pledgedTokens[pledgor][securedParty];
    }

    // --- internals ---

    function _addPledge(address pledgor, address securedParty, address token, uint256 qty) private {
        _pledged[pledgor][securedParty][token] += qty;
        if (!_inList[pledgor][securedParty][token]) {
            _inList[pledgor][securedParty][token] = true;
            _pledgedTokens[pledgor][securedParty].push(token);
        }
    }

    /// Value after haircut at the oracle price; reverts if any asset is ineligible. Scaled by OracleFeed.PRICE_SCALE.
    function _valueAfterHaircut(Asset[] memory assets) private view returns (uint256 value) {
        for (uint256 i = 0; i < assets.length; i++) {
            Eligibility memory e = eligibility[assets[i].token];
            if (!e.eligible) revert Ineligible(assets[i].token);
            uint256 priceScaled = oracle.price(assets[i].token);
            value += (assets[i].qty * priceScaled * (10000 - e.haircutBps)) / 10000;
        }
    }

    /// Market value at the oracle price, no haircut. Scaled by OracleFeed.PRICE_SCALE.
    function _marketValue(Asset[] memory assets) private view returns (uint256 value) {
        for (uint256 i = 0; i < assets.length; i++) {
            value += assets[i].qty * oracle.price(assets[i].token);
        }
    }
}
