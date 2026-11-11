// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice The default record of the oracle feed (OracleFeed).
interface IDefaultFeed {
    function isDefaulted(address party) external view returns (bool);
}

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
/// quantity and trade hash change in one transaction; no cash moves. Interim interest and manufactured income are paid in
/// the cash token by agreed phases (wp-adr-repo-income). Two offsetting purchased repos between the same parties pair off
/// on their common Repurchase Date (wp-adr-repo-pair-off): both are repurchased in one transaction, no securities move, and
/// only the difference of the two Repurchase Prices is paid. A buy/sell-back (wp-adr-repo-buy-sell-back) is booked as such
/// and settles like a repo, except that agreed income moves no cash and lowers its Sell Back Price instead, and it has no
/// interim interest. After the oracle feed records a party's default (wp-adr-repo-default-close-out, GMRA paragraph 10), the
/// non-defaulting party closes out every purchased repo of the pair in one transaction: no securities move, and one net
/// balance in the cash token is recorded, which the party that owes it then pays.
contract RepoSettlement {
    using SafeERC20 for IERC20;

    enum RepoState {
        None,
        Booked,
        Affirmed,
        Purchased,
        Repurchased,
        ClosedOut
    }

    enum Phase {
        Purchase,
        Repurchase,
        Reprice,
        Adjustment,
        Substitution,
        InterimInterest,
        Income,
        Roll,
        PairOff
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
    /// must state identically. A repo has at most one of these phases pending, including interim interest and income.
    mapping(bytes32 => bytes32) private _replacementTerms;
    /// @dev Manufactured income documents already paid on a repo, by hash.
    mapping(bytes32 => mapping(bytes32 => bool)) private _incomePaid;
    /// @dev The other repo of a repo's pending pair-off; zero when none is pending.
    mapping(bytes32 => bytes32) private _pairOffWith;
    /// @dev Whether a repo is a buy/sell-back (wp-adr-repo-buy-sell-back).
    mapping(bytes32 => bool) private _buySellBack;
    /// @dev A buy/sell-back's agreed income deductions in the current term: the Seller pays the Repurchase Price less this.
    mapping(bytes32 => uint256) private _incomeDeduction;

    /// @notice A GMRA default close-out (wp-adr-repo-default-close-out): the net balance of every repo of the pair, payable
    /// by `payer` to the other party in the cash token. `noticeHash` is zero under automatic early termination.
    struct CloseOut {
        address nonDefaulting;
        address defaulting;
        address payer;
        address cash;
        uint256 amount;
        bytes32 noticeHash;
        bytes32 cdmHash;
        bool paid;
    }

    /// @notice The default feed: the oracle's record of which parties are in default.
    IDefaultFeed public immutable oracle;
    /// @dev The Default Notice the non-defaulting party served on the defaulting party, by hash of the CDM record.
    mapping(address => mapping(address => bytes32)) private _defaultNotice;
    mapping(bytes32 => CloseOut) private _closeOuts;
    mapping(address => bytes32[]) private _closeOutsOf;

    event RepoBooked(bytes32 indexed repoId, address indexed seller, address indexed buyer, bytes32 tradeHash);
    event RepoAffirmed(bytes32 indexed repoId, address indexed buyer, bytes32 tradeHash);
    event RepoInstructed(bytes32 indexed repoId, Phase phase, address indexed party, bytes32 cdmHash);
    event RepoSettled(bytes32 indexed repoId, Phase phase, bytes32 cdmHash);
    event RepoSubstitutionRefused(bytes32 indexed repoId, bytes32 cdmHash);
    event RepoPaymentRefused(bytes32 indexed repoId, Phase phase, bytes32 cdmHash);
    event RepoRollRefused(bytes32 indexed repoId, bytes32 cdmHash);
    event RepoPairedOff(bytes32 indexed repoA, bytes32 indexed repoB, bytes32 cdmHash);
    event RepoPairOffRefused(bytes32 indexed repoA, bytes32 indexed repoB, bytes32 cdmHash);
    event DefaultNoticeServed(address indexed nonDefaulting, address indexed defaulting, bytes32 noticeHash);
    event RepoClosedOut(bytes32 indexed repoId, bytes32 indexed closeOutId);
    event CloseOutRecorded(bytes32 indexed closeOutId, address indexed nonDefaulting, address indexed defaulting,
        bytes32 cdmHash, address payer, uint256 amount);
    event CloseOutPaid(bytes32 indexed closeOutId, address indexed payer, uint256 amount);

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
    error NotThePayer();
    error NoPaymentPending();
    error NotAPaymentPhase();
    error IncomeAlreadyPaid();
    error NoRoll();
    error NotAPair();
    error PairOffPending();
    error NoPairOff();
    error NotForBuySellBack();
    error DeductionTooLarge();
    error NoDefault(address party);
    error InDefault(address party);
    error CloseOutExists();
    error NoNotice();
    error NothingToCloseOut();
    error WrongPayer();
    error NoCloseOut();
    error AlreadyPaid();

    constructor(address oracle_) {
        oracle = IDefaultFeed(oracle_);
    }

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
        _book(repoId, buyer, security, quantity, cash, purchasePrice, repurchasePrice, tradeHash);
    }

    /// @notice The seller books a buy/sell-back (wp-adr-repo-buy-sell-back): the same terms as a repo, and the CDM trade
    /// carries CDM's trade type BuySellBack.
    function bookBuySellBack(
        bytes32 repoId,
        address buyer,
        address security,
        uint256 quantity,
        address cash,
        uint256 purchasePrice,
        uint256 repurchasePrice,
        bytes32 tradeHash
    ) external {
        _book(repoId, buyer, security, quantity, cash, purchasePrice, repurchasePrice, tradeHash);
        _buySellBack[repoId] = true;
    }

    function _book(
        bytes32 repoId,
        address buyer,
        address security,
        uint256 quantity,
        address cash,
        uint256 purchasePrice,
        uint256 repurchasePrice,
        bytes32 tradeHash
    ) private {
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
            bytes32 paired = _pairOffWith[repoId];
            if (paired != bytes32(0)) _clearPairOff(repoId, paired);
            _close(repoId, cdmHash);
            IERC20(r.security).safeTransferFrom(r.buyer, r.seller, r.quantity);
            IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, sellBackPrice(repoId));
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
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Reprice, cdmHash, terms, true);
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
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Adjustment, cdmHash, terms, true);
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
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Substitution, cdmHash, terms, true);
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

    /// @notice The seller pays interim interest on a purchased repo (wp-adr-repo-income) with the hash of the CDM event,
    /// which becomes the trade hash. The buyer's matching instruction agrees: it moves the cash and lowers the Repurchase Price.
    function instructInterimInterest(bytes32 repoId, bytes32 cdmHash, uint256 amount, uint256 newRepurchasePrice) external {
        if (amount == 0) revert ZeroAmount();
        if (_buySellBack[repoId]) revert NotForBuySellBack();
        Repo storage p = _load(repoId);
        _requireFirstInstruction(repoId, Phase.InterimInterest, p.seller);
        if (newRepurchasePrice < p.purchasePrice) revert ZeroAmount();
        bytes32 terms = keccak256(abi.encode(cdmHash, amount, newRepurchasePrice));
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.InterimInterest, cdmHash, terms, true);
        if (!settles) return;
        r.repurchasePrice = newRepurchasePrice;
        IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, amount);
        emit RepoSettled(repoId, Phase.InterimInterest, cdmHash);
    }

    /// @notice The buyer pays manufactured income on a purchased repo (GMRA paragraph 5, wp-adr-repo-income) with the hash
    /// of the document. The seller's matching instruction agrees and moves the cash. The trade does not change. One
    /// document is paid once. For a buy/sell-back (wp-adr-repo-buy-sell-back) the amount is the income deduction: the
    /// agreement moves no cash and adds it to the repo's income deduction, which lowers the Sell Back Price.
    function instructIncome(bytes32 repoId, bytes32 cdmHash, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (_incomePaid[repoId][cdmHash]) revert IncomeAlreadyPaid();
        Repo storage p = _load(repoId);
        _requireFirstInstruction(repoId, Phase.Income, p.buyer);
        bytes32 terms = keccak256(abi.encode(cdmHash, amount));
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Income, cdmHash, terms, false);
        if (!settles) return;
        _incomePaid[repoId][cdmHash] = true;
        if (_buySellBack[repoId]) {
            uint256 deduction = _incomeDeduction[repoId] + amount;
            if (deduction >= r.repurchasePrice) revert DeductionTooLarge();
            _incomeDeduction[repoId] = deduction;
        } else {
            IERC20(r.cash).safeTransferFrom(r.buyer, r.seller, amount);
        }
        emit RepoSettled(repoId, Phase.Income, cdmHash);
    }

    /// @notice The receiving party refuses a pending interim interest or income payment, which clears it.
    function refusePayment(bytes32 repoId, Phase phase) external {
        if (phase != Phase.InterimInterest && phase != Phase.Income) revert NotAPaymentPhase();
        Repo storage r = _load(repoId);
        bool interim = phase == Phase.InterimInterest;
        if (msg.sender != (interim ? r.buyer : r.seller)) revert NotAParty();
        Instructions storage ins = _instructions[repoId][phase];
        bytes32 requested = interim ? ins.seller : ins.buyer;
        if (requested == bytes32(0)) revert NoPaymentPending();
        delete _instructions[repoId][phase];
        delete _replacementTerms[repoId];
        emit RepoPaymentRefused(repoId, phase, requested);
    }

    /// @notice A party instructs the roll of a purchased repo (wp-adr-repo-roll) with the hash of the CDM roll event, which
    /// becomes the trade hash, and the new Repurchase Price. The other party's matching instruction agrees: the seller pays
    /// the buyer the stored Repurchase Price less the Purchase Price, and the Repurchase Price is updated. The securities do
    /// not move. Each service checks the Repurchase Date. For a buy/sell-back the income deduction is netted: the Seller
    /// pays the Price Differential less the deduction, the Buyer pays any excess, and the deduction resets for the new term.
    function instructRoll(bytes32 repoId, bytes32 cdmHash, uint256 newRepurchasePrice) external {
        Repo storage p = _load(repoId);
        if (newRepurchasePrice < p.purchasePrice) revert ZeroAmount();
        bytes32 terms = keccak256(abi.encode(cdmHash, newRepurchasePrice));
        (Repo storage r, bool settles) = _instructReplacement(repoId, Phase.Roll, cdmHash, terms, true);
        if (!settles) return;
        uint256 interest = r.repurchasePrice - r.purchasePrice;
        uint256 deduction = _incomeDeduction[repoId];
        r.repurchasePrice = newRepurchasePrice;
        delete _incomeDeduction[repoId];
        if (interest > deduction) IERC20(r.cash).safeTransferFrom(r.seller, r.buyer, interest - deduction);
        else if (deduction > interest) IERC20(r.cash).safeTransferFrom(r.buyer, r.seller, deduction - interest);
        emit RepoSettled(repoId, Phase.Roll, cdmHash);
    }

    /// @notice The party that did not propose the pending roll refuses it, which clears it.
    function refuseRoll(bytes32 repoId) external {
        Repo storage r = _load(repoId);
        bool isSeller = msg.sender == r.seller;
        if (!isSeller && msg.sender != r.buyer) revert NotAParty();
        Instructions storage ins = _instructions[repoId][Phase.Roll];
        bytes32 proposed = isSeller ? ins.buyer : ins.seller;
        if (proposed == bytes32(0)) revert NoRoll();
        delete _instructions[repoId][Phase.Roll];
        delete _replacementTerms[repoId];
        emit RepoRollRefused(repoId, proposed);
    }

    /// @dev The payer's instruction comes first; the other party can only answer it.
    function _requireFirstInstruction(bytes32 repoId, Phase phase, address payer) private view {
        Instructions storage ins = _instructions[repoId][phase];
        bytes32 first = payer == _repos[repoId].seller ? ins.seller : ins.buyer;
        if (msg.sender != payer && first == bytes32(0)) revert NotThePayer();
    }

    /// @dev Records a party's instruction for a phase after the purchase. When it is the second, it checks the two match, clears
    /// them, sets the trade hash and returns settles = true for the caller to move the assets.
    function _instructReplacement(bytes32 repoId, Phase phase, bytes32 cdmHash, bytes32 terms, bool replacesTrade)
        private
        returns (Repo storage r, bool settles)
    {
        r = _load(repoId);
        if (r.state != RepoState.Purchased) revert WrongState(r.state);
        _requireNothingPending(repoId, phase);
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
        if (replacesTrade) r.tradeHash = cdmHash;
        return (r, true);
    }

    /// @notice A party instructs the pair-off of two purchased repos (wp-adr-repo-pair-off) with the hash of the CDM pair-off
    /// settlement document. The repos must be between the same two parties in opposite directions, with the same security,
    /// quantity and cash token; each service checks the common Repurchase Date. The other party's instruction with the same
    /// hash, naming the two repos in either order, agrees: both repos are repurchased, no securities move, and the Seller of
    /// the repo with the higher Repurchase Price pays its Buyer the difference.
    function instructPairOff(bytes32 repoA, bytes32 repoB, bytes32 cdmHash) external {
        if (repoA == repoB) revert NotAPair();
        Repo storage a = _load(repoA);
        Repo storage b = _load(repoB);
        if (a.state != RepoState.Purchased) revert WrongState(a.state);
        if (b.state != RepoState.Purchased) revert WrongState(b.state);
        if (a.seller != b.buyer || a.buyer != b.seller || a.security != b.security || a.quantity != b.quantity || a.cash != b.cash)
            revert NotAPair();
        if (_buySellBack[repoA] != _buySellBack[repoB]) revert NotAPair();
        bytes32 pendingA = _pairOffWith[repoA];
        bytes32 pendingB = _pairOffWith[repoB];
        if ((pendingA != bytes32(0) && pendingA != repoB) || (pendingB != bytes32(0) && pendingB != repoA)) revert PairOffPending();
        _requireNothingPending(repoA, Phase.PairOff);
        _requireNothingPending(repoB, Phase.PairOff);
        bool sellerOfA = msg.sender == a.seller;
        if (!sellerOfA && msg.sender != a.buyer) revert NotAParty();
        Instructions storage insA = _instructions[repoA][Phase.PairOff];
        Instructions storage insB = _instructions[repoB][Phase.PairOff];
        if ((sellerOfA ? insA.seller : insA.buyer) != bytes32(0)) revert AlreadyInstructed();
        bytes32 other = sellerOfA ? insA.buyer : insA.seller;
        if (other != bytes32(0) && other != cdmHash) revert HashMismatch(other, cdmHash);
        if (sellerOfA) {
            insA.seller = cdmHash;
            insB.buyer = cdmHash;
        } else {
            insA.buyer = cdmHash;
            insB.seller = cdmHash;
        }
        _pairOffWith[repoA] = repoB;
        _pairOffWith[repoB] = repoA;
        emit RepoInstructed(repoA, Phase.PairOff, msg.sender, cdmHash);
        emit RepoInstructed(repoB, Phase.PairOff, msg.sender, cdmHash);
        if (other == bytes32(0)) return;

        _clearPairOff(repoA, repoB);
        _close(repoA, cdmHash);
        _close(repoB, cdmHash);
        uint256 priceA = sellBackPrice(repoA);
        uint256 priceB = sellBackPrice(repoB);
        if (priceA > priceB) {
            IERC20(a.cash).safeTransferFrom(a.seller, a.buyer, priceA - priceB);
        } else if (priceB > priceA) {
            IERC20(b.cash).safeTransferFrom(b.seller, b.buyer, priceB - priceA);
        }
        emit RepoSettled(repoA, Phase.PairOff, cdmHash);
        emit RepoSettled(repoB, Phase.PairOff, cdmHash);
        emit RepoPairedOff(repoA, repoB, cdmHash);
    }

    /// @notice The party that did not propose the pending pair-off of a repo refuses it, which clears it on both repos.
    function refusePairOff(bytes32 repoId) external {
        Repo storage r = _load(repoId);
        bytes32 paired = _pairOffWith[repoId];
        if (paired == bytes32(0)) revert NoPairOff();
        bool isSeller = msg.sender == r.seller;
        if (!isSeller && msg.sender != r.buyer) revert NotAParty();
        Instructions storage ins = _instructions[repoId][Phase.PairOff];
        bytes32 proposed = isSeller ? ins.buyer : ins.seller;
        if (proposed == bytes32(0)) revert NoPairOff();
        _clearPairOff(repoId, paired);
        emit RepoPairOffRefused(repoId, paired, proposed);
    }

    /// @notice The other repo of a repo's pending pair-off, or zero.
    function pairOffWith(bytes32 repoId) external view returns (bytes32) {
        return _pairOffWith[repoId];
    }

    /// @dev No repurchase instruction and no instruction of another phase after the purchase is pending on the repo.
    function _requireNothingPending(bytes32 repoId, Phase phase) private view {
        Instructions storage repurchase = _instructions[repoId][Phase.Repurchase];
        if (repurchase.seller != bytes32(0) || repurchase.buyer != bytes32(0)) revert RepurchaseInstructed();
        for (uint8 p = uint8(Phase.Reprice); p <= uint8(Phase.PairOff); p++) {
            if (Phase(p) == phase) continue;
            Instructions storage rival = _instructions[repoId][Phase(p)];
            if (rival.seller != bytes32(0) || rival.buyer != bytes32(0)) {
                if (Phase(p) == Phase.PairOff) revert PairOffPending();
                revert ReplacementPending();
            }
        }
    }

    /// @dev Marks a repo repurchased under a settlement hash and clears every phase pending on it.
    function _close(bytes32 repoId, bytes32 cdmHash) private {
        Repo storage r = _repos[repoId];
        r.state = RepoState.Repurchased;
        r.repurchaseHash = cdmHash;
        for (uint8 p = uint8(Phase.Reprice); p <= uint8(Phase.PairOff); p++) delete _instructions[repoId][Phase(p)];
        delete _replacementTerms[repoId];
    }

    function _clearPairOff(bytes32 repoA, bytes32 repoB) private {
        delete _instructions[repoA][Phase.PairOff];
        delete _instructions[repoB][Phase.PairOff];
        delete _pairOffWith[repoA];
        delete _pairOffWith[repoB];
    }

    /// @notice Whether a repo is a buy/sell-back.
    function isBuySellBack(bytes32 repoId) external view returns (bool) {
        return _buySellBack[repoId];
    }

    /// @notice A buy/sell-back's agreed income deductions in the current term; zero for a repo.
    function incomeDeduction(bytes32 repoId) external view returns (uint256) {
        return _incomeDeduction[repoId];
    }

    /// @notice What the Seller pays at the repurchase: the Repurchase Price less any buy/sell-back income deduction.
    function sellBackPrice(bytes32 repoId) public view returns (uint256) {
        return _repos[repoId].repurchasePrice - _incomeDeduction[repoId];
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

    // ---- default and close-out (wp-adr-repo-default-close-out, GMRA paragraph 10) ----

    /// @notice The non-defaulting party serves a Default Notice on a party the oracle feed records in default, with the
    /// hash of the CDM record (GmraDefaultNotice), which names the Early Termination Date. A later notice replaces it.
    function serveDefaultNotice(address defaulting, bytes32 noticeHash) external {
        if (noticeHash == bytes32(0)) revert ZeroAmount();
        if (defaulting == msg.sender) revert SelfCounterparty();
        if (!oracle.isDefaulted(defaulting)) revert NoDefault(defaulting);
        if (oracle.isDefaulted(msg.sender)) revert InDefault(msg.sender);
        _defaultNotice[msg.sender][defaulting] = noticeHash;
        emit DefaultNoticeServed(msg.sender, defaulting, noticeHash);
    }

    /// @notice The non-defaulting party closes out every purchased repo with the defaulting party: each is marked closed
    /// out under `cdmHash`, the hash of the CDM close-out statement (GmraCloseOutStatement), and every pending phase on it
    /// lapses. No securities move. `payer` (either party, or zero when `amount` is zero) owes `amount` of `cash` to the
    /// other. `noticeHash` is the served Default Notice, or zero under automatic early termination. The contract checks
    /// no amounts: both services compute the statement from the chain's repos and prices.
    function closeOutDefault(
        bytes32 closeOutId,
        address defaulting,
        bytes32 noticeHash,
        bytes32 cdmHash,
        address cash,
        address payer,
        uint256 amount
    ) external {
        if (_closeOuts[closeOutId].cdmHash != bytes32(0) || cdmHash == bytes32(0)) revert CloseOutExists();
        if (!oracle.isDefaulted(defaulting)) revert NoDefault(defaulting);
        if (oracle.isDefaulted(msg.sender)) revert InDefault(msg.sender);
        if (noticeHash != bytes32(0) && noticeHash != _defaultNotice[msg.sender][defaulting]) revert NoNotice();
        if (amount == 0 ? payer != address(0) : (payer != msg.sender && payer != defaulting)) revert WrongPayer();
        uint256 closed;
        bytes32[] storage ids = _reposOf[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            Repo storage r = _repos[ids[i]];
            if (r.state != RepoState.Purchased || (r.seller != defaulting && r.buyer != defaulting)) continue;
            bytes32 paired = _pairOffWith[ids[i]];
            if (paired != bytes32(0)) _clearPairOff(ids[i], paired);
            delete _instructions[ids[i]][Phase.Repurchase];
            _close(ids[i], cdmHash);
            r.state = RepoState.ClosedOut;
            closed++;
            emit RepoClosedOut(ids[i], closeOutId);
        }
        if (closed == 0) revert NothingToCloseOut();
        _closeOuts[closeOutId] = CloseOut(msg.sender, defaulting, payer, cash, amount, noticeHash, cdmHash, amount == 0);
        _closeOutsOf[msg.sender].push(closeOutId);
        _closeOutsOf[defaulting].push(closeOutId);
        emit CloseOutRecorded(closeOutId, msg.sender, defaulting, cdmHash, payer, amount);
    }

    /// @notice The party that owes a close-out balance pays it in the cash token (approve this contract first).
    function payCloseOut(bytes32 closeOutId) external {
        CloseOut storage c = _closeOuts[closeOutId];
        if (c.cdmHash == bytes32(0)) revert NoCloseOut();
        if (c.paid) revert AlreadyPaid();
        if (msg.sender != c.payer) revert NotThePayer();
        c.paid = true;
        address receiver = c.payer == c.nonDefaulting ? c.defaulting : c.nonDefaulting;
        IERC20(c.cash).safeTransferFrom(c.payer, receiver, c.amount);
        emit CloseOutPaid(closeOutId, c.payer, c.amount);
    }

    function defaultNotice(address nonDefaulting, address defaulting) external view returns (bytes32) {
        return _defaultNotice[nonDefaulting][defaulting];
    }

    function getCloseOut(bytes32 closeOutId) external view returns (CloseOut memory) {
        return _closeOuts[closeOutId];
    }

    function closeOutsOf(address party) external view returns (bytes32[] memory) {
        return _closeOutsOf[party];
    }

    function _load(bytes32 repoId) private view returns (Repo storage r) {
        r = _repos[repoId];
        if (r.state == RepoState.None) revert NoRepo(repoId);
    }
}
