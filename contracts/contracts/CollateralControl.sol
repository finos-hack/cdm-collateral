// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MarginCall} from "./MarginCall.sol";
import {OracleFeed} from "./OracleFeed.sol";
import {CallKind, CallState, ProposalState, SubstitutionState, InterestState, AmendmentState, Asset, Call, Proposal, Substitution, InterestStatement, Amendment, HaircutTerm, Netting} from "./CollateralTypes.sol";

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
    address[] private _scheduleTokens; // every token setEligibility has configured

    // Eligibility per (pledgor, secured party) after an agreed amendment (task-csa-amendment); the global schedule
    // applies to a pair until its first amendment.
    mapping(address => mapping(address => mapping(address => Eligibility))) private _pairEligibility;
    mapping(address => mapping(address => bool)) private _pairAmended;
    /// Hash of the CDM amendment last agreed between a pledgor and a secured party (0: the baseline agreement).
    mapping(address => mapping(address => bytes32)) public agreementHash;
    mapping(address => mapping(address => bytes32)) public pendingAmendment;
    mapping(bytes32 => Amendment) private _amendments;
    mapping(bytes32 => HaircutTerm[]) private _amendmentTerms;

    // Pledged collateral held in escrow for initial margin, pooled per (pledgor, secured party).
    mapping(address => mapping(address => mapping(address => uint256))) private _pledged;
    mapping(address => mapping(address => address[])) private _pledgedTokens;
    mapping(address => mapping(address => mapping(address => bool))) private _inList;

    event Pledged(bytes32 indexed callId, address indexed pledgor, address indexed securedParty, uint256 value);
    event Transferred(bytes32 indexed callId, address indexed from, address indexed to, uint256 value);
    event Returned(bytes32 indexed callId, address indexed securedParty, address indexed pledgor);
    event Enforced(bytes32 indexed callId, address indexed securedParty, address indexed pledgor);
    event Reclaimed(bytes32 indexed reclaimId, address indexed pledgor, address indexed securedParty, bytes32 cdmHash);
    event ClosedOut(bytes32 indexed closeOutId, address indexed securedParty, address indexed pledgor, uint256 owed, uint256 applied, bytes32 cdmHash);
    event SubstitutionRequested(bytes32 indexed substitutionId, address indexed pledgor, address indexed securedParty, bytes32 cdmHash);
    event SubstitutionDecided(bytes32 indexed substitutionId, bool consent, bytes32 cdmHash);
    event SubstitutionSettled(bytes32 indexed substitutionId, bytes32 cdmHash);
    event AmendmentProposed(bytes32 indexed amendmentId, address indexed pledgor, address indexed securedParty, address proposer, bytes32 cdmHash);
    event AmendmentDecided(bytes32 indexed amendmentId, bool consent, bytes32 cdmHash);
    event InterestStated(bytes32 indexed interestId, address indexed securedParty, address indexed pledgor, address cashToken, int256 amount, bytes32 cdmHash);
    event InterestSettled(bytes32 indexed interestId, address indexed payer, address indexed payee, uint256 amount);
    /// settledBy pays the net amount to counterparty when it is above zero.
    event SettlementNetted(bytes32 indexed nettingId, address indexed settledBy, address indexed counterparty, address cashToken, uint256 amount, bytes32 cdmHash);

    // Close-outs on default, by id: the hash of the CDM CloseOutStatement (cdm-ext cdmx.collateral.closeout, G15).
    mapping(bytes32 => bytes32) public closeOutCdmHash;
    // Reclaims by a pledgor after its secured party's default, by id: the hash of the CDM record of the return.
    mapping(bytes32 => bytes32) public reclaimCdmHash;

    // Substitutions of pledged initial margin, by id, with the original items to return and the substitute offered.
    mapping(bytes32 => Substitution) private _subs;
    mapping(bytes32 => Asset[]) private _subOriginal;
    mapping(bytes32 => Asset[]) private _subSubstitute;

    // Interest on cash collateral (flow-interest-on-cash, G17).
    mapping(bytes32 => InterestStatement) private _interest;

    // Settlement netting (task-csa-settlement-netting), by id, with the calls and interest statements it settled.
    mapping(bytes32 => Netting) private _nettings;
    mapping(bytes32 => bytes32[]) private _nettingCalls;
    mapping(bytes32 => bytes32[]) private _nettingInterest;
    /// The netting a call or an interest statement settled in; 0 when none.
    mapping(bytes32 => bytes32) public nettedIn;

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
    error InterestExists();
    error AmendmentExists();
    error AmendmentPending();
    error StaleAgreement(bytes32 current, bytes32 given);
    error NoSuchAmendment();
    error NoSuchInterest();
    error NotCash(address token);
    error NettingExists();
    error NothingToNet();
    error NotNettable(bytes32 id);
    error NotNetPayer(address payer);

    constructor(MarginCall marginCall_, OracleFeed oracle_) {
        deployer = msg.sender;
        marginCall = marginCall_;
        oracle = oracle_;
    }

    /// @notice Configure the initial-margin eligibility schedule used for the on-chain value check.
    function setEligibility(address token, bool eligible, uint16 haircutBps) external {
        if (msg.sender != deployer) revert NotDeployer();
        bool known = false;
        for (uint256 i = 0; i < _scheduleTokens.length; i++) if (_scheduleTokens[i] == token) known = true;
        if (!known) _scheduleTokens.push(token);
        eligibility[token] = Eligibility({eligible: eligible, haircutBps: haircutBps});
    }

    /// @notice The eligibility and haircut that apply to a token between a pledgor and a secured party: the pair's own
    /// after an agreed amendment, otherwise the global schedule.
    function eligibilityFor(address pledgor, address securedParty, address token) public view returns (Eligibility memory) {
        return _pairAmended[pledgor][securedParty] ? _pairEligibility[pledgor][securedParty][token] : eligibility[token];
    }

    /// @notice Propose an amendment of the agreement terms between `pledgor` and `securedParty` (task-csa-amendment);
    /// the proposer (this key) is one of them. `terms` are the haircut changes (tokens not named keep theirs);
    /// `beforeHash` must be the pair's current agreementHash, and only one amendment is pending at a time. `cdmHash` is
    /// the hash of the CDM CollateralAgreementAmendment (wp-adr-cdm-payload-carrier), which also carries any election
    /// change (MTA, rounding) that the services apply.
    function proposeAmendment(bytes32 amendmentId, address pledgor, address securedParty, HaircutTerm[] calldata terms,
                              bytes32 beforeHash, bytes32 cdmHash) external {
        if (msg.sender != pledgor && msg.sender != securedParty) revert WrongParty();
        if (pledgor == securedParty) revert WrongParty();
        if (_amendments[amendmentId].state != AmendmentState.None || cdmHash == bytes32(0)) revert AmendmentExists();
        if (pendingAmendment[pledgor][securedParty] != bytes32(0)) revert AmendmentPending();
        if (agreementHash[pledgor][securedParty] != beforeHash) revert StaleAgreement(agreementHash[pledgor][securedParty], beforeHash);
        for (uint256 i = 0; i < terms.length; i++) if (terms[i].haircutBps >= 10000) revert Ineligible(terms[i].token);
        Amendment storage a = _amendments[amendmentId];
        a.pledgor = pledgor;
        a.securedParty = securedParty;
        a.proposer = msg.sender;
        a.state = AmendmentState.Proposed;
        a.beforeHash = beforeHash;
        a.proposeCdmHash = cdmHash;
        for (uint256 i = 0; i < terms.length; i++) _amendmentTerms[amendmentId].push(terms[i]);
        pendingAmendment[pledgor][securedParty] = amendmentId;
        emit AmendmentProposed(amendmentId, pledgor, securedParty, msg.sender, cdmHash);
    }

    /// @notice The other party (this key) consents to or refuses a proposed amendment. On consent the haircut terms
    /// apply to the pair (the global schedule is copied for the pair on its first amendment) and the pair's
    /// agreementHash becomes the amendment's hash.
    function decideAmendment(bytes32 amendmentId, bool consent, bytes32 cdmHash) external {
        Amendment storage a = _amendments[amendmentId];
        if (a.state == AmendmentState.None) revert NoSuchAmendment();
        if (a.state != AmendmentState.Proposed) revert BadState();
        address other = a.proposer == a.pledgor ? a.securedParty : a.pledgor;
        if (msg.sender != other) revert WrongParty();
        if (cdmHash == bytes32(0)) revert BadState();
        a.state = consent ? AmendmentState.Agreed : AmendmentState.Refused;
        a.decisionCdmHash = cdmHash;
        pendingAmendment[a.pledgor][a.securedParty] = bytes32(0);
        if (consent) {
            if (!_pairAmended[a.pledgor][a.securedParty]) {
                for (uint256 i = 0; i < _scheduleTokens.length; i++)
                    _pairEligibility[a.pledgor][a.securedParty][_scheduleTokens[i]] = eligibility[_scheduleTokens[i]];
                _pairAmended[a.pledgor][a.securedParty] = true;
            }
            HaircutTerm[] storage t = _amendmentTerms[amendmentId];
            for (uint256 i = 0; i < t.length; i++)
                _pairEligibility[a.pledgor][a.securedParty][t[i].token] = Eligibility({eligible: t[i].eligible, haircutBps: t[i].haircutBps});
            agreementHash[a.pledgor][a.securedParty] = a.proposeCdmHash;
        }
        emit AmendmentDecided(amendmentId, consent, cdmHash);
    }

    function getAmendment(bytes32 amendmentId) external view returns (Amendment memory amendment, HaircutTerm[] memory terms) {
        if (_amendments[amendmentId].state == AmendmentState.None) revert NoSuchAmendment();
        return (_amendments[amendmentId], _amendmentTerms[amendmentId]);
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
        uint256 value = _valueAfterHaircut(c.to, c.from, assets);
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
        uint256 value = _valueAfterHaircut(pledgor, securedParty, release);
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
                uint256 unitValue = _unitValue(pledgor, securedParty, tokens[i]); // value after haircut of one unit, times 10000
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

    /// @notice The pledgor (this key) takes back its whole escrow on the leg it pledged to `securedParty` after the
    /// oracle feed records the secured party's default (two-way initial margin, wp-adr-two-way-im): segregated initial
    /// margin comes back to the pledgor from the custodian, here the control contract. `cdmHash` is the hash of the CDM
    /// record of the return (wp-adr-cdm-payload-carrier).
    function reclaim(bytes32 reclaimId, address securedParty, bytes32 cdmHash) external nonReentrant {
        address pledgor = msg.sender;
        if (reclaimCdmHash[reclaimId] != bytes32(0) || cdmHash == bytes32(0)) revert CloseOutExists();
        if (!oracle.isDefaulted(securedParty)) revert NoDefault(securedParty);
        reclaimCdmHash[reclaimId] = cdmHash;

        address[] memory tokens = _pledgedTokens[pledgor][securedParty];
        uint256 moved;
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 held = _pledged[pledgor][securedParty][tokens[i]];
            if (held == 0) continue;
            _pledged[pledgor][securedParty][tokens[i]] = 0;
            moved += held;
            IERC20(tokens[i]).transfer(pledgor, held);
        }
        if (moved == 0) revert NothingPledged();
        emit Reclaimed(reclaimId, pledgor, securedParty, cdmHash);
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

    /// @notice The secured party (this key) states the Interest Amount on the pledgor's cash collateral for one
    /// Interest Period (flow-interest-on-cash, G17) and, when it is positive, pays it to the pledgor in the same
    /// transaction (ISDA CSA Interest Amount, Transfer handling). A negative amount (negative interest) is recorded and
    /// paid by the pledgor with payInterest. `cashToken` must be eligible with no haircut (cash). `amount` is in units of
    /// the cash token. `cdmHash` is the hash of the CDM CollateralInterestStatement (wp-adr-cdm-payload-carrier).
    function stateInterest(bytes32 interestId, address pledgor, address cashToken, int256 amount, bytes32 cdmHash) external nonReentrant {
        _stateInterest(interestId, pledgor, cashToken, amount, cdmHash, false);
    }

    /// @notice The secured party (this key) states an Interest Amount and holds it for settlement netting
    /// (task-csa-settlement-netting, election netInterestWithMarginCalls): nothing moves now; the amount settles in
    /// settleNetted with the margin movements of the same day, or alone by payInterest.
    function stateInterestForNetting(bytes32 interestId, address pledgor, address cashToken, int256 amount, bytes32 cdmHash) external nonReentrant {
        if (amount == 0) revert NothingToNet();
        _stateInterest(interestId, pledgor, cashToken, amount, cdmHash, true);
    }

    function _stateInterest(bytes32 interestId, address pledgor, address cashToken, int256 amount, bytes32 cdmHash, bool hold) private {
        address securedParty = msg.sender;
        if (_interest[interestId].state != InterestState.None || cdmHash == bytes32(0)) revert InterestExists();
        if (pledgor == securedParty || pledgor == address(0)) revert WrongParty();
        Eligibility memory e = eligibilityFor(pledgor, securedParty, cashToken);
        if (!e.eligible || e.haircutBps != 0) revert NotCash(cashToken);
        InterestStatement storage s = _interest[interestId];
        s.pledgor = pledgor;
        s.securedParty = securedParty;
        s.cashToken = cashToken;
        s.amount = amount;
        s.cdmHash = cdmHash;
        s.state = (hold || amount < 0) ? InterestState.Stated : InterestState.Settled;
        emit InterestStated(interestId, securedParty, pledgor, cashToken, amount, cdmHash);
        if (s.state == InterestState.Settled) {
            if (amount > 0) IERC20(cashToken).transferFrom(securedParty, pledgor, uint256(amount));
            emit InterestSettled(interestId, securedParty, pledgor, uint256(amount));
        }
    }

    /// @notice The paying party (this key) pays a stated Interest Amount: the pledgor a negative one, the secured party a
    /// positive one held for netting.
    function payInterest(bytes32 interestId) external nonReentrant {
        InterestStatement storage s = _interest[interestId];
        if (s.state == InterestState.None) revert NoSuchInterest();
        if (s.state != InterestState.Stated) revert BadState();
        (address payer, address payee) = s.amount < 0 ? (s.pledgor, s.securedParty) : (s.securedParty, s.pledgor);
        if (msg.sender != payer) revert WrongParty();
        s.state = InterestState.Settled;
        uint256 amount = uint256(s.amount < 0 ? -s.amount : s.amount);
        IERC20(s.cashToken).transferFrom(payer, payee, amount);
        emit InterestSettled(interestId, payer, payee, amount);
    }

    // --- settlement netting (task-csa-settlement-netting) ---
    // Scope is the project owner's choice of 2026-11-06; the rules are assumptions awaiting a business SME
    // (task-sme-settlement-netting-rules). Initial margin is segregated in escrow and does not net.

    /// @notice Settle agreed VM calls, VM return calls and stated Interest Amounts between this key and one counterparty
    /// by one transfer of the cash token. A VM call's accepted proposal must be the cash token alone; a return call's
    /// agreed amount is paid in the cash token at the feed price. The movements are summed per direction and the net is
    /// paid by this key, which must be the party owing it (nothing moves when they offset). `callCdmHashes` are the CDM
    /// SettleCallInstruction hashes, one per call; `cdmHash` is the CDM SettlementNettingStatement hash.
    function settleNetted(
        bytes32 nettingId,
        bytes32[] calldata callIds,
        bytes32[] calldata callCdmHashes,
        bytes32[] calldata interestIds,
        address cashToken,
        bytes32 cdmHash
    ) external nonReentrant {
        if (_nettings[nettingId].cdmHash != bytes32(0) || cdmHash == bytes32(0)) revert NettingExists();
        if (callIds.length == 0 || callIds.length != callCdmHashes.length || callIds.length + interestIds.length < 2) revert NothingToNet();
        address other = _counterpartyOnCash(callIds[0], cashToken);
        int256 net = _netCalls(nettingId, callIds, callCdmHashes, cashToken, other)
            + _netInterest(nettingId, interestIds, cashToken, other);
        if (net < 0) revert NotNetPayer(other);
        _nettingCalls[nettingId] = callIds;
        _nettingInterest[nettingId] = interestIds;
        _recordNetting(nettingId, cashToken, other, uint256(net), cdmHash);
    }

    /// The other party to the first call, which must include this key; the cash token must be eligible at no haircut.
    function _counterpartyOnCash(bytes32 callId, address cashToken) private view returns (address other) {
        Call memory first = marginCall.getCall(callId);
        if (first.from != msg.sender && first.to != msg.sender) revert WrongParty();
        other = first.from == msg.sender ? first.to : first.from;
        Eligibility memory e = eligibilityFor(first.to, first.from, cashToken);
        if (!e.eligible || e.haircutBps != 0) revert NotCash(cashToken);
    }

    function _recordNetting(bytes32 nettingId, address cashToken, address other, uint256 amount, bytes32 cdmHash) private {
        Netting storage n = _nettings[nettingId];
        n.cashToken = cashToken;
        n.amount = amount;
        n.cdmHash = cdmHash;
        if (amount > 0) {
            n.payer = msg.sender;
            n.receiver = other;
            IERC20(cashToken).transferFrom(msg.sender, other, amount);
        }
        emit SettlementNetted(nettingId, msg.sender, other, cashToken, amount, cdmHash);
    }

    function getNetting(bytes32 nettingId) external view returns (Netting memory netting, bytes32[] memory callIds, bytes32[] memory interestIds) {
        return (_nettings[nettingId], _nettingCalls[nettingId], _nettingInterest[nettingId]);
    }

    /// What `me` owes `other` on the calls, less what `other` owes `me`; each call is marked settled. On a VM call and on
    /// a return call the called party (`to`) pays the calling party (`from`).
    function _netCalls(bytes32 nettingId, bytes32[] calldata callIds, bytes32[] calldata callCdmHashes, address cashToken, address other)
        private returns (int256 net) {
        address me = msg.sender;
        for (uint256 i = 0; i < callIds.length; i++) {
            bytes32 id = callIds[i];
            Call memory c = marginCall.getCall(id);
            if (!((c.from == me && c.to == other) || (c.from == other && c.to == me))) revert WrongParty();
            if (!(c.state == CallState.Agreed || c.state == CallState.PartiallyAgreed)) revert BadState();
            uint256 qty;
            if (c.kind == CallKind.VM) {
                if (c.activeProposal == 0) revert ProposalNotAccepted();
                uint256 pid = c.activeProposal - 1;
                if (marginCall.getProposal(id, pid).state != ProposalState.Accepted) revert ProposalNotAccepted();
                Asset[] memory a = marginCall.getProposalAssets(id, pid);
                if (a.length != 1 || a[0].token != cashToken) revert NotNettable(id);
                qty = a[0].qty;
            } else if (c.kind == CallKind.Return) {
                uint256 price = oracle.price(cashToken);
                if (price == 0 || c.agreed % price != 0) revert NotNettable(id);
                qty = c.agreed / price;
            } else {
                revert WrongKind();
            }
            net += c.to == me ? int256(qty) : -int256(qty);
            nettedIn[id] = nettingId;
            marginCall.markSettled(id, c.kind == CallKind.VM && c.disputed > 0, callCdmHashes[i]);
        }
    }

    /// What `me` owes `other` on the stated Interest Amounts, less what `other` owes `me`; each is marked settled.
    function _netInterest(bytes32 nettingId, bytes32[] calldata interestIds, address cashToken, address other)
        private returns (int256 net) {
        address me = msg.sender;
        for (uint256 i = 0; i < interestIds.length; i++) {
            InterestStatement storage s = _interest[interestIds[i]];
            if (s.state != InterestState.Stated) revert BadState();
            if (s.cashToken != cashToken) revert NotNettable(interestIds[i]);
            if (!((s.pledgor == me && s.securedParty == other) || (s.pledgor == other && s.securedParty == me))) revert WrongParty();
            address payer = s.amount < 0 ? s.pledgor : s.securedParty;
            int256 qty = s.amount < 0 ? -s.amount : s.amount;
            net += payer == me ? qty : -qty;
            s.state = InterestState.Settled;
            nettedIn[interestIds[i]] = nettingId;
        }
    }

    function getInterest(bytes32 interestId) external view returns (InterestStatement memory) {
        if (_interest[interestId].state == InterestState.None) revert NoSuchInterest();
        return _interest[interestId];
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
    function _valueAfterHaircut(address pledgor, address securedParty, Asset[] memory assets) private view returns (uint256 value) {
        for (uint256 i = 0; i < assets.length; i++) {
            Eligibility memory e = eligibilityFor(pledgor, securedParty, assets[i].token);
            if (!e.eligible) revert Ineligible(assets[i].token);
            uint256 priceScaled = oracle.price(assets[i].token);
            value += (assets[i].qty * priceScaled * (10000 - e.haircutBps)) / 10000;
        }
    }

    /// Value after haircut of one unit at the oracle price, times 10000 (0 for an ineligible token). Scaled by PRICE_SCALE.
    function _unitValue(address pledgor, address securedParty, address token) private view returns (uint256) {
        Eligibility memory e = eligibilityFor(pledgor, securedParty, token);
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
        uint256 originalValue = _valueAfterHaircut(pledgor, securedParty, original);
        uint256 substituteValue = _valueAfterHaircut(pledgor, securedParty, substitute);
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
