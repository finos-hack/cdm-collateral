// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev The parts of RepoSettlement the clearing reads and calls; the struct is RepoSettlement.Repo field for field.
interface IRepoSettlement {
    struct Repo {
        address seller;
        address buyer;
        address security;
        uint256 quantity;
        address cash;
        uint256 purchasePrice;
        uint256 repurchasePrice;
        bytes32 tradeHash;
        uint8 state;
        bytes32 purchaseHash;
        bytes32 repurchaseHash;
    }

    function getRepo(bytes32 repoId) external view returns (Repo memory);
    function novate(bytes32 repoId, bytes32 cdmHash) external;
}

/// @dev The oracle feed's default record (OracleFeed), which a close-out requires.
interface ICcpOracleFeed {
    function isDefaulted(address party) external view returns (bool);
}

/// @title CCP clearing: the CCP's rulebook, its capital and the default fund
/// @notice Membership (task-ccp-membership, wp-adr-ccp-membership). The rulebook is a CDM document (cdm-ext
/// CcpRulebook) held by the CCP's and the members' services; only its hash is here, with the members, their default
/// fund shares and the CCP's capital, which the rulebook states. The CCP publishes the rulebook and pays its capital in
/// one transaction. Each member affirms the rulebook's hash and pays its share in one transaction, and is a member once
/// paid; the rulebook is in effect once every member it names has paid, and stays in effect after that. A member that
/// clears no repo may leave and get its share back, and may rejoin by paying again. One rulebook per CCP; there is no
/// amendment.
///
/// Clearing (task-ccp-clearing, wp-adr-ccp-clearing). The seller of a repo booked and affirmed on RepoSettlement submits
/// it to a CCP with the hash of the cdm-ext CcpNovation; the buyer affirms the same hash; the CCP accepts, when the
/// rulebook is in effect and both are paid members, or refuses with the hash of a reason, and the repo stays bilateral.
/// On acceptance RepoSettlement closes the repo as Novated and each member's cleared-repo count rises, so neither may
/// leave. The cleared repo has two legs, the seller against the CCP and the CCP against the buyer. Each member instructs
/// the hash of its own leg's settlement document; the second instruction moves the securities and the cash between the
/// members in one transaction, the CCP, counterparty to both legs, netting to zero. The purchase settles after the
/// acceptance and the repurchase after the purchase; the repurchase lowers both cleared-repo counts.
///
/// Margin (task-ccp-margin, wp-adr-ccp-margin). Once a business day the CCP issues a margin round: for each cleared
/// repo the change in its variation margin, from the seller's side, and for each member the change in the initial
/// margin it posts, each member with the hash of its cdm-ext CcpMarginStatement. A repo's variation margin is paid by
/// one member and passed to the other, so the CCP nets to zero on it; the initial margin stays here. Each member that
/// owes on the round pays its net; the last payment settles the round, paying each member owed. A repurchased repo's
/// variation margin is returned in the next round.
///
/// Default (task-ccp-default, wp-adr-ccp-default). Once the oracle records a member's default, the CCP closes out the
/// member's cleared repos with the hash of its cdm-ext CcpDefaultManagement and the residual of each repo, from the
/// seller's side, left after the variation margin paid. The surviving member of each repo is paid what it is owed; what
/// it owes is due from it. The loss is covered in the order of the rulebook: the defaulter's initial margin, its default
/// fund contribution, the CCP's capital, then the other members' contributions in proportion; what is left of the
/// defaulter's margin and contribution is returned to it, and it is no longer a paid member.
///
/// Porting (task-ccp-porting, wp-adr-ccp-porting). The CCP admits a further member with the hash of its cdm-ext
/// CcpAdmission and its share, which the member pays on joining. A member requests that its leg of a purchased cleared
/// repo move to another paid member, with the hash of the cdm-ext CcpPorting and the payment between them; the other
/// member accepts and the CCP approves, which moves the payment, and a buyer's securities, and makes the other member
/// the leg's party.
contract CcpClearing {
    using SafeERC20 for IERC20;

    enum RulebookState {
        None,
        Published,
        Effective
    }

    struct Rulebook {
        address ccp;
        bytes32 rulebookHash;
        address token;
        uint256 capital;
        uint256 fund;
        RulebookState state;
        uint64 publishedAt;
        uint64 effectiveAt;
    }

    mapping(bytes32 => Rulebook) private rulebooks;
    mapping(bytes32 => address[]) private memberList;
    mapping(bytes32 => mapping(address => uint256)) private shareOf;
    mapping(bytes32 => mapping(address => bool)) private paid;
    /// Repos the member clears under the rulebook. Clearing (task-ccp-clearing) raises it; until then it stays zero.
    mapping(bytes32 => mapping(address => uint256)) public clearedCount;
    mapping(address => bytes32) public rulebookOf;
    /// What a paid member has in the default fund: its share when it joins, less what a default took from it.
    mapping(bytes32 => mapping(address => uint256)) public contributed;
    /// The hash of the cdm-ext CcpAdmission of a member the CCP admitted after publishing; zero for a rulebook member.
    mapping(bytes32 => mapping(address => bytes32)) public admissionOf;

    enum ClearingState {
        None,
        Submitted,
        Affirmed,
        Cleared,
        Refused,
        Purchased,
        Repurchased,
        ClosedOut
    }

    struct ClearedRepo {
        address ccp;
        bytes32 rulebookHash;
        address seller;
        address buyer;
        address security;
        uint256 quantity;
        address cash;
        uint256 purchasePrice;
        uint256 repurchasePrice;
        bytes32 novationHash;
        ClearingState state;
        bytes32 reasonHash;
        bytes32 sellerLegHash;
        bytes32 buyerLegHash;
    }

    /// RepoSettlement.RepoState.Affirmed.
    uint8 private constant REPO_AFFIRMED = 2;

    IRepoSettlement public immutable repoSettlement;
    mapping(bytes32 => ClearedRepo) private clearings;
    mapping(address => bytes32[]) private clearingsOf;

    event ClearingSubmitted(bytes32 indexed repoId, address indexed ccp, address indexed seller, bytes32 novationHash);
    event ClearingAffirmed(bytes32 indexed repoId, address indexed buyer, bytes32 novationHash);
    event ClearingAccepted(bytes32 indexed repoId, address indexed ccp, bytes32 novationHash);
    event ClearingRefused(bytes32 indexed repoId, address indexed ccp, bytes32 reasonHash);
    event ClearedLegInstructed(bytes32 indexed repoId, address indexed member, uint8 state, bytes32 legHash);
    event ClearedRepoSettled(bytes32 indexed repoId, uint8 state, bytes32 sellerLegHash, bytes32 buyerLegHash);

    event RulebookPublished(bytes32 indexed rulebookHash, address indexed ccp, address token, uint256 capital);
    event MemberJoined(bytes32 indexed rulebookHash, address indexed member, uint256 share);
    event MemberLeft(bytes32 indexed rulebookHash, address indexed member, uint256 share);
    event RulebookEffective(bytes32 indexed rulebookHash);

    error RulebookExists();
    error UnknownRulebook();
    error NotAMember();
    error AlreadyPaid();
    error NotPaid();
    error StillClearing();
    error BadRulebook();
    error WrongClearingState(ClearingState state);
    error NotTheSeller();
    error NotTheBuyer();
    error NotTheCcp();
    error RepoNotAffirmed();
    error NotEffective();
    error MemberNotPaid(address member);
    error HashMismatch();
    error AlreadyInstructed();
    error MarginHeld();
    error BadRound();
    error RoundOpen();
    error WrongRoundState();
    error NothingToPay();
    error NotInDefault();
    error BadCloseOut();
    error LossExceedsResources();
    error NothingDue();
    error BadPorting();
    error PortingPending();
    error WrongPortingState();

    ICcpOracleFeed public immutable oracle;

    constructor(address repoSettlement_, address oracle_) {
        repoSettlement = IRepoSettlement(repoSettlement_);
        oracle = ICcpOracleFeed(oracle_);
    }

    /// @notice The CCP publishes the rulebook's hash, its members and their shares, and pays its capital in `token`.
    function publishRulebook(bytes32 rulebookHash, address token, address[] calldata named, uint256[] calldata shares, uint256 capital)
        external
    {
        if (rulebookHash == bytes32(0) || token == address(0) || named.length == 0 || named.length != shares.length || capital == 0) {
            revert BadRulebook();
        }
        if (rulebookOf[msg.sender] != bytes32(0) || rulebooks[rulebookHash].state != RulebookState.None) revert RulebookExists();
        for (uint256 i = 0; i < named.length; i++) {
            address m = named[i];
            if (m == address(0) || m == msg.sender || shares[i] == 0 || shareOf[rulebookHash][m] != 0) revert BadRulebook();
            shareOf[rulebookHash][m] = shares[i];
            memberList[rulebookHash].push(m);
        }
        rulebooks[rulebookHash] = Rulebook({
            ccp: msg.sender,
            rulebookHash: rulebookHash,
            token: token,
            capital: capital,
            fund: 0,
            state: RulebookState.Published,
            publishedAt: uint64(block.number),
            effectiveAt: 0
        });
        rulebookOf[msg.sender] = rulebookHash;
        IERC20(token).safeTransferFrom(msg.sender, address(this), capital);
        emit RulebookPublished(rulebookHash, msg.sender, token, capital);
    }

    /// @notice A member named in the rulebook affirms its hash and pays its default fund share.
    function join(bytes32 rulebookHash) external {
        Rulebook storage r = rulebooks[rulebookHash];
        if (r.state == RulebookState.None) revert UnknownRulebook();
        uint256 share = shareOf[rulebookHash][msg.sender];
        if (share == 0) revert NotAMember();
        if (paid[rulebookHash][msg.sender]) revert AlreadyPaid();
        paid[rulebookHash][msg.sender] = true;
        contributed[rulebookHash][msg.sender] = share;
        r.fund += share;
        IERC20(r.token).safeTransferFrom(msg.sender, address(this), share);
        emit MemberJoined(rulebookHash, msg.sender, share);
        if (r.state == RulebookState.Published && allPaid(rulebookHash)) {
            r.state = RulebookState.Effective;
            r.effectiveAt = uint64(block.number);
            emit RulebookEffective(rulebookHash);
        }
    }

    /// @notice A paid member that clears no repo and holds no initial margin here leaves and gets its contribution back.
    function leave(bytes32 rulebookHash) external {
        Rulebook storage r = rulebooks[rulebookHash];
        if (r.state == RulebookState.None) revert UnknownRulebook();
        if (!paid[rulebookHash][msg.sender]) revert NotPaid();
        if (clearedCount[rulebookHash][msg.sender] != 0) revert StillClearing();
        if (imHeld[rulebookHash][msg.sender] != 0) revert MarginHeld();
        uint256 back = contributed[rulebookHash][msg.sender];
        paid[rulebookHash][msg.sender] = false;
        contributed[rulebookHash][msg.sender] = 0;
        r.fund -= back;
        IERC20(r.token).safeTransfer(msg.sender, back);
        emit MemberLeft(rulebookHash, msg.sender, back);
    }

    function allPaid(bytes32 rulebookHash) private view returns (bool) {
        address[] storage ms = memberList[rulebookHash];
        for (uint256 i = 0; i < ms.length; i++) {
            if (!paid[rulebookHash][ms[i]]) return false;
        }
        return true;
    }

    function rulebook(bytes32 rulebookHash) external view returns (Rulebook memory) {
        return rulebooks[rulebookHash];
    }

    /// @notice The members the rulebook names, their shares and whether each has paid.
    function members(bytes32 rulebookHash)
        external
        view
        returns (address[] memory member, uint256[] memory share, bool[] memory hasPaid)
    {
        address[] storage ms = memberList[rulebookHash];
        member = new address[](ms.length);
        share = new uint256[](ms.length);
        hasPaid = new bool[](ms.length);
        for (uint256 i = 0; i < ms.length; i++) {
            member[i] = ms[i];
            share[i] = shareOf[rulebookHash][ms[i]];
            hasPaid[i] = paid[rulebookHash][ms[i]];
        }
    }

    // ---- clearing (task-ccp-clearing, wp-adr-ccp-clearing) ----

    function _requireMembers(bytes32 rulebookHash, address seller, address buyer) private view {
        if (rulebooks[rulebookHash].state != RulebookState.Effective) revert NotEffective();
        if (!paid[rulebookHash][seller]) revert MemberNotPaid(seller);
        if (!paid[rulebookHash][buyer]) revert MemberNotPaid(buyer);
    }

    /// @notice The seller submits its affirmed repo to the CCP with the hash of the CcpNovation. A refused repo may be
    /// submitted again.
    function submitClearing(bytes32 repoId, address ccp, bytes32 novationHash) external {
        ClearedRepo storage c = clearings[repoId];
        if (c.state != ClearingState.None && c.state != ClearingState.Refused) revert WrongClearingState(c.state);
        IRepoSettlement.Repo memory r = repoSettlement.getRepo(repoId);
        if (r.state != REPO_AFFIRMED) revert RepoNotAffirmed();
        if (msg.sender != r.seller) revert NotTheSeller();
        if (novationHash == bytes32(0)) revert HashMismatch();
        bytes32 rb = rulebookOf[ccp];
        _requireMembers(rb, r.seller, r.buyer);
        bool first = c.state == ClearingState.None;
        clearings[repoId] = ClearedRepo({
            ccp: ccp,
            rulebookHash: rb,
            seller: r.seller,
            buyer: r.buyer,
            security: r.security,
            quantity: r.quantity,
            cash: r.cash,
            purchasePrice: r.purchasePrice,
            repurchasePrice: r.repurchasePrice,
            novationHash: novationHash,
            state: ClearingState.Submitted,
            reasonHash: bytes32(0),
            sellerLegHash: bytes32(0),
            buyerLegHash: bytes32(0)
        });
        if (first) {
            clearingsOf[r.seller].push(repoId);
            clearingsOf[r.buyer].push(repoId);
            clearingsOf[ccp].push(repoId);
        }
        emit ClearingSubmitted(repoId, ccp, r.seller, novationHash);
    }

    /// @notice The buyer affirms the seller's submission with the same CcpNovation hash.
    function affirmClearing(bytes32 repoId, bytes32 novationHash) external {
        ClearedRepo storage c = clearings[repoId];
        if (c.state != ClearingState.Submitted) revert WrongClearingState(c.state);
        if (msg.sender != c.buyer) revert NotTheBuyer();
        if (novationHash != c.novationHash) revert HashMismatch();
        c.state = ClearingState.Affirmed;
        emit ClearingAffirmed(repoId, msg.sender, novationHash);
    }

    /// @notice The CCP accepts an affirmed submission: RepoSettlement closes the bilateral repo as Novated and both
    /// members clear one more repo.
    function acceptClearing(bytes32 repoId) external {
        ClearedRepo storage c = clearings[repoId];
        if (c.state != ClearingState.Affirmed) revert WrongClearingState(c.state);
        if (msg.sender != c.ccp) revert NotTheCcp();
        _requireMembers(c.rulebookHash, c.seller, c.buyer);
        c.state = ClearingState.Cleared;
        clearedCount[c.rulebookHash][c.seller] += 1;
        clearedCount[c.rulebookHash][c.buyer] += 1;
        repoSettlement.novate(repoId, c.novationHash);
        emit ClearingAccepted(repoId, msg.sender, c.novationHash);
    }

    /// @notice The CCP refuses a submission with the hash of its reason; the repo stays bilateral.
    function refuseClearing(bytes32 repoId, bytes32 reasonHash) external {
        ClearedRepo storage c = clearings[repoId];
        if (c.state != ClearingState.Submitted && c.state != ClearingState.Affirmed) revert WrongClearingState(c.state);
        if (msg.sender != c.ccp) revert NotTheCcp();
        c.state = ClearingState.Refused;
        c.reasonHash = reasonHash;
        emit ClearingRefused(repoId, msg.sender, reasonHash);
    }

    /// @notice A member instructs the settlement of its own leg: the purchase once cleared, the repurchase once purchased.
    /// The second member's instruction moves the securities and the cash between the members in one transaction.
    function instructCleared(bytes32 repoId, bytes32 legHash) external {
        ClearedRepo storage c = clearings[repoId];
        if (c.state != ClearingState.Cleared && c.state != ClearingState.Purchased) revert WrongClearingState(c.state);
        if (legHash == bytes32(0)) revert HashMismatch();
        if (msg.sender == c.seller) {
            if (c.sellerLegHash != bytes32(0)) revert AlreadyInstructed();
            c.sellerLegHash = legHash;
        } else if (msg.sender == c.buyer) {
            if (c.buyerLegHash != bytes32(0)) revert AlreadyInstructed();
            c.buyerLegHash = legHash;
        } else {
            revert NotAMember();
        }
        emit ClearedLegInstructed(repoId, msg.sender, uint8(c.state), legHash);
        if (c.sellerLegHash == bytes32(0) || c.buyerLegHash == bytes32(0)) return;

        bytes32 s = c.sellerLegHash;
        bytes32 b = c.buyerLegHash;
        c.sellerLegHash = bytes32(0);
        c.buyerLegHash = bytes32(0);
        if (c.state == ClearingState.Cleared) {
            c.state = ClearingState.Purchased;
            IERC20(c.security).safeTransferFrom(c.seller, c.buyer, c.quantity);
            IERC20(c.cash).safeTransferFrom(c.buyer, c.seller, c.purchasePrice);
        } else {
            c.state = ClearingState.Repurchased;
            clearedCount[c.rulebookHash][c.seller] -= 1;
            clearedCount[c.rulebookHash][c.buyer] -= 1;
            IERC20(c.security).safeTransferFrom(c.buyer, c.seller, c.quantity);
            IERC20(c.cash).safeTransferFrom(c.seller, c.buyer, c.repurchasePrice);
        }
        emit ClearedRepoSettled(repoId, uint8(c.state), s, b);
    }

    function clearing(bytes32 repoId) external view returns (ClearedRepo memory) {
        return clearings[repoId];
    }

    /// @notice The repos a party has submitted, been submitted or been asked to clear, in order.
    function clearingsOfParty(address party) external view returns (bytes32[] memory) {
        return clearingsOf[party];
    }

    // ---- margin (task-ccp-margin, wp-adr-ccp-margin) ----

    enum RoundState {
        None,
        Issued,
        Settled,
        Cancelled
    }

    struct MarginRound {
        address ccp;
        bytes32 rulebookHash;
        uint64 businessDate;
        RoundState state;
        uint32 unpaid;
    }

    /// One member's part of a round: its variation margin over its repos and its initial margin change, both positive
    /// when the member pays, and the hash of its CcpMarginStatement.
    struct MemberMargin {
        int256 vm;
        int256 im;
        bytes32 statementHash;
        bool inRound;
        bool paid;
    }

    mapping(bytes32 => MarginRound) private rounds;
    mapping(bytes32 => address[]) private roundMemberList;
    mapping(bytes32 => mapping(address => MemberMargin)) private roundMember;
    mapping(bytes32 => bytes32[]) private roundRepoList;
    mapping(bytes32 => mapping(bytes32 => int256)) private roundRepoVm;
    mapping(bytes32 => mapping(bytes32 => bool)) private roundRepoSeen;
    mapping(address => bytes32[]) private roundsOfCcp;
    /// The CCP's round that is issued and not settled, or zero.
    mapping(address => bytes32) public openRound;
    /// The initial margin a member has posted with the CCP.
    mapping(bytes32 => mapping(address => uint256)) public imHeld;
    /// The variation margin paid on a cleared repo, from the seller's side: positive when the seller has paid the buyer.
    mapping(bytes32 => int256) public vmBalance;

    event MarginRoundIssued(bytes32 indexed roundId, address indexed ccp, uint64 businessDate);
    event MarginStatementIssued(bytes32 indexed roundId, address indexed member, bytes32 statementHash, int256 vm, int256 im);
    event MarginPaid(bytes32 indexed roundId, address indexed member, uint256 amount);
    event MarginRoundSettled(bytes32 indexed roundId, address indexed ccp);
    event MarginRoundCancelled(bytes32 indexed roundId, address indexed ccp);

    /// @notice The CCP issues a margin round for a business date (yyyymmdd), identified by the CCP, the date and the
    /// number of rounds it issued before: each repo's variation margin change from
    /// the seller's side, and each member's initial margin change and statement hash. A repurchased repo's change must
    /// return its whole balance. A round in which nobody pays settles at once.
    function issueMargin(
        uint64 businessDate,
        bytes32[] calldata repoIds,
        int256[] calldata repoVm,
        address[] calldata ms,
        int256[] calldata im,
        bytes32[] calldata statementHashes
    ) external returns (bytes32 roundId) {
        bytes32 rb = rulebookOf[msg.sender];
        if (rulebooks[rb].state != RulebookState.Effective) revert NotEffective();
        if (openRound[msg.sender] != bytes32(0)) revert RoundOpen();
        if (ms.length == 0 || repoIds.length != repoVm.length || ms.length != im.length || ms.length != statementHashes.length) revert BadRound();
        roundId = keccak256(abi.encode(msg.sender, businessDate, roundsOfCcp[msg.sender].length));
        for (uint256 i = 0; i < ms.length; i++) {
            address m = ms[i];
            if (!paid[rb][m] || roundMember[roundId][m].inRound || statementHashes[i] == bytes32(0)) revert BadRound();
            if (im[i] < 0 && uint256(-im[i]) > imHeld[rb][m]) revert BadRound();
            roundMember[roundId][m] = MemberMargin({vm: 0, im: im[i], statementHash: statementHashes[i], inRound: true, paid: false});
            roundMemberList[roundId].push(m);
        }
        for (uint256 j = 0; j < repoIds.length; j++) {
            bytes32 id = repoIds[j];
            ClearedRepo storage c = clearings[id];
            if (c.ccp != msg.sender || roundRepoSeen[roundId][id]) revert BadRound();
            if (c.state == ClearingState.Repurchased) {
                if (repoVm[j] != -vmBalance[id]) revert BadRound();
            } else if (c.state != ClearingState.Purchased) {
                revert BadRound();
            }
            MemberMargin storage s = roundMember[roundId][c.seller];
            MemberMargin storage b = roundMember[roundId][c.buyer];
            if (!s.inRound || !b.inRound) revert BadRound();
            s.vm += repoVm[j];
            b.vm -= repoVm[j];
            roundRepoSeen[roundId][id] = true;
            roundRepoVm[roundId][id] = repoVm[j];
            roundRepoList[roundId].push(id);
        }
        uint32 unpaid = 0;
        for (uint256 i = 0; i < ms.length; i++) {
            MemberMargin storage m = roundMember[roundId][ms[i]];
            if (m.vm + m.im > 0) unpaid++;
            emit MarginStatementIssued(roundId, ms[i], m.statementHash, m.vm, m.im);
        }
        rounds[roundId] = MarginRound({ccp: msg.sender, rulebookHash: rb, businessDate: businessDate, state: RoundState.Issued, unpaid: unpaid});
        openRound[msg.sender] = roundId;
        roundsOfCcp[msg.sender].push(roundId);
        emit MarginRoundIssued(roundId, msg.sender, businessDate);
        if (unpaid == 0) _settleRound(roundId);
    }

    /// @notice A member that owes on a round pays its net; the last payment settles the round.
    function payMargin(bytes32 roundId) external {
        MarginRound storage r = rounds[roundId];
        if (r.state != RoundState.Issued) revert WrongRoundState();
        MemberMargin storage m = roundMember[roundId][msg.sender];
        int256 net = m.vm + m.im;
        if (!m.inRound || net <= 0 || m.paid) revert NothingToPay();
        m.paid = true;
        r.unpaid -= 1;
        IERC20(rulebooks[r.rulebookHash].token).safeTransferFrom(msg.sender, address(this), uint256(net));
        emit MarginPaid(roundId, msg.sender, uint256(net));
        if (r.unpaid == 0) _settleRound(roundId);
    }

    function _settleRound(bytes32 roundId) private {
        MarginRound storage r = rounds[roundId];
        IERC20 token = IERC20(rulebooks[r.rulebookHash].token);
        address[] storage ms = roundMemberList[roundId];
        for (uint256 i = 0; i < ms.length; i++) {
            MemberMargin storage m = roundMember[roundId][ms[i]];
            if (m.im >= 0) imHeld[r.rulebookHash][ms[i]] += uint256(m.im);
            else imHeld[r.rulebookHash][ms[i]] -= uint256(-m.im);
            int256 net = m.vm + m.im;
            if (net < 0) token.safeTransfer(ms[i], uint256(-net));
        }
        bytes32[] storage ids = roundRepoList[roundId];
        for (uint256 j = 0; j < ids.length; j++) vmBalance[ids[j]] += roundRepoVm[roundId][ids[j]];
        r.state = RoundState.Settled;
        openRound[r.ccp] = bytes32(0);
        emit MarginRoundSettled(roundId, r.ccp);
    }

    /// @notice The CCP cancels an open round when a member in it is in default; the members that paid are refunded.
    function cancelMarginRound(bytes32 roundId) external {
        MarginRound storage r = rounds[roundId];
        if (r.state != RoundState.Issued) revert WrongRoundState();
        if (msg.sender != r.ccp) revert NotTheCcp();
        address[] storage ms = roundMemberList[roundId];
        bool inDefault = false;
        for (uint256 i = 0; i < ms.length; i++) if (oracle.isDefaulted(ms[i])) inDefault = true;
        if (!inDefault) revert NotInDefault();
        IERC20 token = IERC20(rulebooks[r.rulebookHash].token);
        for (uint256 i = 0; i < ms.length; i++) {
            MemberMargin storage m = roundMember[roundId][ms[i]];
            if (m.paid) token.safeTransfer(ms[i], uint256(m.vm + m.im));
        }
        r.state = RoundState.Cancelled;
        openRound[r.ccp] = bytes32(0);
        emit MarginRoundCancelled(roundId, r.ccp);
    }

    function marginRound(bytes32 roundId) external view returns (MarginRound memory) {
        return rounds[roundId];
    }

    function roundMembers(bytes32 roundId)
        external
        view
        returns (address[] memory member, int256[] memory vm, int256[] memory im, bytes32[] memory statementHash, bool[] memory hasPaid)
    {
        address[] storage ms = roundMemberList[roundId];
        member = new address[](ms.length);
        vm = new int256[](ms.length);
        im = new int256[](ms.length);
        statementHash = new bytes32[](ms.length);
        hasPaid = new bool[](ms.length);
        for (uint256 i = 0; i < ms.length; i++) {
            MemberMargin storage m = roundMember[roundId][ms[i]];
            member[i] = ms[i];
            vm[i] = m.vm;
            im[i] = m.im;
            statementHash[i] = m.statementHash;
            hasPaid[i] = m.paid;
        }
    }

    function roundRepos(bytes32 roundId) external view returns (bytes32[] memory repoId, int256[] memory vm) {
        bytes32[] storage ids = roundRepoList[roundId];
        repoId = new bytes32[](ids.length);
        vm = new int256[](ids.length);
        for (uint256 j = 0; j < ids.length; j++) {
            repoId[j] = ids[j];
            vm[j] = roundRepoVm[roundId][ids[j]];
        }
    }

    function marginRoundsOf(address ccp) external view returns (bytes32[] memory) {
        return roundsOfCcp[ccp];
    }

    // ---- default (task-ccp-default, wp-adr-ccp-default) ----

    /// A member's default: the loss on its cleared repos (negative when the survivors owe more than they are owed), what
    /// each layer of the waterfall covered, what was returned to the defaulter and what the survivors still owe.
    struct DefaultRecord {
        address ccp;
        bytes32 rulebookHash;
        address defaulter;
        int256 loss;
        uint256 fromInitialMargin;
        uint256 fromDefaulterFund;
        uint256 fromCapital;
        uint256 fromMembersFund;
        uint256 returned;
        uint256 dueOutstanding;
    }

    mapping(bytes32 => DefaultRecord) private defaults;
    mapping(bytes32 => bytes32[]) private defaultRepoList;
    mapping(bytes32 => mapping(address => uint256)) public defaultDue;
    mapping(address => bytes32[]) private defaultsOfCcp;

    event MemberDefaulted(bytes32 indexed closeOutHash, address indexed ccp, address indexed defaulter, int256 loss);
    event WaterfallApplied(bytes32 indexed closeOutHash, uint256 fromInitialMargin, uint256 fromDefaulterFund, uint256 fromCapital, uint256 fromMembersFund, uint256 returned);
    event DefaultDuePaid(bytes32 indexed closeOutHash, address indexed member, uint256 amount);

    /// @notice The CCP closes out every cleared repo of a member the oracle records in default, with the residual of
    /// each from the seller's side, and covers the loss by the waterfall.
    function closeOutDefault(address defaulter, bytes32 closeOutHash, bytes32[] calldata repoIds, int256[] calldata residuals) external {
        bytes32 rb = rulebookOf[msg.sender];
        if (rb == bytes32(0)) revert UnknownRulebook();
        if (!oracle.isDefaulted(defaulter)) revert NotInDefault();
        if (!paid[rb][defaulter]) revert NotPaid();
        if (openRound[msg.sender] != bytes32(0)) revert RoundOpen();
        if (closeOutHash == bytes32(0) || defaults[closeOutHash].ccp != address(0) || repoIds.length != residuals.length) revert BadCloseOut();
        DefaultRecord storage d = defaults[closeOutHash];
        d.ccp = msg.sender;
        d.rulebookHash = rb;
        d.defaulter = defaulter;
        address[] memory survivor = new address[](repoIds.length);
        int256[] memory owed = new int256[](repoIds.length);
        int256 loss = 0;
        for (uint256 i = 0; i < repoIds.length; i++) {
            ClearedRepo storage c = clearings[repoIds[i]];
            if (c.ccp != msg.sender || (c.seller != defaulter && c.buyer != defaulter)) revert BadCloseOut();
            if (c.state == ClearingState.Cleared) {
                if (residuals[i] != 0) revert BadCloseOut();
            } else if (c.state != ClearingState.Purchased) {
                revert BadCloseOut();
            }
            c.state = ClearingState.ClosedOut;
            c.sellerLegHash = bytes32(0);
            c.buyerLegHash = bytes32(0);
            clearedCount[rb][c.seller] -= 1;
            clearedCount[rb][c.buyer] -= 1;
            survivor[i] = c.seller == defaulter ? c.buyer : c.seller;
            owed[i] = survivor[i] == c.buyer ? residuals[i] : -residuals[i];
            loss += owed[i];
            defaultRepoList[closeOutHash].push(repoIds[i]);
        }
        if (clearedCount[rb][defaulter] != 0) revert BadCloseOut();
        d.loss = loss;
        _waterfall(d, loss > 0 ? uint256(loss) : 0);
        uint256 returned = imHeld[rb][defaulter] - d.fromInitialMargin + contributed[rb][defaulter] - d.fromDefaulterFund;
        if (loss < 0) returned += uint256(-loss);
        rulebooks[rb].fund -= contributed[rb][defaulter];
        imHeld[rb][defaulter] = 0;
        contributed[rb][defaulter] = 0;
        paid[rb][defaulter] = false;
        d.returned = returned;
        IERC20 token = IERC20(rulebooks[rb].token);
        for (uint256 i = 0; i < repoIds.length; i++) {
            if (owed[i] > 0) {
                token.safeTransfer(survivor[i], uint256(owed[i]));
            } else if (owed[i] < 0) {
                defaultDue[closeOutHash][survivor[i]] += uint256(-owed[i]);
                d.dueOutstanding += uint256(-owed[i]);
            }
        }
        if (returned > 0) token.safeTransfer(defaulter, returned);
        defaultsOfCcp[msg.sender].push(closeOutHash);
        emit MemberDefaulted(closeOutHash, msg.sender, defaulter, loss);
        emit WaterfallApplied(closeOutHash, d.fromInitialMargin, d.fromDefaulterFund, d.fromCapital, d.fromMembersFund, returned);
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    /// The loss covered layer by layer; the other members' contributions in proportion, the remainder on the last.
    function _waterfall(DefaultRecord storage d, uint256 remaining) private {
        bytes32 rb = d.rulebookHash;
        d.fromInitialMargin = _min(remaining, imHeld[rb][d.defaulter]);
        remaining -= d.fromInitialMargin;
        d.fromDefaulterFund = _min(remaining, contributed[rb][d.defaulter]);
        remaining -= d.fromDefaulterFund;
        Rulebook storage r = rulebooks[rb];
        d.fromCapital = _min(remaining, r.capital);
        r.capital -= d.fromCapital;
        remaining -= d.fromCapital;
        if (remaining == 0) return;
        address[] storage ms = memberList[rb];
        uint256 total = 0;
        uint256 last = ms.length;
        for (uint256 i = 0; i < ms.length; i++) {
            if (ms[i] == d.defaulter || contributed[rb][ms[i]] == 0) continue;
            total += contributed[rb][ms[i]];
            last = i;
        }
        if (total < remaining) revert LossExceedsResources();
        uint256 left = remaining;
        for (uint256 i = 0; i < ms.length; i++) {
            if (ms[i] == d.defaulter || contributed[rb][ms[i]] == 0) continue;
            uint256 take = i == last ? left : (remaining * contributed[rb][ms[i]]) / total;
            contributed[rb][ms[i]] -= take;
            r.fund -= take;
            left -= take;
        }
        d.fromMembersFund = remaining;
    }

    /// @notice A surviving member pays what it owes on a close-out.
    function payDefaultDue(bytes32 closeOutHash) external {
        uint256 due = defaultDue[closeOutHash][msg.sender];
        if (due == 0) revert NothingDue();
        DefaultRecord storage d = defaults[closeOutHash];
        defaultDue[closeOutHash][msg.sender] = 0;
        d.dueOutstanding -= due;
        IERC20(rulebooks[d.rulebookHash].token).safeTransferFrom(msg.sender, address(this), due);
        emit DefaultDuePaid(closeOutHash, msg.sender, due);
    }

    function defaultRecord(bytes32 closeOutHash) external view returns (DefaultRecord memory record, bytes32[] memory repoIds) {
        return (defaults[closeOutHash], defaultRepoList[closeOutHash]);
    }

    function defaultsOf(address ccp) external view returns (bytes32[] memory) {
        return defaultsOfCcp[ccp];
    }

    // ---- porting (task-ccp-porting, wp-adr-ccp-porting) ----

    enum PortingState {
        None,
        Requested,
        Accepted,
        Executed,
        Refused
    }

    /// A request to move one leg of a cleared repo from a member to another; payment is what the receiving member pays
    /// the leaving member (negative when the leaving member pays).
    struct Porting {
        address from;
        address to;
        bytes32 portingHash;
        int256 payment;
        PortingState state;
    }

    mapping(bytes32 => Porting) private portings;
    mapping(bytes32 => mapping(address => bool)) private listedFor;

    event MemberAdmitted(bytes32 indexed rulebookHash, address indexed member, uint256 share, bytes32 admissionHash);
    event PortingRequested(bytes32 indexed repoId, address indexed from, address indexed to, bytes32 portingHash, int256 payment);
    event PortingAccepted(bytes32 indexed repoId, address indexed to, bytes32 portingHash);
    event PortingExecuted(bytes32 indexed repoId, address indexed from, address indexed to, bytes32 portingHash);
    event PortingRefused(bytes32 indexed repoId, address indexed by, bytes32 portingHash);

    /// @notice The CCP admits a member to its rulebook in effect, with the hash of the cdm-ext CcpAdmission and the
    /// member's share, which the member pays by joining.
    function admitMember(address member, uint256 share, bytes32 admissionHash) external {
        bytes32 rb = rulebookOf[msg.sender];
        if (rulebooks[rb].state != RulebookState.Effective) revert NotEffective();
        if (member == address(0) || member == msg.sender || share == 0 || shareOf[rb][member] != 0 || admissionHash == bytes32(0)) revert BadRulebook();
        shareOf[rb][member] = share;
        memberList[rb].push(member);
        admissionOf[rb][member] = admissionHash;
        emit MemberAdmitted(rb, member, share, admissionHash);
    }

    /// @notice A member requests that its leg of a purchased cleared repo move to another paid member. A repo is ported
    /// once; a refused request may be made again.
    function requestPorting(bytes32 repoId, address to, bytes32 portingHash, int256 payment) external {
        ClearedRepo storage c = clearings[repoId];
        if (c.state != ClearingState.Purchased) revert WrongClearingState(c.state);
        if (msg.sender != c.seller && msg.sender != c.buyer) revert NotAMember();
        if (c.sellerLegHash != bytes32(0) || c.buyerLegHash != bytes32(0)) revert AlreadyInstructed();
        PortingState ps = portings[repoId].state;
        if (ps == PortingState.Requested || ps == PortingState.Accepted || ps == PortingState.Executed) revert PortingPending();
        if (!paid[c.rulebookHash][to] || to == c.seller || to == c.buyer || to == c.ccp || portingHash == bytes32(0)) revert BadPorting();
        portings[repoId] = Porting({from: msg.sender, to: to, portingHash: portingHash, payment: payment, state: PortingState.Requested});
        if (!listedFor[repoId][to]) {
            listedFor[repoId][to] = true;
            clearingsOf[to].push(repoId);
        }
        emit PortingRequested(repoId, msg.sender, to, portingHash, payment);
    }

    /// @notice The receiving member accepts the request with the same CcpPorting hash.
    function acceptPorting(bytes32 repoId, bytes32 portingHash) external {
        Porting storage p = portings[repoId];
        if (p.state != PortingState.Requested) revert WrongPortingState();
        if (msg.sender != p.to) revert NotAMember();
        if (portingHash != p.portingHash) revert HashMismatch();
        p.state = PortingState.Accepted;
        emit PortingAccepted(repoId, msg.sender, portingHash);
    }

    /// @notice The CCP approves an accepted request: the payment moves between the members, a leaving buyer's
    /// securities move to the receiving member, and the receiving member becomes the leg's party.
    function approvePorting(bytes32 repoId) external {
        ClearedRepo storage c = clearings[repoId];
        Porting storage p = portings[repoId];
        if (msg.sender != c.ccp) revert NotTheCcp();
        if (p.state != PortingState.Accepted) revert WrongPortingState();
        if (c.state != ClearingState.Purchased) revert WrongClearingState(c.state);
        if (!paid[c.rulebookHash][p.to]) revert MemberNotPaid(p.to);
        if (c.sellerLegHash != bytes32(0) || c.buyerLegHash != bytes32(0)) revert AlreadyInstructed();
        bool fromSeller = p.from == c.seller;
        if (p.payment > 0) IERC20(c.cash).safeTransferFrom(p.to, p.from, uint256(p.payment));
        else if (p.payment < 0) IERC20(c.cash).safeTransferFrom(p.from, p.to, uint256(-p.payment));
        if (fromSeller) {
            c.seller = p.to;
        } else {
            IERC20(c.security).safeTransferFrom(p.from, p.to, c.quantity);
            c.buyer = p.to;
        }
        clearedCount[c.rulebookHash][p.from] -= 1;
        clearedCount[c.rulebookHash][p.to] += 1;
        p.state = PortingState.Executed;
        emit PortingExecuted(repoId, p.from, p.to, p.portingHash);
    }

    /// @notice The CCP or the receiving member refuses a pending request; nothing moves.
    function refusePorting(bytes32 repoId) external {
        ClearedRepo storage c = clearings[repoId];
        Porting storage p = portings[repoId];
        if (p.state != PortingState.Requested && p.state != PortingState.Accepted) revert WrongPortingState();
        if (msg.sender != c.ccp && msg.sender != p.to) revert NotAMember();
        p.state = PortingState.Refused;
        emit PortingRefused(repoId, msg.sender, p.portingHash);
    }

    function porting(bytes32 repoId) external view returns (Porting memory) {
        return portings[repoId];
    }
}
