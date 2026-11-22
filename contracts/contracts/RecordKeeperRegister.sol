// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Record keeper register confirmations
/// @notice For a token whose authoritative record is kept off the ledger (cdm-ext AuthoritativeRecordEnum Registered or
/// Claim), the record keeper — the fund's transfer agent for tMMF in the prototype — confirms on chain that its own
/// register now shows the token movements of a ledger transaction. The register itself stays with the record keeper;
/// this contract only carries its confirmations, so both parties read the same ones and build the same CDM
/// RecordKeeperConfirmation. Interim rules REG-1, REG-2 and REG-4 (project owner, 2026-11-21): a Registered or Claim
/// transfer, or enforcement, is complete only after this confirmation (task-sme-registered-asset-completion,
/// task-authoritative-record-settlement-enforcement). Only the record keeper's key may write.
contract RecordKeeperRegister {
    address public immutable recordKeeper;

    /// txHash => token => confirmed
    mapping(bytes32 => mapping(address => bool)) public confirmed;

    /// The register shows the movements of `token` in transaction `txHash`; `ref` is the record keeper's own.
    event RegisterConfirmed(bytes32 indexed txHash, address indexed token, string ref);

    error NotRecordKeeper();
    error AlreadyConfirmed(bytes32 txHash, address token);

    constructor(address recordKeeper_) {
        recordKeeper = recordKeeper_;
    }

    function confirm(bytes32 txHash, address token, string calldata ref) external {
        if (msg.sender != recordKeeper) revert NotRecordKeeper();
        if (confirmed[txHash][token]) revert AlreadyConfirmed(txHash, token);
        confirmed[txHash][token] = true;
        emit RegisterConfirmed(txHash, token, ref);
    }
}
