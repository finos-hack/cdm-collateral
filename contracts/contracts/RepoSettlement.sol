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
/// contract keeps CollateralControl under the EIP-170 size limit. A purchased repo can be repriced (wp-adr-repo-reprice):
/// the cash moves and the stored prices and trade hash change in one transaction; the securities do not move. A purchased
/// repo can be adjusted (wp-adr-repo-adjustment): the securities difference and the accrued cash move and the stored
/// quantity, Repurchase Price and trade hash change in one transaction. The seller can substitute the securities of a
/// purchased repo with the buyer's agreement (wp-adr-repo-substitution): both securities move and the stored security,
/// quantity and trade hash change in one transaction; no cash moves.
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
        Repurchase,
        Reprice,
        Adjustment,
        Substitution
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
    /// @dev The hash of the pending reprice's, adjustment's or substitution's CDM hash and amounts, which the agreeing party
    /// must state identically. A repo has at most one of the three pending.
    mapping(bytes32 => bytes32) private _replacementTerms;

    event RepoBooked(bytes32 indexed repoId, address indexed seller, address indexed buyer, bytes32 tradeHash);
    event RepoAffirmed(bytes32 indexed repoId, address indexed buyer, bytes32 tradeHash);
    event RepoInstructed(bytes32 indexed repoId, Phase phase, address indexed party, bytes32 cdmHash);
    event RepoSettled(bytes32 indexed repoId, Phase phase, bytes32 cdmHash);
    event RepoSubstitutionRefused(bytes32 indexed repoId, bytes32 cdmHash);

    error RepoExists(bytes32 repoId);
    error NoRepo(bytes32 repoId);
    error SelfCounterparty();
    error ZeroAmount();
    error WrongState(RepoState state);
    error NotTheBuyer();
    error NotAParty();
    error HashMismatch(bytes32 expected, bytes32 given);
    error AlreadyInstructed();
    error NotAnInstructPhase();
    error ReplacementPending();
    error RepurchaseInstructed();
    error NotTheSeller();
    error SameSecurity();
    error NoSubstitution();

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
        if (phase != Phase.Purchase && phase != Phase.Repurchase) revert NotAnInstructPhase();
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
            delete _instructions[repoId][Phase.Reprice];
            delete _instructions[repoId][Phase.Adjustment];
            delete _instructions[repoId][Phase.Substitution];
            delete _replacementTerms[repoId];
            IERC20(r.security).safeTransferFrom(r.buyer, r.seller, r.quantity);
            IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, r.repurchasePrice);
        }
        emit RepoSettled(repoId, phase, cdmHash);
    }

    /// @notice A party instructs a reprice of a purchased repo (wp-adr-repo-reprice) with the hash of the CDM reprice
    /// event, which becomes the trade hash, the new prices and the cash that settles it (positive: the seller pays the
    /// buyer; negative: the buyer pays the seller). The other party's instruction must state the same; it moves the cash
    /// and updates the repo. A party may replace its own instruction until the other has instructed. The contract checks
    /// no amounts against the market: each service builds the event from the feed price and its business date.
    function instructReprice(
        bytes32 repoId,
        bytes32 cdmHash,
        uint256 newPurchasePrice,
        uint256 newRepurchasePrice,
        int256 cashFromSeller
    ) external {
        if (newPurchasePrice == 0 || newRepurchasePrice < newPurchasePrice) revert ZeroAmount();
        bytes32 terms = keccak256(abi.encode(cdmHash, newPurchasePrice, newRepurchasePrice, cashFromSeller));
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Reprice, cdmHash, terms);
        if (!settles) return;
        r.purchasePrice = newPurchasePrice;
        r.repurchasePrice = newRepurchasePrice;
        if (cashFromSeller > 0) IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, uint256(cashFromSeller));
        else if (cashFromSeller < 0) IERC20(r.cash).safeTransferFrom(r.buyer, r.seller, uint256(-cashFromSeller));
        emit RepoSettled(repoId, Phase.Reprice, cdmHash);
    }

    /// @notice A party instructs an adjustment of a purchased repo (wp-adr-repo-adjustment) with the hash of the CDM
    /// adjustment event, which becomes the trade hash, the new quantity and Repurchase Price, and the accrued Price
    /// Differential the seller pays the buyer. The other party's instruction must state the same; it moves the securities
    /// difference (from the seller when the quantity rises, from the buyer when it falls) and the cash, and updates the
    /// repo. A party may replace its own instruction until the other has instructed.
    function instructAdjustment(
        bytes32 repoId,
        bytes32 cdmHash,
        uint256 newQuantity,
        uint256 newRepurchasePrice,
        uint256 accruedFromSeller
    ) external {
        if (newQuantity == 0) revert ZeroAmount();
        bytes32 terms = keccak256(abi.encode(cdmHash, newQuantity, newRepurchasePrice, accruedFromSeller));
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Adjustment, cdmHash, terms);
        if (newRepurchasePrice < r.purchasePrice) revert ZeroAmount();
        if (!settles) return;
        uint256 oldQuantity = r.quantity;
        r.quantity = newQuantity;
        r.repurchasePrice = newRepurchasePrice;
        if (newQuantity > oldQuantity) IERC20(r.security).safeTransferFrom(r.seller, r.buyer, newQuantity - oldQuantity);
        else if (newQuantity < oldQuantity) IERC20(r.security).safeTransferFrom(r.buyer, r.seller, oldQuantity - newQuantity);
        if (accruedFromSeller > 0) IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, accruedFromSeller);
        emit RepoSettled(repoId, Phase.Adjustment, cdmHash);
    }

    /// @notice The seller requests a substitution of all the securities of a purchased repo (wp-adr-repo-substitution) with
    /// the hash of the CDM event, which becomes the trade hash, the substitute security and its quantity. The buyer's
    /// matching instruction is the agreement: it returns the current securities to the seller, delivers the substitute to
    /// the buyer and updates the repo. The seller may replace its request until the buyer has answered.
    function instructSubstitution(bytes32 repoId, bytes32 cdmHash, address newSecurity, uint256 newQuantity) external {
        if (newQuantity == 0 || newSecurity == address(0)) revert ZeroAmount();
        Repo storage p = _load(repoId);
        if (newSecurity == p.security) revert SameSecurity();
        if (msg.sender == p.buyer && _instructions[repoId][Phase.Substitution].seller == bytes32(0)) revert NotTheSeller();
        bytes32 terms = keccak256(abi.encode(cdmHash, newSecurity, newQuantity));
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Substitution, cdmHash, terms);
        if (!settles) return;
        address oldSecurity = r.security;
        uint256 oldQuantity = r.quantity;
        r.security = newSecurity;
        r.quantity = newQuantity;
        IERC20(oldSecurity).safeTransferFrom(r.buyer, r.seller, oldQuantity);
        IERC20(newSecurity).safeTransferFrom(r.seller, r.buyer, newQuantity);
        emit RepoSettled(repoId, Phase.Substitution, cdmHash);
    }

    /// @notice The buyer refuses the seller's pending substitution, which clears it.
    function refuseSubstitution(bytes32 repoId) external {
        Repo storage r = _load(repoId);
        if (msg.sender != r.buyer) revert NotTheBuyer();
        bytes32 requested = _instructions[repoId][Phase.Substitution].seller;
        if (requested == bytes32(0)) revert NoSubstitution();
        delete _instructions[repoId][Phase.Substitution];
        delete _replacementTerms[repoId];
        emit RepoSubstitutionRefused(repoId, requested);
    }

    /// @dev Records a party's reprice, adjustment or substitution instruction. When it is the second, it checks the two match, clears
    /// them, sets the trade hash and returns settles = true for the caller to move the assets.
    function _instructReplacement(bytes32 repoId, Phase phase, bytes32 cdmHash, bytes32 terms)
        private
        returns (Repo storage r, bool settles)
    {
        r = _load(repoId);
        if (r.state != RepoState.Purchased) revert WrongState(r.state);
        Instructions storage repurchase = _instructions[repoId][Phase.Repurchase];
        if (repurchase.seller != bytes32(0) || repurchase.buyer != bytes32(0)) revert RepurchaseInstructed();
        for (uint8 p = uint8(Phase.Reprice); p <= uint8(Phase.Substitution); p++) {
            if (Phase(p) == phase) continue;
            Instructions storage rival = _instructions[repoId][Phase(p)];
            if (rival.seller != bytes32(0) || rival.buyer != bytes32(0)) revert ReplacementPending();
        }
        Instructions storage ins = _instructions[repoId][phase];
        bool isSeller = msg.sender == r.seller;
        if (!isSeller && msg.sender != r.buyer) revert NotAParty();
        bytes32 other = isSeller ? ins.buyer : ins.seller;
        if (other != bytes32(0)) {
            if (other != cdmHash) revert HashMismatch(other, cdmHash);
            if (terms != _replacementTerms[repoId]) revert HashMismatch(_replacementTerms[repoId], terms);
        } else {
            _replacementTerms[repoId] = terms;
        }
        if (isSeller) ins.seller = cdmHash;
        else ins.buyer = cdmHash;
        emit RepoInstructed(repoId, phase, msg.sender, cdmHash);
        if (other == bytes32(0)) return (r, false);
        delete _instructions[repoId][phase];
        delete _replacementTerms[repoId];
        r.tradeHash = cdmHash;
        return (r, true);
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
