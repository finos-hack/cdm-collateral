// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Portfolio reconciliation record
/// @notice Records the hashes of the two parties' trade snapshots and of the reconciliation result each party computed
/// from them (flow-reconciliation, gap G35, wp-adr-reconciliation-scope). No trade data is on-chain: the parties exchange
/// the snapshots off-chain, service to service, and each checks the other's snapshot against the hash recorded here.
/// Both parties compute the result with the same deterministic CDM function, so the run is Agreed when the two result
/// hashes match and Disagreed when they do not. A separate contract keeps CollateralControl under the EIP-170 size limit.
contract PortfolioReconciliation {
    enum RunState {
        None,
        OneResult,
        Agreed,
        Disagreed
    }

    struct Snapshot {
        address party;
        address counterparty;
        bytes32 snapshotHash;
        uint64 committedAt;
    }

    struct Run {
        bytes32 firstSnapshotId;
        bytes32 secondSnapshotId;
        bytes32 firstPartyResult;
        bytes32 secondPartyResult;
        uint32 breakCount;
        RunState state;
    }

    mapping(bytes32 => Snapshot) private _snapshots;
    mapping(bytes32 => Run) private _runs;

    event SnapshotCommitted(bytes32 indexed snapshotId, address indexed party, address indexed counterparty, bytes32 snapshotHash);
    event ResultCommitted(bytes32 indexed reconciliationId, address indexed party, bytes32 resultHash, uint32 breakCount);
    event ReconciliationDecided(bytes32 indexed reconciliationId, address indexed firstParty, address indexed secondParty, bool agreed);

    error SnapshotExists(bytes32 snapshotId);
    error NoSnapshot(bytes32 snapshotId);
    error SelfCounterparty();
    error NotAPair();
    error WrongReconciliationId();
    error NotAParty();
    error ResultAlreadyCommitted();

    /// @notice Record the hash of the caller's snapshot of its trades with a counterparty.
    function commitSnapshot(bytes32 snapshotId, address counterparty, bytes32 snapshotHash) external {
        if (_snapshots[snapshotId].party != address(0)) revert SnapshotExists(snapshotId);
        if (counterparty == msg.sender || counterparty == address(0)) revert SelfCounterparty();
        _snapshots[snapshotId] = Snapshot(msg.sender, counterparty, snapshotHash, uint64(block.timestamp));
        emit SnapshotCommitted(snapshotId, msg.sender, counterparty, snapshotHash);
    }

    /// @notice The identifier of the run that reconciles two snapshots, first the initiating party's.
    function reconciliationIdOf(bytes32 firstSnapshotId, bytes32 secondSnapshotId) public pure returns (bytes32) {
        return keccak256(abi.encode(firstSnapshotId, secondSnapshotId));
    }

    /// @notice Record the hash of the result the caller computed from two snapshots of one pair. The second party's
    /// result decides the run.
    function commitResult(bytes32 reconciliationId, bytes32 firstSnapshotId, bytes32 secondSnapshotId, bytes32 resultHash, uint32 breakCount)
        external
    {
        if (reconciliationIdOf(firstSnapshotId, secondSnapshotId) != reconciliationId) revert WrongReconciliationId();
        Snapshot storage a = _snapshots[firstSnapshotId];
        Snapshot storage b = _snapshots[secondSnapshotId];
        if (a.party == address(0)) revert NoSnapshot(firstSnapshotId);
        if (b.party == address(0)) revert NoSnapshot(secondSnapshotId);
        if (a.party != b.counterparty || b.party != a.counterparty) revert NotAPair();

        Run storage r = _runs[reconciliationId];
        if (msg.sender == a.party) {
            if (r.firstPartyResult != bytes32(0)) revert ResultAlreadyCommitted();
            r.firstPartyResult = resultHash;
        } else if (msg.sender == b.party) {
            if (r.secondPartyResult != bytes32(0)) revert ResultAlreadyCommitted();
            r.secondPartyResult = resultHash;
        } else {
            revert NotAParty();
        }
        r.firstSnapshotId = firstSnapshotId;
        r.secondSnapshotId = secondSnapshotId;
        r.breakCount = breakCount;
        emit ResultCommitted(reconciliationId, msg.sender, resultHash, breakCount);

        if (r.firstPartyResult != bytes32(0) && r.secondPartyResult != bytes32(0)) {
            bool agreed = r.firstPartyResult == r.secondPartyResult;
            r.state = agreed ? RunState.Agreed : RunState.Disagreed;
            emit ReconciliationDecided(reconciliationId, a.party, b.party, agreed);
        } else {
            r.state = RunState.OneResult;
        }
    }

    function getSnapshot(bytes32 snapshotId) external view returns (Snapshot memory) {
        return _snapshots[snapshotId];
    }

    function getRun(bytes32 reconciliationId) external view returns (Run memory) {
        return _runs[reconciliationId];
    }
}
