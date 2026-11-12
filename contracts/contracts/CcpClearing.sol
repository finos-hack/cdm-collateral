// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CCP clearing: the CCP's rulebook, its capital and the default fund
/// @notice Membership (task-ccp-membership, wp-adr-ccp-membership). The rulebook is a CDM document (cdm-ext
/// CcpRulebook) held by the CCP's and the members' services; only its hash is here, with the members, their default
/// fund shares and the CCP's capital, which the rulebook states. The CCP publishes the rulebook and pays its capital in
/// one transaction. Each member affirms the rulebook's hash and pays its share in one transaction, and is a member once
/// paid; the rulebook is in effect once every member it names has paid, and stays in effect after that. A member that
/// clears no repo may leave and get its share back, and may rejoin by paying again. One rulebook per CCP; there is no
/// amendment.
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

    /// @notice The CCP publishes the rulebook's hash, its members and their shares, and pays its capital in `token`.
    function publishRulebook(bytes32 rulebookHash, address token, address[] calldata members, uint256[] calldata shares, uint256 capital)
        external
    {
        if (rulebookHash == bytes32(0) || token == address(0) || members.length == 0 || members.length != shares.length || capital == 0) {
            revert BadRulebook();
        }
        if (rulebookOf[msg.sender] != bytes32(0) || rulebooks[rulebookHash].state != RulebookState.None) revert RulebookExists();
        for (uint256 i = 0; i < members.length; i++) {
            address m = members[i];
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
}
