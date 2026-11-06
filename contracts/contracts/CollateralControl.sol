// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarginCall} from "./MarginCall.sol";
import {OracleFeed} from "./OracleFeed.sol";
import {CallKind, CallState, ProposalState, SubstitutionState, Asset, Call, Proposal, Substitution} from "./CollateralTypes.sol";

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
    event ClosedOut(bytes32 indexed closeOutId, address indexed securedParty, address indexed pledgor, uint256 owed, uint256 applied, bytes32 cdmHash);
    event SubstitutionRequested(bytes32 indexed substitutionId, address indexed pledgor, address indexed securedParty, bytes32 cdmHash);
    event SubstitutionDecided(bytes32 indexed substitutionId, bool consent, bytes32 cdmHash);
    event SubstitutionSettled(bytes32 indexed substitutionId, bytes32 cdmHash);

    // Close-outs on default, by id: the hash of the CDM CloseOutStatement (cdm-ext cdmx.collateral.closeout, G15).
    mapping(bytes32 => bytes32) public closeOutCdmHash;

    // Substitutions of pledged initial margin, by id, with the original items to return and the substitute offered.
    mapping(bytes32 => Substitution) private _subs;
    mapping(bytes32 => Asset[]) private _subOriginal;
    mapping(bytes32 => Asset[]) private _subSubstitute;

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
    error CloseOutExists();
    error SubstitutionExists();
    error NoSuchSubstitution();
    error EmptySubstitution();
    error SubstituteBelowOriginal(uint256 substituteValue, uint256 originalValue);

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

    /// @notice Settle a variation-margin call by moving title directly from the deliverer to the receiver. `cdmHash`
    /// is the CDM SettleCallInstruction hash, anchored on-chain for the payload carrier (wp-adr-cdm-payload-carrier).
    function settleByTransfer(bytes32 callId, uint256 proposalId, bytes32 cdmHash) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.VM) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();
        if (marginCall.getProposal(callId, proposalId).state != ProposalState.Accepted) revert ProposalNotAccepted();

        Asset[] memory assets = marginCall.getProposalAssets(callId, proposalId);
        for (uint256 i = 0; i < assets.length; i++) {
            IERC20(assets[i].token).transferFrom(c.to, c.from, assets[i].qty);
        }
        marginCall.markSettled(callId, c.disputed > 0, cdmHash);
        emit Transferred(callId, c.to, c.from, _marketValue(assets));
    }

    /// @notice Agree a return call and release escrowed initial margin back to the pledgor (secured party's key). The
    /// return is agreed through the margin call contract's response step first, so the call is in an agreed state here;
    /// `cdmHash` is the CDM SettleCallInstruction hash anchored on-chain (wp-adr-cdm-payload-carrier).
    function returnCollateral(bytes32 callId, Asset[] calldata release, bytes32 cdmHash) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.Return) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();

        address pledgor = c.from;
        address securedParty = c.to;
        uint256 value = _valueAfterHaircut(release);
        if (value > c.agreed) revert ReleaseExceedsCall(value, c.agreed);

        for (uint256 i = 0; i < release.length; i++) {
            uint256 held = _pledged[pledgor][securedParty][release[i].token];
            if (release[i].qty > held) revert NotPledged(release[i].token, held, release[i].qty);
            _pledged[pledgor][securedParty][release[i].token] = held - release[i].qty;
        }
        marginCall.markSettled(callId, false, cdmHash);
        for (uint256 i = 0; i < release.length; i++) {
            IERC20(release[i].token).transfer(pledgor, release[i].qty);
        }
        emit Returned(callId, securedParty, pledgor);
    }

    /// @notice Agree a variation-margin return by transferring equivalent credit support back (deliverer's key).
    /// `cdmHash` is the CDM SettleCallInstruction hash anchored on-chain (wp-adr-cdm-payload-carrier).
    function returnByTransfer(bytes32 callId, Asset[] calldata assets, bytes32 cdmHash) external nonReentrant {
        Call memory c = marginCall.getCall(callId);
        if (c.kind != CallKind.Return) revert WrongKind();
        if (msg.sender != c.to) revert WrongParty();
        if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();

        uint256 value = _marketValue(assets);
        if (value != c.agreed) revert ReturnMustEqualCall(value, c.agreed);

        marginCall.markSettled(callId, false, cdmHash);
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

    /// @notice Close out the netting set after the pledgor's default (ISDA 2002 MA Section 6(e); cdm-ext CloseOutNetting,
    /// G15). Under the security interest of the IM CSA the secured party (the Non-defaulting Party, this key) applies the
    /// pledged collateral to `owed`, the Early Termination Amount payable by the pledgor (0 when it is not positive), and
    /// the surplus goes back to the pledgor. The contract chooses the collateral applied, so both parties can recompute
    /// it: the pledged tokens in the order first pledged, each at its value after haircut at the feed price, in whole
    /// units, until the value applied reaches `owed`. The value applied can exceed `owed` by less than one unit of the
    /// last token applied. `cdmHash` is the hash of the CDM CloseOutStatement (wp-adr-cdm-payload-carrier).
    function closeOut(bytes32 closeOutId, address pledgor, uint256 owed, bytes32 cdmHash) external nonReentrant {
        address securedParty = msg.sender;
        if (closeOutCdmHash[closeOutId] != bytes32(0) || cdmHash == bytes32(0)) revert CloseOutExists();
        if (!oracle.isDefaulted(pledgor)) revert NoDefault(pledgor);
        closeOutCdmHash[closeOutId] = cdmHash;

        address[] memory tokens = _pledgedTokens[pledgor][securedParty];
        uint256 remaining = owed;
        uint256 applied;
        uint256 held;
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 qty = _pledged[pledgor][securedParty][tokens[i]];
            if (qty == 0) continue;
            held += qty;
            _pledged[pledgor][securedParty][tokens[i]] = 0;
            uint256 take = 0;
            if (remaining > 0) {
                uint256 unitValue = _unitValue(tokens[i]); // value after haircut of one unit, times 10000
                if (unitValue > 0) {
                    take = (remaining * 10000 + unitValue - 1) / unitValue; // whole units, rounded up
                    if (take > qty) take = qty;
                    uint256 v = (take * unitValue) / 10000;
                    applied += v;
                    remaining = v >= remaining ? 0 : remaining - v;
                }
            }
            if (take > 0) IERC20(tokens[i]).transfer(securedParty, take);
            if (qty > take) IERC20(tokens[i]).transfer(pledgor, qty - take);
        }
        if (held == 0) revert NothingPledged();
        emit ClosedOut(closeOutId, securedParty, pledgor, owed, applied, cdmHash);
    }

    /// @notice The pledgor (this key) gives notice of a substitution (ISDA CSA Paragraph 4(d)(i)): the pledged items it
    /// asks back and the substitute it offers. The originals must be in escrow and the substitute eligible and worth at
    /// least as much after haircuts (the proviso to Paragraph 4(d)(ii)). `cdmHash` is the hash of the CDM
    /// SubstitutionInstruction (request).
    function requestSubstitution(bytes32 substitutionId, address securedParty, Asset[] calldata original,
                                 Asset[] calldata substitute, bytes32 cdmHash) external {
        if (_subs[substitutionId].state != SubstitutionState.None) revert SubstitutionExists();
        if (original.length == 0 || substitute.length == 0) revert EmptySubstitution();
        if (securedParty == msg.sender || securedParty == address(0)) revert WrongParty();
        _checkSubstitution(msg.sender, securedParty, original, substitute);
        _subs[substitutionId] = Substitution({pledgor: msg.sender, securedParty: securedParty, state: SubstitutionState.Requested,
            requestCdmHash: cdmHash, decisionCdmHash: bytes32(0), settleCdmHash: bytes32(0)});
        for (uint256 i = 0; i < original.length; i++) _subOriginal[substitutionId].push(original[i]);
        for (uint256 i = 0; i < substitute.length; i++) _subSubstitute[substitutionId].push(substitute[i]);
        emit SubstitutionRequested(substitutionId, msg.sender, securedParty, cdmHash);
    }

    /// @notice The secured party (this key) consents to or refuses a requested substitution (Paragraph 13 (f)(ii)).
    function decideSubstitution(bytes32 substitutionId, bool consent, bytes32 cdmHash) external {
        Substitution storage s = _loadSub(substitutionId);
        if (msg.sender != s.securedParty) revert WrongParty();
        if (s.state != SubstitutionState.Requested) revert BadState();
        s.state = consent ? SubstitutionState.Consented : SubstitutionState.Refused;
        s.decisionCdmHash = cdmHash;
        emit SubstitutionDecided(substitutionId, consent, cdmHash);
    }

    /// @notice Settle a consented substitution (pledgor's key, Paragraph 4(d)(ii)): the substitute moves into escrow and
    /// the original items go back to the pledgor in the same transaction. Holdings and values are checked again at the
    /// feed prices of this block.
    function settleSubstitution(bytes32 substitutionId, bytes32 cdmHash) external nonReentrant {
        Substitution storage s = _loadSub(substitutionId);
        if (msg.sender != s.pledgor) revert WrongParty();
        if (s.state != SubstitutionState.Consented) revert BadState();
        Asset[] memory original = _subOriginal[substitutionId];
        Asset[] memory substitute = _subSubstitute[substitutionId];
        _checkSubstitution(s.pledgor, s.securedParty, original, substitute);
        s.state = SubstitutionState.Settled;
        s.settleCdmHash = cdmHash;
        for (uint256 i = 0; i < substitute.length; i++) {
            IERC20(substitute[i].token).transferFrom(s.pledgor, address(this), substitute[i].qty);
            _addPledge(s.pledgor, s.securedParty, substitute[i].token, substitute[i].qty);
        }
        for (uint256 i = 0; i < original.length; i++) {
            _pledged[s.pledgor][s.securedParty][original[i].token] -= original[i].qty;
            IERC20(original[i].token).transfer(s.pledgor, original[i].qty);
        }
        emit SubstitutionSettled(substitutionId, cdmHash);
    }

    function getSubstitution(bytes32 substitutionId) external view returns (Substitution memory) {
        return _loadSub(substitutionId);
    }

    function getSubstitutionAssets(bytes32 substitutionId) external view returns (Asset[] memory original, Asset[] memory substitute) {
        _loadSub(substitutionId);
        return (_subOriginal[substitutionId], _subSubstitute[substitutionId]);
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

    /// Value after haircut of one unit at the oracle price, times 10000 (0 for an ineligible token). Scaled by PRICE_SCALE.
    function _unitValue(address token) private view returns (uint256) {
        Eligibility memory e = eligibility[token];
        if (!e.eligible) return 0;
        return oracle.price(token) * (10000 - e.haircutBps);
    }

    /// Reverts unless every original item is in escrow and the substitute is worth at least as much after haircuts.
    function _checkSubstitution(address pledgor, address securedParty, Asset[] memory original, Asset[] memory substitute) private view {
        for (uint256 i = 0; i < original.length; i++) {
            uint256 asked;
            for (uint256 j = 0; j < original.length; j++) if (original[j].token == original[i].token) asked += original[j].qty;
            uint256 held = _pledged[pledgor][securedParty][original[i].token];
            if (asked > held) revert NotPledged(original[i].token, held, asked);
        }
        uint256 originalValue = _valueAfterHaircut(original);
        uint256 substituteValue = _valueAfterHaircut(substitute);
        if (substituteValue < originalValue) revert SubstituteBelowOriginal(substituteValue, originalValue);
    }

    function _loadSub(bytes32 substitutionId) private view returns (Substitution storage s) {
        s = _subs[substitutionId];
        if (s.state == SubstitutionState.None) revert NoSuchSubstitution();
    }

    /// Market value at the oracle price, no haircut. Scaled by OracleFeed.PRICE_SCALE.
    function _marketValue(Asset[] memory assets) private view returns (uint256 value) {
        for (uint256 i = 0; i < assets.length; i++) {
            value += assets[i].qty * oracle.price(assets[i].token);
        }
    }
}
