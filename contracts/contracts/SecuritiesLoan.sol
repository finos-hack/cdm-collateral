// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice The default record of the oracle feed (OracleFeed).
interface ILoanDefaultFeed {
    function isDefaulted(address party) external view returns (bool);
}

/// @title Securities loan settlement under the GMSLA
/// @notice Settles the delivery and the returns of a securities loan (task-gmsla-loan-delivery-return,
/// wp-adr-gmsla-loan-delivery-return). The loan is CDM's TradeState, held by both parties' services; only its hash is
/// here. The lender books it with the loaned quantity and the collateral the services computed from it, and the borrower
/// affirms it with the same hash. At the delivery, each party instructs with the hash of the CDM settlement document; the
/// second instruction moves the loaned securities to the borrower and the collateral to the lender in one transaction.
/// Each return, full or partial, is instructed by both parties with the same quantity, the same collateral to redeliver
/// and the same hash of the CDM return document (cdm-ext GmslaLoanSettlement, which holds CDM's return event), which
/// becomes the trade hash; the second instruction moves the securities back to the lender and the collateral back to the
/// borrower in one transaction. A full return redelivers all the collateral held. Collateral passes by outright title transfer (GMSLA 2010): the contract holds no tokens, and each
/// party approves it for what it delivers. Loans are open: the contract checks no dates.
/// The lender may recall all or part of an open loan (task-gmsla-recall, wp-adr-gmsla-recall): the recall records the
/// quantity, the intended settlement date and the hash of the CDM recall notice (cdm-ext GmslaRecallNotice); the borrower
/// settles it through the return, and a settled return reduces the quantity still recalled. The contract does not
/// enforce the date: the services show a recall overdue.
/// The borrower may substitute all the collateral of an open loan with another security (task-gmsla-substitution,
/// wp-adr-gmsla-substitution): the request records the substitute token, its quantity and the hash of the CDM
/// substitution document (cdm-ext GmslaLoanSubstitution); the lender's agreement with the same hash moves the substitute
/// to the lender and the collateral held back to the borrower, and makes the hash the trade hash, in one transaction.
/// No return can be instructed while a substitution is pending, and no substitution while a return is pending.
/// Either party may bill the loan's rate for a period (task-gmsla-rebate, wp-adr-gmsla-rebate): the party receiving it
/// (the borrower for a rebate on cash collateral, the lender for a fee) records the period end, the amount and the hash
/// of the CDM invoice (cdm-ext GmslaLoanInvoice); the other party's payment with the same hash moves the amount in the
/// cash token to the biller and sets the loan's billed-through date, or it refuses. The services check the period and
/// the amount; a returned loan can still be billed.
/// After the oracle feed records a party's default (task-gmsla-default-close-out, wp-adr-gmsla-default-close-out), the
/// non-defaulting party may serve a Default Notice and close out every open loan of the pair under the hash of the CDM
/// close-out statement (cdm-ext GmslaCloseOutStatement): the loans close, pending returns, recalls, substitutions and
/// invoices lapse, and no securities or collateral move. The party owing the net balance pays it in the cash token.
contract SecuritiesLoan {
    using SafeERC20 for IERC20;

    enum LoanState {
        None,
        Booked,
        Affirmed,
        Open,
        Returned,
        ClosedOut
    }

    struct Loan {
        address lender;
        address borrower;
        address security;
        /// @dev The loaned quantity outstanding: the quantity delivered, less the quantity returned.
        uint256 quantity;
        address collateral;
        /// @dev The collateral the lender holds: the amount delivered, less the amount redelivered.
        uint256 collateralAmount;
        bytes32 tradeHash;
        LoanState state;
        bytes32 deliveryHash;
    }

    /// @dev The delivery's or the pending return's instructions, by party, and the return's terms; cleared on settlement.
    struct Instructions {
        bytes32 lender;
        bytes32 borrower;
        uint256 quantity;
        uint256 collateralAmount;
    }

    mapping(bytes32 => Loan) private _loans;
    mapping(bytes32 => Instructions) private _delivery;
    mapping(bytes32 => Instructions) private _return;
    mapping(address => bytes32[]) private _loansOf;

    /// @dev A loan's pending recall: the quantity still recalled, the intended settlement date (YYYYMMDD) and the notice.
    struct Recall {
        uint256 quantity;
        uint32 settlementDate;
        bytes32 noticeHash;
    }

    mapping(bytes32 => Recall) private _recall;

    /// @dev A loan's pending substitution: the substitute collateral token, its quantity and the CDM document's hash.
    struct Substitution {
        address collateral;
        uint256 collateralAmount;
        bytes32 cdmHash;
    }

    mapping(bytes32 => Substitution) private _substitution;

    /// @dev A loan's pending invoice: the biller, the cash token, the period end (YYYYMMDD), the amount and the CDM
    /// invoice's hash.
    struct Bill {
        address biller;
        address cashToken;
        uint32 periodEnd;
        uint256 amount;
        bytes32 invoiceHash;
    }

    mapping(bytes32 => Bill) private _bill;
    /// @dev The date (YYYYMMDD) a loan's rate is billed and paid through; zero: never billed.
    mapping(bytes32 => uint32) private _billedThrough;

    /// @notice A GMSLA default close-out (wp-adr-gmsla-default-close-out): the net balance of every open loan of the
    /// pair, payable by `payer` to the other party in the cash token. `noticeHash` is zero under automatic early
    /// termination.
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
    ILoanDefaultFeed public immutable oracle;
    /// @dev The Default Notice the non-defaulting party served on the defaulting party, by hash of the CDM record.
    mapping(address => mapping(address => bytes32)) private _defaultNotice;
    mapping(bytes32 => CloseOut) private _closeOuts;
    mapping(address => bytes32[]) private _closeOutsOf;
    /// @dev The close-out that closed a loan (zero: none).
    mapping(bytes32 => bytes32) private _closeOutOf;

    event LoanBooked(bytes32 indexed loanId, address indexed lender, address indexed borrower, bytes32 tradeHash);
    event LoanAffirmed(bytes32 indexed loanId, address indexed borrower, bytes32 tradeHash);
    event LoanDeliveryInstructed(bytes32 indexed loanId, address indexed party, bytes32 cdmHash);
    event LoanDelivered(bytes32 indexed loanId, bytes32 cdmHash);
    event LoanReturnInstructed(bytes32 indexed loanId, address indexed party, uint256 quantity, uint256 collateralAmount,
        bytes32 cdmHash);
    event LoanReturned(bytes32 indexed loanId, uint256 quantity, uint256 collateralAmount, bytes32 cdmHash, bool full);
    event LoanRecalled(bytes32 indexed loanId, uint256 quantity, uint32 settlementDate, bytes32 noticeHash);
    event LoanRecallWithdrawn(bytes32 indexed loanId, bytes32 noticeHash, bytes32 withdrawalHash);
    /// @dev A settled return reduced the recall; quantity is what is still recalled (zero: the recall is cleared).
    event LoanRecallReduced(bytes32 indexed loanId, bytes32 noticeHash, uint256 quantity);
    event LoanSubstitutionRequested(bytes32 indexed loanId, address collateral, uint256 collateralAmount, bytes32 cdmHash);
    /// @dev The substitution settled: the new collateral and amount held, and the trade hash.
    event LoanSubstituted(bytes32 indexed loanId, address collateral, uint256 collateralAmount, bytes32 cdmHash);
    event LoanSubstitutionRefused(bytes32 indexed loanId, bytes32 cdmHash);
    event LoanBilled(bytes32 indexed loanId, address indexed biller, address cashToken, uint32 periodEnd, uint256 amount, bytes32 invoiceHash);
    event LoanBillPaid(bytes32 indexed loanId, address indexed payer, uint32 periodEnd, uint256 amount, bytes32 invoiceHash);
    event LoanBillRefused(bytes32 indexed loanId, bytes32 invoiceHash);
    event LoanDefaultNoticeServed(address indexed nonDefaulting, address indexed defaulting, bytes32 noticeHash);
    event LoanClosedOut(bytes32 indexed loanId, bytes32 indexed closeOutId);
    event LoanCloseOutRecorded(bytes32 indexed closeOutId, address indexed nonDefaulting, address indexed defaulting,
        bytes32 cdmHash, address payer, uint256 amount);
    event LoanCloseOutPaid(bytes32 indexed closeOutId, address indexed payer, uint256 amount);

    error LoanExists(bytes32 loanId);
    error NoLoan(bytes32 loanId);
    error SelfCounterparty();
    error ZeroAmount();
    error WrongState(LoanState state);
    error NotTheBorrower();
    error NotAParty();
    error HashMismatch(bytes32 expected, bytes32 given);
    error TermsMismatch();
    error AlreadyInstructed();
    error TooMuch();
    error FullReturnKeepsCollateral();
    error NotTheLender();
    error RecallPending();
    error NoRecall();
    error SubstitutionPending();
    error ReturnPending();
    error NoSubstitution();
    error SameCollateral();
    error BillPending();
    error NoBill();
    error NotThePayer();
    error PeriodNotAfterBilled();
    error NoDefault(address party);
    error InDefault(address party);
    error CloseOutExists();
    error NoNotice();
    error NothingToCloseOut();
    error WrongPayer();
    error NoCloseOut();
    error AlreadyPaid();

    constructor(address oracle_) {
        oracle = ILoanDefaultFeed(oracle_);
    }

    /// @notice The lender books a loan to the borrower: the loaned securities and quantity, the collateral token and the
    /// amount delivered at the delivery, and the hash of the CDM trade.
    function book(
        bytes32 loanId,
        address borrower,
        address security,
        uint256 quantity,
        address collateral,
        uint256 collateralAmount,
        bytes32 tradeHash
    ) external {
        if (_loans[loanId].state != LoanState.None) revert LoanExists(loanId);
        if (borrower == msg.sender || borrower == address(0)) revert SelfCounterparty();
        if (quantity == 0 || collateralAmount == 0) revert ZeroAmount();
        _loans[loanId] = Loan(msg.sender, borrower, security, quantity, collateral, collateralAmount, tradeHash,
            LoanState.Booked, bytes32(0));
        _loansOf[msg.sender].push(loanId);
        _loansOf[borrower].push(loanId);
        emit LoanBooked(loanId, msg.sender, borrower, tradeHash);
    }

    /// @notice The borrower affirms the booked loan; the hash must be the booked trade hash.
    function affirm(bytes32 loanId, bytes32 tradeHash) external {
        Loan storage l = _load(loanId);
        if (l.state != LoanState.Booked) revert WrongState(l.state);
        if (msg.sender != l.borrower) revert NotTheBorrower();
        if (tradeHash != l.tradeHash) revert HashMismatch(l.tradeHash, tradeHash);
        l.state = LoanState.Affirmed;
        emit LoanAffirmed(loanId, msg.sender, tradeHash);
    }

    /// @notice A party instructs the delivery of an affirmed loan with the hash of the CDM settlement document. The
    /// second party's instruction must carry the same hash; it moves the securities and the collateral.
    function instructDelivery(bytes32 loanId, bytes32 cdmHash) external {
        Loan storage l = _load(loanId);
        if (l.state != LoanState.Affirmed) revert WrongState(l.state);
        Instructions storage ins = _delivery[loanId];
        if (!_record(l, ins, cdmHash)) {
            emit LoanDeliveryInstructed(loanId, msg.sender, cdmHash);
            return;
        }
        emit LoanDeliveryInstructed(loanId, msg.sender, cdmHash);
        delete _delivery[loanId];
        l.state = LoanState.Open;
        l.deliveryHash = cdmHash;
        IERC20(l.security).safeTransferFrom(l.lender, l.borrower, l.quantity);
        IERC20(l.collateral).safeTransferFrom(l.borrower, l.lender, l.collateralAmount);
        emit LoanDelivered(loanId, cdmHash);
    }

    /// @notice A party instructs a return of an open loan: the loaned quantity returned, the collateral the lender
    /// redelivers, and the hash of the CDM return document. The second party must state the same three; its instruction
    /// moves both, reduces the loan and makes the hash the trade hash. Returning the whole outstanding quantity returns
    /// the loan and must redeliver all the collateral held.
    function instructReturn(bytes32 loanId, uint256 quantity, uint256 collateralAmount, bytes32 cdmHash) external {
        Loan storage l = _load(loanId);
        if (l.state != LoanState.Open) revert WrongState(l.state);
        if (quantity == 0 || cdmHash == bytes32(0)) revert ZeroAmount();
        if (quantity > l.quantity || collateralAmount > l.collateralAmount) revert TooMuch();
        if (_substitution[loanId].cdmHash != bytes32(0)) revert SubstitutionPending();
        bool full = quantity == l.quantity;
        if (full && collateralAmount != l.collateralAmount) revert FullReturnKeepsCollateral();
        Instructions storage ins = _return[loanId];
        if (ins.lender != bytes32(0) || ins.borrower != bytes32(0)) {
            if (ins.quantity != quantity || ins.collateralAmount != collateralAmount) revert TermsMismatch();
        } else {
            ins.quantity = quantity;
            ins.collateralAmount = collateralAmount;
        }
        bool settles = _record(l, ins, cdmHash);
        emit LoanReturnInstructed(loanId, msg.sender, quantity, collateralAmount, cdmHash);
        if (!settles) return;

        delete _return[loanId];
        l.quantity -= quantity;
        l.collateralAmount -= collateralAmount;
        l.tradeHash = cdmHash;
        if (full) l.state = LoanState.Returned;
        _reduceRecall(loanId, quantity);
        IERC20(l.security).safeTransferFrom(l.borrower, l.lender, quantity);
        if (collateralAmount > 0) IERC20(l.collateral).safeTransferFrom(l.lender, l.borrower, collateralAmount);
        emit LoanReturned(loanId, quantity, collateralAmount, cdmHash, full);
    }

    /// @notice The lender recalls `quantity` of an open loan, due on `settlementDate` (YYYYMMDD), with the hash of the
    /// CDM recall notice. One recall per loan may be pending.
    function recall(bytes32 loanId, uint256 quantity, uint32 settlementDate, bytes32 noticeHash) external {
        Loan storage l = _load(loanId);
        if (l.state != LoanState.Open) revert WrongState(l.state);
        if (msg.sender != l.lender) revert NotTheLender();
        if (_recall[loanId].quantity != 0) revert RecallPending();
        if (quantity == 0 || settlementDate == 0 || noticeHash == bytes32(0)) revert ZeroAmount();
        if (quantity > l.quantity) revert TooMuch();
        _recall[loanId] = Recall(quantity, settlementDate, noticeHash);
        emit LoanRecalled(loanId, quantity, settlementDate, noticeHash);
    }

    /// @notice The lender withdraws the pending recall, with the hash of the CDM withdrawal document.
    function withdrawRecall(bytes32 loanId, bytes32 withdrawalHash) external {
        Loan storage l = _load(loanId);
        if (msg.sender != l.lender) revert NotTheLender();
        Recall storage r = _recall[loanId];
        if (r.quantity == 0) revert NoRecall();
        if (withdrawalHash == bytes32(0)) revert ZeroAmount();
        bytes32 notice = r.noticeHash;
        delete _recall[loanId];
        emit LoanRecallWithdrawn(loanId, notice, withdrawalHash);
    }

    /// @dev A settled return of `quantity` reduces the pending recall, and clears it when it returns at least as much.
    function _reduceRecall(bytes32 loanId, uint256 quantity) private {
        Recall storage r = _recall[loanId];
        if (r.quantity == 0) return;
        bytes32 notice = r.noticeHash;
        if (quantity >= r.quantity) {
            delete _recall[loanId];
            emit LoanRecallReduced(loanId, notice, 0);
        } else {
            r.quantity -= quantity;
            emit LoanRecallReduced(loanId, notice, r.quantity);
        }
    }

    /// @notice The pending recall (zeros: none).
    function getRecall(bytes32 loanId) external view returns (uint256 quantity, uint32 settlementDate, bytes32 noticeHash) {
        Recall storage r = _recall[loanId];
        return (r.quantity, r.settlementDate, r.noticeHash);
    }

    /// @notice The borrower asks to replace all the collateral of an open loan with `collateralAmount` of `collateral`,
    /// with the hash of the CDM substitution document. One substitution per loan may be pending, and none while a return
    /// is pending.
    function requestSubstitution(bytes32 loanId, address collateral, uint256 collateralAmount, bytes32 cdmHash) external {
        Loan storage l = _load(loanId);
        if (l.state != LoanState.Open) revert WrongState(l.state);
        if (msg.sender != l.borrower) revert NotTheBorrower();
        if (_substitution[loanId].cdmHash != bytes32(0)) revert SubstitutionPending();
        Instructions storage ret = _return[loanId];
        if (ret.lender != bytes32(0) || ret.borrower != bytes32(0)) revert ReturnPending();
        if (collateralAmount == 0 || cdmHash == bytes32(0) || collateral == address(0)) revert ZeroAmount();
        if (collateral == l.collateral || collateral == l.security) revert SameCollateral();
        _substitution[loanId] = Substitution(collateral, collateralAmount, cdmHash);
        emit LoanSubstitutionRequested(loanId, collateral, collateralAmount, cdmHash);
    }

    /// @notice The lender agrees to the pending substitution with the same hash: the substitute moves from the borrower
    /// to the lender, all the collateral held moves back to the borrower, and the hash becomes the trade hash.
    function agreeSubstitution(bytes32 loanId, bytes32 cdmHash) external {
        Loan storage l = _load(loanId);
        if (msg.sender != l.lender) revert NotTheLender();
        Substitution memory sub = _substitution[loanId];
        if (sub.cdmHash == bytes32(0)) revert NoSubstitution();
        if (cdmHash != sub.cdmHash) revert HashMismatch(sub.cdmHash, cdmHash);
        delete _substitution[loanId];
        address old = l.collateral;
        uint256 oldAmount = l.collateralAmount;
        l.collateral = sub.collateral;
        l.collateralAmount = sub.collateralAmount;
        l.tradeHash = cdmHash;
        IERC20(sub.collateral).safeTransferFrom(l.borrower, l.lender, sub.collateralAmount);
        IERC20(old).safeTransferFrom(l.lender, l.borrower, oldAmount);
        emit LoanSubstituted(loanId, sub.collateral, sub.collateralAmount, cdmHash);
    }

    /// @notice The lender refuses the pending substitution, which clears it.
    function refuseSubstitution(bytes32 loanId) external {
        Loan storage l = _load(loanId);
        if (msg.sender != l.lender) revert NotTheLender();
        bytes32 h = _substitution[loanId].cdmHash;
        if (h == bytes32(0)) revert NoSubstitution();
        delete _substitution[loanId];
        emit LoanSubstitutionRefused(loanId, h);
    }

    /// @notice A party bills the loan's rate through `periodEnd` (YYYYMMDD, after the billed-through date) for `amount`
    /// of `cashToken`, with the hash of the CDM invoice. One invoice per loan may be pending. An open or returned loan.
    function bill(bytes32 loanId, address cashToken, uint32 periodEnd, uint256 amount, bytes32 invoiceHash) external {
        Loan storage l = _load(loanId);
        if (l.state != LoanState.Open && l.state != LoanState.Returned) revert WrongState(l.state);
        if (msg.sender != l.lender && msg.sender != l.borrower) revert NotAParty();
        if (_bill[loanId].invoiceHash != bytes32(0)) revert BillPending();
        if (amount == 0 || periodEnd == 0 || invoiceHash == bytes32(0) || cashToken == address(0)) revert ZeroAmount();
        if (periodEnd <= _billedThrough[loanId]) revert PeriodNotAfterBilled();
        _bill[loanId] = Bill(msg.sender, cashToken, periodEnd, amount, invoiceHash);
        emit LoanBilled(loanId, msg.sender, cashToken, periodEnd, amount, invoiceHash);
    }

    /// @notice The other party pays the pending invoice with the same hash: the amount of the invoice's cash token moves
    /// from it to the biller and the loan is billed through the period end.
    function payBill(bytes32 loanId, bytes32 invoiceHash) external {
        Loan storage l = _load(loanId);
        Bill memory b = _bill[loanId];
        if (b.invoiceHash == bytes32(0)) revert NoBill();
        address payer = b.biller == l.lender ? l.borrower : l.lender;
        if (msg.sender != payer) revert NotThePayer();
        if (invoiceHash != b.invoiceHash) revert HashMismatch(b.invoiceHash, invoiceHash);
        delete _bill[loanId];
        _billedThrough[loanId] = b.periodEnd;
        IERC20(b.cashToken).safeTransferFrom(payer, b.biller, b.amount);
        emit LoanBillPaid(loanId, payer, b.periodEnd, b.amount, invoiceHash);
    }

    /// @notice The payer refuses the pending invoice, which clears it.
    function refuseBill(bytes32 loanId) external {
        Loan storage l = _load(loanId);
        Bill memory b = _bill[loanId];
        if (b.invoiceHash == bytes32(0)) revert NoBill();
        if (msg.sender != (b.biller == l.lender ? l.borrower : l.lender)) revert NotThePayer();
        delete _bill[loanId];
        emit LoanBillRefused(loanId, b.invoiceHash);
    }

    /// @notice The pending invoice (zeros: none) and the date the loan is billed through (zero: never).
    function getBill(bytes32 loanId)
        external
        view
        returns (address biller, address cashToken, uint32 periodEnd, uint256 amount, bytes32 invoiceHash, uint32 billedThrough)
    {
        Bill storage b = _bill[loanId];
        return (b.biller, b.cashToken, b.periodEnd, b.amount, b.invoiceHash, _billedThrough[loanId]);
    }

    /// @notice The pending substitution (zeros: none).
    function getSubstitution(bytes32 loanId) external view returns (address collateral, uint256 collateralAmount, bytes32 cdmHash) {
        Substitution storage sub = _substitution[loanId];
        return (sub.collateral, sub.collateralAmount, sub.cdmHash);
    }

    /// @dev Records the caller's instruction hash; true when the other party has instructed the same hash already.
    function _record(Loan storage l, Instructions storage ins, bytes32 cdmHash) private returns (bool) {
        bool isLender = msg.sender == l.lender;
        if (!isLender && msg.sender != l.borrower) revert NotAParty();
        if ((isLender ? ins.lender : ins.borrower) != bytes32(0)) revert AlreadyInstructed();
        bytes32 other = isLender ? ins.borrower : ins.lender;
        if (other != bytes32(0) && other != cdmHash) revert HashMismatch(other, cdmHash);
        if (isLender) ins.lender = cdmHash;
        else ins.borrower = cdmHash;
        return other != bytes32(0);
    }

    // ---- default and close-out (wp-adr-gmsla-default-close-out, GMSLA 2010 paragraph 11) ----

    /// @notice The non-defaulting party serves a Default Notice on a party the oracle feed records in default, with the
    /// hash of the CDM record (GmslaDefaultNotice), which names the Early Termination Date. A later notice replaces it.
    function serveDefaultNotice(address defaulting, bytes32 noticeHash) external {
        if (noticeHash == bytes32(0)) revert ZeroAmount();
        if (defaulting == msg.sender) revert SelfCounterparty();
        if (!oracle.isDefaulted(defaulting)) revert NoDefault(defaulting);
        if (oracle.isDefaulted(msg.sender)) revert InDefault(msg.sender);
        _defaultNotice[msg.sender][defaulting] = noticeHash;
        emit LoanDefaultNoticeServed(msg.sender, defaulting, noticeHash);
    }

    /// @notice The non-defaulting party closes out every open loan with the defaulting party: each is marked closed out
    /// under `closeOutId`, and its pending return, recall, substitution and invoice lapse. No securities or collateral
    /// move. `payer` (either party, or zero when `amount` is zero) owes `amount` of `cash` to the other. `noticeHash` is
    /// the served Default Notice, or zero under automatic early termination. The contract checks no amounts: both
    /// services compute the statement (`cdmHash`) from the loans, the billed-through dates, the margin and the prices.
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
        bytes32[] storage ids = _loansOf[msg.sender];
        for (uint256 i = 0; i < ids.length; i++) {
            Loan storage l = _loans[ids[i]];
            if (l.state != LoanState.Open || (l.lender != defaulting && l.borrower != defaulting)) continue;
            delete _return[ids[i]];
            delete _recall[ids[i]];
            delete _substitution[ids[i]];
            delete _bill[ids[i]];
            l.state = LoanState.ClosedOut;
            _closeOutOf[ids[i]] = closeOutId;
            closed++;
            emit LoanClosedOut(ids[i], closeOutId);
        }
        if (closed == 0) revert NothingToCloseOut();
        _closeOuts[closeOutId] = CloseOut(msg.sender, defaulting, payer, cash, amount, noticeHash, cdmHash, amount == 0);
        _closeOutsOf[msg.sender].push(closeOutId);
        _closeOutsOf[defaulting].push(closeOutId);
        emit LoanCloseOutRecorded(closeOutId, msg.sender, defaulting, cdmHash, payer, amount);
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
        emit LoanCloseOutPaid(closeOutId, c.payer, c.amount);
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

    /// @notice The close-out that closed a loan (zero: none).
    function closeOutOf(bytes32 loanId) external view returns (bytes32) {
        return _closeOutOf[loanId];
    }

    function getLoan(bytes32 loanId) external view returns (Loan memory) {
        return _loans[loanId];
    }

    /// @notice The hashes each party has instructed for the delivery that has not settled yet (zero: not instructed).
    function getDeliveryInstructions(bytes32 loanId) external view returns (bytes32 lender, bytes32 borrower) {
        Instructions storage ins = _delivery[loanId];
        return (ins.lender, ins.borrower);
    }

    /// @notice The pending return: each party's hash (zero: not instructed), the quantity and the collateral.
    function getReturnInstructions(bytes32 loanId)
        external
        view
        returns (bytes32 lender, bytes32 borrower, uint256 quantity, uint256 collateralAmount)
    {
        Instructions storage ins = _return[loanId];
        return (ins.lender, ins.borrower, ins.quantity, ins.collateralAmount);
    }

    function loansOf(address party) external view returns (bytes32[] memory) {
        return _loansOf[party];
    }

    function _load(bytes32 loanId) private view returns (Loan storage l) {
        l = _loans[loanId];
        if (l.state == LoanState.None) revert NoLoan(loanId);
    }
}
