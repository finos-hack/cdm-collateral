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

    enum ClearingState {
        None,
        Submitted,
        Affirmed,
        Cleared,
        Refused,
        Purchased,
        Repurchased
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

    constructor(address repoSettlement_) {
        repoSettlement = IRepoSettlement(repoSettlement_);
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
        r.fund += share;
        IERC20(r.token).safeTransferFrom(msg.sender, address(this), share);
        emit MemberJoined(rulebookHash, msg.sender, share);
        if (r.state == RulebookState.Published && allPaid(rulebookHash)) {
            r.state = RulebookState.Effective;
            r.effectiveAt = uint64(block.number);
            emit RulebookEffective(rulebookHash);
        }
    }

    /// @notice A paid member that clears no repo leaves and gets its share back.
    function leave(bytes32 rulebookHash) external {
        Rulebook storage r = rulebooks[rulebookHash];
        if (r.state == RulebookState.None) revert UnknownRulebook();
        if (!paid[rulebookHash][msg.sender]) revert NotPaid();
        if (clearedCount[rulebookHash][msg.sender] != 0) revert StillClearing();
        uint256 share = shareOf[rulebookHash][msg.sender];
        paid[rulebookHash][msg.sender] = false;
        r.fund -= share;
        IERC20(r.token).safeTransfer(msg.sender, share);
        emit MemberLeft(rulebookHash, msg.sender, share);
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
}
