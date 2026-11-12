// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Triparty repo settlement: the agent's books
/// @notice The triparty terms between a collateral giver, a collateral receiver and a triparty agent
/// (task-triparty-terms-profile, wp-adr-triparty-terms-profile). The terms are a CDM document (cdm-ext TripartyTerms)
/// held by the three parties' services; only its hash is here. The giver proposes the terms with their hash; the
/// receiver and the agent each affirm the same hash, and the terms take effect when both have. Any of the three may
/// refuse a proposal (the giver withdraws it). One set of terms is proposed or in effect per giver, receiver and agent;
/// there is no amendment. The giver or the receiver may terminate terms in effect. Deposits, allocation and release of
/// collateral by the agent come in later tasks (task-triparty-trade-start).
contract TripartySettlement {
    enum TermsState {
        None,
        Proposed,
        Effective,
        Refused,
        Terminated
    }

    struct Terms {
        address giver;
        address receiver;
        address agent;
        bytes32 termsHash;
        TermsState state;
        bool receiverAffirmed;
        bool agentAffirmed;
        uint64 proposedAt;
        uint64 effectiveAt;
    }

    uint256 private count;
    mapping(bytes32 => Terms) private terms;
    mapping(bytes32 => bytes32) private current; // keccak(giver, receiver, agent) => terms id
    mapping(address => bytes32[]) private ofParty;

    event TermsProposed(bytes32 indexed termsId, address indexed giver, address indexed receiver, address agent, bytes32 termsHash);
    event TermsAffirmed(bytes32 indexed termsId, address indexed by);
    event TermsEffective(bytes32 indexed termsId);
    event TermsRefused(bytes32 indexed termsId, address indexed by);
    event TermsTerminated(bytes32 indexed termsId, address indexed by);

    function _trio(address giver, address receiver, address agent) private pure returns (bytes32) {
        return keccak256(abi.encode(giver, receiver, agent));
    }

    function proposeTerms(address receiver, address agent, bytes32 termsHash) external returns (bytes32 termsId) {
        address giver = msg.sender;
        require(receiver != address(0) && agent != address(0), "TripartySettlement: zero party");
        require(giver != receiver && giver != agent && receiver != agent, "TripartySettlement: three parties");
        require(termsHash != bytes32(0), "TripartySettlement: no terms hash");
        bytes32 trio = _trio(giver, receiver, agent);
        bytes32 open = current[trio];
        if (open != bytes32(0)) {
            TermsState s = terms[open].state;
            require(s == TermsState.Refused || s == TermsState.Terminated, "TripartySettlement: terms already proposed or in effect");
        }
        termsId = keccak256(abi.encode(address(this), ++count));
        terms[termsId] = Terms(giver, receiver, agent, termsHash, TermsState.Proposed, false, false, uint64(block.timestamp), 0);
        current[trio] = termsId;
        ofParty[giver].push(termsId);
        ofParty[receiver].push(termsId);
        ofParty[agent].push(termsId);
        emit TermsProposed(termsId, giver, receiver, agent, termsHash);
    }

    function affirmTerms(bytes32 termsId, bytes32 termsHash) external {
        Terms storage t = terms[termsId];
        require(t.state == TermsState.Proposed, "TripartySettlement: not proposed");
        require(termsHash == t.termsHash, "TripartySettlement: terms hash differs");
        if (msg.sender == t.receiver) {
            require(!t.receiverAffirmed, "TripartySettlement: already affirmed");
            t.receiverAffirmed = true;
        } else if (msg.sender == t.agent) {
            require(!t.agentAffirmed, "TripartySettlement: already affirmed");
            t.agentAffirmed = true;
        } else {
            revert("TripartySettlement: only the receiver or the agent affirms");
        }
        emit TermsAffirmed(termsId, msg.sender);
        if (t.receiverAffirmed && t.agentAffirmed) {
            t.state = TermsState.Effective;
            t.effectiveAt = uint64(block.timestamp);
            emit TermsEffective(termsId);
        }
    }

    function refuseTerms(bytes32 termsId) external {
        Terms storage t = terms[termsId];
        require(t.state == TermsState.Proposed, "TripartySettlement: not proposed");
        require(msg.sender == t.giver || msg.sender == t.receiver || msg.sender == t.agent, "TripartySettlement: not a party");
        t.state = TermsState.Refused;
        emit TermsRefused(termsId, msg.sender);
    }

    function terminateTerms(bytes32 termsId) external {
        Terms storage t = terms[termsId];
        require(t.state == TermsState.Effective, "TripartySettlement: not in effect");
        require(msg.sender == t.giver || msg.sender == t.receiver, "TripartySettlement: only the giver or the receiver terminates");
        t.state = TermsState.Terminated;
        emit TermsTerminated(termsId, msg.sender);
    }

    function getTerms(bytes32 termsId) external view returns (Terms memory) {
        return terms[termsId];
    }

    function currentTerms(address giver, address receiver, address agent) external view returns (bytes32) {
        return current[_trio(giver, receiver, agent)];
    }

    function termsOf(address party) external view returns (bytes32[] memory) {
        return ofParty[party];
    }
}
