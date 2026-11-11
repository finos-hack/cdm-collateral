// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
contract SecuritiesLoan {
    using SafeERC20 for IERC20;

    enum LoanState {
        None,
        Booked,
        Affirmed,
        Open,
        Returned
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

    event LoanBooked(bytes32 indexed loanId, address indexed lender, address indexed borrower, bytes32 tradeHash);
    event LoanAffirmed(bytes32 indexed loanId, address indexed borrower, bytes32 tradeHash);
    event LoanDeliveryInstructed(bytes32 indexed loanId, address indexed party, bytes32 cdmHash);
    event LoanDelivered(bytes32 indexed loanId, bytes32 cdmHash);
    event LoanReturnInstructed(bytes32 indexed loanId, address indexed party, uint256 quantity, uint256 collateralAmount,
        bytes32 cdmHash);
    event LoanReturned(bytes32 indexed loanId, uint256 quantity, uint256 collateralAmount, bytes32 cdmHash, bool full);

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
        IERC20(l.security).safeTransferFrom(l.borrower, l.lender, quantity);
        if (collateralAmount > 0) IERC20(l.collateral).safeTransferFrom(l.lender, l.borrower, collateralAmount);
        emit LoanReturned(loanId, quantity, collateralAmount, cdmHash, full);
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
