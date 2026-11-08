// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Repo settlement, delivery versus payment
/// @notice Settles the purchase and the repurchase of a term repo under the GMRA (task-repo-purchase-repurchase,
/// wp-adr-repo-purchase-repurchase). The trade is CDM's TradeState, held by both parties' services; only its hash is
/// here. The seller books it with the amounts the services computed from it, the buyer affirms it with the same hash.
/// For each of the purchase and the repurchase, each party approves this contract for its leg and instructs with the
/// hash of the CDM settlement document; the second instruction moves both legs in one transaction. The contract checks
/// no dates: each service instructs the repurchase on or after the Repurchase Date by its business date. A separate
/// contract keeps CollateralControl under the EIP-170 size limit.
contract RepoSettlement {
    using SafeERC20 for IERC20;

    enum RepoState {
        None,
        Booked,
        Affirmed,
        Purchased,
        Repurchased
    }

    enum Phase {
        Purchase,
        Repurchase
    }

    struct Repo {
        address seller;
        address buyer;
        address security;
        uint256 quantity;
        address cash;
        uint256 purchasePrice;
        uint256 repurchasePrice;
        bytes32 tradeHash;
        RepoState state;
        bytes32 purchaseHash;
        bytes32 repurchaseHash;
    }

    /// @dev Instruction hashes for the phase in progress, by party; cleared when the phase settles.
    struct Instructions {
        bytes32 seller;
        bytes32 buyer;
    }

    mapping(bytes32 => Repo) private _repos;
    mapping(bytes32 => mapping(Phase => Instructions)) private _instructions;
    mapping(address => bytes32[]) private _reposOf;

    event RepoBooked(bytes32 indexed repoId, address indexed seller, address indexed buyer, bytes32 tradeHash);
    event RepoAffirmed(bytes32 indexed repoId, address indexed buyer, bytes32 tradeHash);
    event RepoInstructed(bytes32 indexed repoId, Phase phase, address indexed party, bytes32 cdmHash);
    event RepoSettled(bytes32 indexed repoId, Phase phase, bytes32 cdmHash);

    error RepoExists(bytes32 repoId);
    error NoRepo(bytes32 repoId);
    error SelfCounterparty();
    error ZeroAmount();
    error WrongState(RepoState state);
    error NotTheBuyer();
    error NotAParty();
    error HashMismatch(bytes32 expected, bytes32 given);
    error AlreadyInstructed();

    /// @notice The seller books a repo with the buyer: the securities and quantity delivered at the purchase, the cash
    /// token, the Purchase Price and the Repurchase Price, and the hash of the CDM trade.
    function book(
        bytes32 repoId,
        address buyer,
        address security,
        uint256 quantity,
        address cash,
        uint256 purchasePrice,
        uint256 repurchasePrice,
        bytes32 tradeHash
    ) external {
        if (_repos[repoId].state != RepoState.None) revert RepoExists(repoId);
        if (buyer == msg.sender || buyer == address(0)) revert SelfCounterparty();
        if (quantity == 0 || purchasePrice == 0 || repurchasePrice < purchasePrice) revert ZeroAmount();
        _repos[repoId] = Repo(msg.sender, buyer, security, quantity, cash, purchasePrice, repurchasePrice, tradeHash,
            RepoState.Booked, bytes32(0), bytes32(0));
        _reposOf[msg.sender].push(repoId);
        _reposOf[buyer].push(repoId);
        emit RepoBooked(repoId, msg.sender, buyer, tradeHash);
    }

    /// @notice The buyer affirms the booked repo; the hash must be the booked trade hash.
    function affirm(bytes32 repoId, bytes32 tradeHash) external {
        Repo storage r = _load(repoId);
        if (r.state != RepoState.Booked) revert WrongState(r.state);
        if (msg.sender != r.buyer) revert NotTheBuyer();
        if (tradeHash != r.tradeHash) revert HashMismatch(r.tradeHash, tradeHash);
        r.state = RepoState.Affirmed;
        emit RepoAffirmed(repoId, msg.sender, tradeHash);
    }

    /// @notice A party instructs the purchase (after affirmation) or the repurchase (after the purchase) with the hash
    /// of the CDM settlement document. The second party's instruction must carry the same hash; it moves both legs.
    function instruct(bytes32 repoId, Phase phase, bytes32 cdmHash) external {
        Repo storage r = _load(repoId);
        RepoState expected = phase == Phase.Purchase ? RepoState.Affirmed : RepoState.Purchased;
        if (r.state != expected) revert WrongState(r.state);
        Instructions storage ins = _instructions[repoId][phase];
        bool isSeller = msg.sender == r.seller;
        if (!isSeller && msg.sender != r.buyer) revert NotAParty();
        if ((isSeller ? ins.seller : ins.buyer) != bytes32(0)) revert AlreadyInstructed();
        bytes32 other = isSeller ? ins.buyer : ins.seller;
        if (other != bytes32(0) && other != cdmHash) revert HashMismatch(other, cdmHash);
        if (isSeller) ins.seller = cdmHash;
        else ins.buyer = cdmHash;
        emit RepoInstructed(repoId, phase, msg.sender, cdmHash);
        if (other == bytes32(0)) return;

        delete _instructions[repoId][phase];
        if (phase == Phase.Purchase) {
            r.state = RepoState.Purchased;
            r.purchaseHash = cdmHash;
            IERC20(r.security).safeTransferFrom(r.seller, r.buyer, r.quantity);
            IERC20(r.cash).safeTransferFrom(r.buyer, r.seller, r.purchasePrice);
        } else {
            r.state = RepoState.Repurchased;
            r.repurchaseHash = cdmHash;
            IERC20(r.security).safeTransferFrom(r.buyer, r.seller, r.quantity);
            IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, r.repurchasePrice);
        }
        emit RepoSettled(repoId, phase, cdmHash);
    }

    function getRepo(bytes32 repoId) external view returns (Repo memory) {
        return _repos[repoId];
    }

    /// @notice The hashes each party has instructed for a phase that has not settled yet (zero: not instructed).
    function getInstructions(bytes32 repoId, Phase phase) external view returns (bytes32 seller, bytes32 buyer) {
        Instructions storage ins = _instructions[repoId][phase];
        return (ins.seller, ins.buyer);
    }

    function reposOf(address party) external view returns (bytes32[] memory) {
        return _reposOf[party];
    }

    function _load(bytes32 repoId) private view returns (Repo storage r) {
        r = _repos[repoId];
        if (r.state == RepoState.None) revert NoRepo(repoId);
    }
}
