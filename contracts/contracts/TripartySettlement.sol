// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Triparty repo settlement: the agent's books
/// @notice The triparty terms between a collateral giver, a collateral receiver and a triparty agent
/// (task-triparty-terms-profile, wp-adr-triparty-terms-profile). The terms are a CDM document (cdm-ext TripartyTerms)
/// held by the three parties' services; only its hash is here. The giver proposes the terms with their hash; the
/// receiver and the agent each affirm the same hash, and the terms take effect when both have. Any of the three may
/// refuse a proposal (the giver withdraws it). One set of terms is proposed or in effect per giver, receiver and agent;
/// there is no amendment. The giver or the receiver may terminate terms in effect, once no repo is open and no collateral
/// is deposited under them.
///
/// Trade start (task-triparty-trade-start, wp-adr-triparty-trade-start). Under terms in effect the giver deposits tokens
/// in its free account for the terms, with its rank for each token, and may withdraw free tokens at any time. The giver
/// requests a repo with the hash of its cdm-ext TripartyRepoRequest; the receiver affirms the hash. The agent allocates
/// tokens and amounts from the free account with the hash of its cdm-ext TripartyAllocation, which carries the CDM repo.
/// The receiver settles the purchase by affirming the allocation hash: in one transaction the Purchase Price moves from
/// the receiver to the giver and the allocated tokens move from the giver's free account to the repo's account, which
/// the receiver holds by title. The receiver may refuse an allocation instead, and the agent allocates again. Any of the
/// three may cancel a repo before it settles.
///
/// Revaluation (task-triparty-revaluation, wp-adr-triparty-revaluation). The agent revalues a settled repo with the
/// hash of its cdm-ext TripartyRevaluation and the repo's new holding: the old holding returns to the giver's free
/// account and the new one is taken from it in the same transaction, so a top-up moves free tokens to the repo and a
/// release moves them back. An unchanged or uncovered revaluation passes the holding unchanged and only records its
/// hash. Each revaluation's hash and block are kept, so the giver and the receiver can read the chain as it was before.
///
/// Substitution (task-triparty-substitution, wp-adr-triparty-substitution). The giver records the hash of a request for
/// collateral back (or the agent, to remove an excess over a limit); the agent then substitutes it, replacing the
/// holding as a revaluation does, or declines it. Revaluations, substitutions and declines form one history per repo.
contract TripartySettlement {
    using SafeERC20 for IERC20;

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

    enum RepoState {
        None,
        Requested,
        Affirmed,
        Allocated,
        Settled,
        Cancelled
    }

    struct Repo {
        bytes32 termsId;
        bytes32 requestHash;
        address cash;
        uint256 purchasePrice;
        RepoState state;
        bytes32 allocationHash;
        uint64 requestedAt;
        uint64 settledAt;
    }

    struct Holding {
        address token;
        uint256 amount;
        uint256 rank;
    }

    uint256 private repoCount;
    mapping(bytes32 => Repo) private repos;
    mapping(bytes32 => bytes32[]) private reposOfTerms;
    mapping(bytes32 => uint256) private openRepos; // terms id => repos requested, affirmed, allocated or settled
    mapping(bytes32 => address[]) private depositTokens; // terms id => tokens ever deposited
    mapping(bytes32 => mapping(address => uint256)) private free; // terms id => token => free amount
    mapping(bytes32 => mapping(address => uint256)) private rankOf; // terms id => token => the giver's rank
    mapping(bytes32 => address[]) private allocTokens; // repo id => tokens allocated (proposed or held)
    mapping(bytes32 => uint256[]) private allocAmounts;

    event Deposited(bytes32 indexed termsId, address indexed token, uint256 amount, uint256 rank);
    event Withdrawn(bytes32 indexed termsId, address indexed token, uint256 amount);
    event RepoRequested(bytes32 indexed repoId, bytes32 indexed termsId, bytes32 requestHash, uint256 purchasePrice);
    event RepoRequestAffirmed(bytes32 indexed repoId);
    event RepoAllocated(bytes32 indexed repoId, bytes32 allocationHash);
    event AllocationRefused(bytes32 indexed repoId, bytes32 allocationHash);
    event PurchaseSettled(bytes32 indexed repoId, bytes32 allocationHash);
    event RepoCancelled(bytes32 indexed repoId, address indexed by);
    event RepoRevalued(bytes32 indexed repoId, bytes32 revaluationHash, uint256 index);
    event SubstitutionRequested(bytes32 indexed repoId, bytes32 requestHash, address indexed requester);
    event SubstitutionWithdrawn(bytes32 indexed repoId, bytes32 requestHash);
    event RepoSubstituted(bytes32 indexed repoId, bytes32 requestHash, bytes32 substitutionHash, uint256 index);
    event SubstitutionDeclined(bytes32 indexed repoId, bytes32 requestHash, bytes32 substitutionHash, uint256 index);

    uint8 public constant REVALUATION = 1;
    uint8 public constant SUBSTITUTION = 2;
    uint8 public constant DECLINED = 3;

    /// One change of a settled repo's holding by the agent: a revaluation, a substitution, or a declined substitution
    /// (which moves nothing). Each cdm-ext document names the one before it as its basis.
    struct Change {
        bytes32 hash;
        uint64 blockNumber;
        uint8 kind;
    }

    struct PendingSubstitution {
        bytes32 requestHash;
        address requester;
    }

    mapping(bytes32 => Change[]) private changes; // repo id => the agent's changes, oldest first
    mapping(bytes32 => PendingSubstitution) private pending; // repo id => the substitution request awaiting the agent

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
        require(openRepos[termsId] == 0, "TripartySettlement: repos open under the terms");
        address[] storage tokens = depositTokens[termsId];
        for (uint256 i = 0; i < tokens.length; i++) {
            require(free[termsId][tokens[i]] == 0, "TripartySettlement: collateral deposited under the terms");
        }
        t.state = TermsState.Terminated;
        emit TermsTerminated(termsId, msg.sender);
    }

    // --- deposits

    function deposit(bytes32 termsId, address token, uint256 amount, uint256 rank) external {
        Terms storage t = terms[termsId];
        require(t.state == TermsState.Effective, "TripartySettlement: not in effect");
        require(msg.sender == t.giver, "TripartySettlement: only the giver deposits");
        require(token != address(0) && amount > 0 && rank > 0, "TripartySettlement: no token, amount or rank");
        address[] storage tokens = depositTokens[termsId];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] != token) require(rankOf[termsId][tokens[i]] != rank, "TripartySettlement: rank taken");
        }
        if (rankOf[termsId][token] == 0) tokens.push(token);
        rankOf[termsId][token] = rank;
        free[termsId][token] += amount;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(termsId, token, amount, rank);
    }

    function withdraw(bytes32 termsId, address token, uint256 amount) external {
        require(msg.sender == terms[termsId].giver, "TripartySettlement: only the giver withdraws");
        require(amount > 0 && free[termsId][token] >= amount, "TripartySettlement: not free");
        free[termsId][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(termsId, token, amount);
    }

    // --- repos

    function requestRepo(bytes32 termsId, bytes32 requestHash, address cash, uint256 purchasePrice) external returns (bytes32 repoId) {
        Terms storage t = terms[termsId];
        require(t.state == TermsState.Effective, "TripartySettlement: not in effect");
        require(msg.sender == t.giver, "TripartySettlement: only the giver requests");
        require(requestHash != bytes32(0) && cash != address(0) && purchasePrice > 0, "TripartySettlement: no request");
        repoId = keccak256(abi.encode(address(this), "repo", ++repoCount));
        repos[repoId] = Repo(termsId, requestHash, cash, purchasePrice, RepoState.Requested, bytes32(0), uint64(block.timestamp), 0);
        reposOfTerms[termsId].push(repoId);
        openRepos[termsId] += 1;
        emit RepoRequested(repoId, termsId, requestHash, purchasePrice);
    }

    function affirmRequest(bytes32 repoId, bytes32 requestHash) external {
        Repo storage r = repos[repoId];
        require(r.state == RepoState.Requested, "TripartySettlement: not requested");
        require(msg.sender == terms[r.termsId].receiver, "TripartySettlement: only the receiver affirms");
        require(requestHash == r.requestHash, "TripartySettlement: request hash differs");
        r.state = RepoState.Affirmed;
        emit RepoRequestAffirmed(repoId);
    }

    function allocate(bytes32 repoId, bytes32 allocationHash, address[] calldata tokens, uint256[] calldata amounts) external {
        Repo storage r = repos[repoId];
        require(r.state == RepoState.Affirmed, "TripartySettlement: not affirmed");
        require(msg.sender == terms[r.termsId].agent, "TripartySettlement: only the agent allocates");
        require(allocationHash != bytes32(0), "TripartySettlement: no allocation hash");
        require(tokens.length > 0 && tokens.length == amounts.length, "TripartySettlement: no allocation");
        for (uint256 i = 0; i < tokens.length; i++) {
            require(amounts[i] > 0 && free[r.termsId][tokens[i]] >= amounts[i], "TripartySettlement: not free");
        }
        r.allocationHash = allocationHash;
        r.state = RepoState.Allocated;
        allocTokens[repoId] = tokens;
        allocAmounts[repoId] = amounts;
        emit RepoAllocated(repoId, allocationHash);
    }

    function refuseAllocation(bytes32 repoId) external {
        Repo storage r = repos[repoId];
        require(r.state == RepoState.Allocated, "TripartySettlement: not allocated");
        require(msg.sender == terms[r.termsId].receiver, "TripartySettlement: only the receiver refuses an allocation");
        emit AllocationRefused(repoId, r.allocationHash);
        r.allocationHash = bytes32(0);
        r.state = RepoState.Affirmed;
        delete allocTokens[repoId];
        delete allocAmounts[repoId];
    }

    function settlePurchase(bytes32 repoId, bytes32 allocationHash) external {
        Repo storage r = repos[repoId];
        require(r.state == RepoState.Allocated, "TripartySettlement: not allocated");
        Terms storage t = terms[r.termsId];
        require(msg.sender == t.receiver, "TripartySettlement: only the receiver settles");
        require(allocationHash == r.allocationHash, "TripartySettlement: allocation hash differs");
        address[] storage tokens = allocTokens[repoId];
        uint256[] storage amounts = allocAmounts[repoId];
        for (uint256 i = 0; i < tokens.length; i++) {
            require(free[r.termsId][tokens[i]] >= amounts[i], "TripartySettlement: not free");
            free[r.termsId][tokens[i]] -= amounts[i];
        }
        r.state = RepoState.Settled;
        r.settledAt = uint64(block.timestamp);
        IERC20(r.cash).safeTransferFrom(t.receiver, t.giver, r.purchasePrice);
        emit PurchaseSettled(repoId, allocationHash);
    }

    function revalue(bytes32 repoId, bytes32 revaluationHash, address[] calldata tokens, uint256[] calldata amounts) external {
        Repo storage r = agentsSettledRepo(repoId);
        require(revaluationHash != bytes32(0), "TripartySettlement: no revaluation hash");
        replaceHolding(repoId, r.termsId, tokens, amounts);
        changes[repoId].push(Change(revaluationHash, uint64(block.number), REVALUATION));
        emit RepoRevalued(repoId, revaluationHash, changes[repoId].length - 1);
    }

    /// The giver recalls collateral, or the agent asks to remove an excess over a limit (wp-adr-triparty-substitution).
    function requestSubstitution(bytes32 repoId, bytes32 requestHash) external {
        Repo storage r = repos[repoId];
        require(r.state == RepoState.Settled, "TripartySettlement: not settled");
        Terms storage t = terms[r.termsId];
        require(msg.sender == t.giver || msg.sender == t.agent, "TripartySettlement: only the giver or the agent");
        require(requestHash != bytes32(0), "TripartySettlement: no request hash");
        require(pending[repoId].requestHash == bytes32(0), "TripartySettlement: a substitution is pending");
        pending[repoId] = PendingSubstitution(requestHash, msg.sender);
        emit SubstitutionRequested(repoId, requestHash, msg.sender);
    }

    function withdrawSubstitution(bytes32 repoId) external {
        PendingSubstitution memory p = pending[repoId];
        require(p.requestHash != bytes32(0), "TripartySettlement: nothing pending");
        require(msg.sender == p.requester, "TripartySettlement: only the requester");
        delete pending[repoId];
        emit SubstitutionWithdrawn(repoId, p.requestHash);
    }

    /// The agent substitutes the pending request: the new holding replaces the old as in a revaluation.
    function substitute(bytes32 repoId, bytes32 substitutionHash, address[] calldata tokens, uint256[] calldata amounts) external {
        Repo storage r = agentsSettledRepo(repoId);
        bytes32 requestHash = takePending(repoId, substitutionHash);
        replaceHolding(repoId, r.termsId, tokens, amounts);
        changes[repoId].push(Change(substitutionHash, uint64(block.number), SUBSTITUTION));
        emit RepoSubstituted(repoId, requestHash, substitutionHash, changes[repoId].length - 1);
    }

    /// The agent declines the pending request; the declined document is kept and nothing moves.
    function declineSubstitution(bytes32 repoId, bytes32 substitutionHash) external {
        agentsSettledRepo(repoId);
        bytes32 requestHash = takePending(repoId, substitutionHash);
        changes[repoId].push(Change(substitutionHash, uint64(block.number), DECLINED));
        emit SubstitutionDeclined(repoId, requestHash, substitutionHash, changes[repoId].length - 1);
    }

    function agentsSettledRepo(bytes32 repoId) private view returns (Repo storage r) {
        r = repos[repoId];
        require(r.state == RepoState.Settled, "TripartySettlement: not settled");
        require(msg.sender == terms[r.termsId].agent, "TripartySettlement: only the agent");
    }

    function takePending(bytes32 repoId, bytes32 substitutionHash) private returns (bytes32 requestHash) {
        requestHash = pending[repoId].requestHash;
        require(requestHash != bytes32(0), "TripartySettlement: nothing pending");
        require(substitutionHash != bytes32(0), "TripartySettlement: no substitution hash");
        delete pending[repoId];
    }

    /// The old holding returns to the giver's free account and the new one is taken from it.
    function replaceHolding(bytes32 repoId, bytes32 termsId, address[] calldata tokens, uint256[] calldata amounts) private {
        require(tokens.length > 0 && tokens.length == amounts.length, "TripartySettlement: no holding");
        address[] storage held = allocTokens[repoId];
        uint256[] storage heldAmounts = allocAmounts[repoId];
        for (uint256 i = 0; i < held.length; i++) free[termsId][held[i]] += heldAmounts[i];
        for (uint256 i = 0; i < tokens.length; i++) {
            require(amounts[i] > 0 && rankOf[termsId][tokens[i]] > 0, "TripartySettlement: not a deposited token");
            for (uint256 j = 0; j < i; j++) require(tokens[j] != tokens[i], "TripartySettlement: token repeated");
            require(free[termsId][tokens[i]] >= amounts[i], "TripartySettlement: not free");
            free[termsId][tokens[i]] -= amounts[i];
        }
        allocTokens[repoId] = tokens;
        allocAmounts[repoId] = amounts;
    }

    function cancelRepo(bytes32 repoId) external {
        Repo storage r = repos[repoId];
        require(r.state == RepoState.Requested || r.state == RepoState.Affirmed || r.state == RepoState.Allocated,
            "TripartySettlement: not cancellable");
        Terms storage t = terms[r.termsId];
        require(msg.sender == t.giver || msg.sender == t.receiver || msg.sender == t.agent, "TripartySettlement: not a party");
        r.state = RepoState.Cancelled;
        openRepos[r.termsId] -= 1;
        delete allocTokens[repoId];
        delete allocAmounts[repoId];
        emit RepoCancelled(repoId, msg.sender);
    }

    // --- views

    function getRepo(bytes32 repoId) external view returns (Repo memory) {
        return repos[repoId];
    }

    function reposOf(bytes32 termsId) external view returns (bytes32[] memory) {
        return reposOfTerms[termsId];
    }

    /// The tokens and amounts of a repo: proposed by the agent while Allocated, held for the receiver once Settled.
    function allocationOf(bytes32 repoId) external view returns (address[] memory tokens, uint256[] memory amounts) {
        return (allocTokens[repoId], allocAmounts[repoId]);
    }

    /// The agent's changes of a repo's holding, oldest first, each with its block and kind.
    function changesOf(bytes32 repoId) external view returns (Change[] memory) {
        return changes[repoId];
    }

    /// The substitution request awaiting the agent, if any (a zero hash otherwise).
    function pendingSubstitutionOf(bytes32 repoId) external view returns (PendingSubstitution memory) {
        return pending[repoId];
    }

    /// The giver's free account under the terms, with its ranks.
    function freeOf(bytes32 termsId) external view returns (Holding[] memory holdings) {
        address[] storage tokens = depositTokens[termsId];
        holdings = new Holding[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            holdings[i] = Holding(tokens[i], free[termsId][tokens[i]], rankOf[termsId][tokens[i]]);
        }
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
