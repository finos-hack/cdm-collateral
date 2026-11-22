// Besu adapter behind a ledger-neutral interface (concept-asr-ledger-neutrality, ADR wp-adr-prototype-ledgers).
// A BesuAdapter instance holds exactly one participant's account (its Besu node key) and signs every write with it.
// QBFT gives immediate per-block finality, so a mined receipt is final (concept-asr-settlement-finality): each write
// waits for its receipt before returning. The chain charges no gas (genesis zeroBaseFee, --min-gas-price=0), so every
// write is a legacy transaction with gasPrice 0.
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, http, webSocket, getAddress, keccak256, parseAbi, toEventSelector, toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { loadNodeKey, loadRegistry } from "./registry.ts";
import type { Registry } from "./registry.ts";

// Call kinds and response types match CollateralTypes.sol (IM=0, VM=1, Return=2; Full=0, Partial=1, Dispute=2).
export const CallKind = { IM: 0, VM: 1, Return: 2 } as const;
export const ResponseType = { Full: 0, Partial: 1, Dispute: 2 } as const;
export const CallStateName = ["none", "issued", "agreed", "partially agreed", "disputed", "settled", "settled (agreed part)", "cancelled"];
export const ProposalStateName = ["none", "proposed", "accepted", "rejected", "cancelled"];

// The MarginCall lifecycle events, in fold order, each with the CDM step it maps to. Shared by the historical scan
// (callSteps) and the live subscription (watchSteps).
const STEP_EVENTS: { name: string; step: string }[] = [
  { name: "CallIssued", step: "IssueCall" },
  { name: "CallAnswered", step: "RespondToCall" },
  { name: "CollateralProposed", step: "ProposeCollateral" },
  { name: "ProposalDecided", step: "DecideProposal" },
  { name: "CallSettled", step: "SettleCall" },
  { name: "CallWithdrawn", step: "WithdrawCall" },
  { name: "CancellationRequested", step: "RequestCancellation" },
  { name: "CancellationDecided", step: "DecideCancellation" },
];

export interface StepEvent {
  callId: Hex;
  step: string;
  cdmHash: Hex;
  block: string;
  logIndex: number;
}

/** A settlement or oracle-feed event pushed alongside the lifecycle steps: Returned and Enforced from the collateral
 * control contract (flow-return, flow-default-enforcement), DefaultPublished from the oracle feed. */
export interface LedgerEvent {
  event:
    | "Returned"
    | "Enforced"
    | "DefaultPublished"
    | "ClosedOut"
    | "Reclaimed"
    | "SubstitutionRequested"
    | "SubstitutionDecided"
    | "SubstitutionSettled"
    | "InterestStated"
    | "InterestSettled"
    | "AmendmentProposed"
    | "AmendmentDecided"
    | "TermsAmendmentProposed"
    | "TermsAmendmentDecided"
    | "RepoBooked"
    | "RepoAffirmed"
    | "RepoInstructed"
    | "RepoSettled"
    | "SettlementNetted"
    | "RulebookPublished"
    | "MemberJoined"
    | "MemberLeft"
    | "RulebookEffective"
    | "ClearingSubmitted"
    | "ClearingAffirmed"
    | "ClearingAccepted"
    | "ClearingRefused"
    | "ClearedLegInstructed"
    | "ClearedRepoSettled"
    | "RegisterConfirmed";
  /** RegisterConfirmed: the ledger transaction the record keeper's register now shows, and the token. */
  txHash?: Hex;
  token?: Address;
  /** RepoBooked, RepoAffirmed, RepoInstructed, RepoSettled (flow-repo-purchase-repurchase). */
  repoId?: Hex;
  callId?: Hex;
  /** ClosedOut (flow-close-out-netting). */
  closeOutId?: Hex;
  /** Reclaimed (two-way initial margin, wp-adr-two-way-im). */
  reclaimId?: Hex;
  /** SubstitutionRequested, SubstitutionDecided, SubstitutionSettled (flow-substitution). */
  substitutionId?: Hex;
  /** InterestStated, InterestSettled (flow-interest-on-cash). */
  interestId?: Hex;
  /** SettlementNetted (flow-settlement-netting). */
  nettingId?: Hex;
  /** AmendmentProposed, AmendmentDecided (flow-agreement-amendment). */
  amendmentId?: Hex;
  consent?: boolean;
  cdmHash?: Hex;
  party?: Address;
  inDefault?: boolean;
  block: string;
  logIndex: number;
}

/** A substitution of pledged initial margin as the collateral control contract holds it (flow-substitution). */
export interface OnChainSubstitution {
  pledgor: Address;
  securedParty: Address;
  state: number; // SubstitutionState: None, Requested, Consented, Refused, Settled
  requestCdmHash: Hex;
  decisionCdmHash: Hex;
  settleCdmHash: Hex;
}

/** One substitution step as substitutionSteps reads it from the chain. */
export interface SubstitutionStep {
  step: "request" | "consent" | "settle";
  event: string;
  cdmHash: Hex;
  consent?: boolean;
  block: string;
  /** Block time, epoch seconds: the CDM event date and timestamp of the step. */
  timestamp: number;
  logIndex: number;
  txHash: Hex;
}

/** One close-out on default as the ClosedOut event records it (flow-close-out-netting). */
export interface CloseOutRecord {
  closeOutId: Hex;
  securedParty: Address;
  pledgor: Address;
  owed: bigint;
  applied: bigint;
  cdmHash: Hex;
  block: string;
  txHash: Hex;
}

/** Interest on cash collateral for one period as the control contract holds it (flow-interest-on-cash). */
export interface InterestRecord {
  interestId: Hex;
  securedParty: Address;
  pledgor: Address;
  cashToken: Address;
  /** Units of the cash token: positive from the secured party to the pledgor, negative the other way. */
  amount: bigint;
  state: number; // InterestState: None, Stated, Settled
  cdmHash: Hex;
  block: string;
  txHash: Hex;
}

/** One settlement netting (flow-settlement-netting): the calls and interest statements settled by one transfer of the
 * cash token. settledBy pays amount (units of the cash token) to counterparty when it is above zero. */
export interface NettingRecord {
  nettingId: Hex;
  settledBy: Address;
  counterparty: Address;
  cashToken: Address;
  amount: bigint;
  cdmHash: Hex;
  callIds: Hex[];
  interestIds: Hex[];
  block: string;
  txHash: Hex;
}

/** One token's eligibility and haircut in an amendment, or as it applies to a pair (flow-agreement-amendment). */
export interface HaircutTermArg {
  token: Address;
  eligible: boolean;
  haircutBps: number;
}

/** An amendment of the agreement terms as the control contract holds it (flow-agreement-amendment). */
export interface OnChainAmendment {
  pledgor: Address;
  securedParty: Address;
  proposer: Address;
  state: number; // AmendmentState: None, Proposed, Agreed, Refused
  beforeHash: Hex;
  proposeCdmHash: Hex;
  decisionCdmHash: Hex;
  terms: HaircutTermArg[];
}

/** One Transfer of a Registered or Claim token, and whether the record keeper has confirmed its transaction. */
export interface RegisterTransfer {
  txHash: Hex;
  block: string;
  logIndex: number;
  from: Address;
  to: Address;
  value: string;
  confirmed: boolean;
}

/**
 * A transaction of a repo, securities loan or triparty contract that moved a Registered or Claim token
 * (task-authoritative-record-other-flows). recordId is the first indexed topic of the flow contract's logs in it: the
 * repoId, loanId or triparty termsId. txLogs has the shape of a CallStep's, holding the token Transfer logs.
 */
export interface RegisterMovement {
  recordId: Hex;
  txHash: Hex;
  block: string;
  events: string[];
  status: "Final";
  txLogs: { contract: string; logIndex: number; event: "Transfer" }[];
}

/** One RegisterConfirmed event: the record keeper's register shows the token movements of transaction txHash. */
export interface RegisterConfirmation {
  txHash: Hex;
  token: Address;
  ref: string;
  block: string;
  /** The transaction that carried the confirmation. */
  confirmationTx: Hex;
}

/** One lifecycle step as callSteps reads it from the chain, with what the CDM LedgerAnchor needs (G25). */
export interface CallStep {
  step: string;
  event: string;
  cdmHash: Hex;
  block: string;
  logIndex: number;
  txHash: Hex;
  contract: string;
  network: { name: string; platform: string; chainId: number };
  status: "Final" | "Reverted";
  /** The other events of the same transaction; `event` is absent for an event this gateway does not know. */
  txLogs: { contract: string; logIndex: number; event?: string }[];
}

// Names of the events a step transaction can carry, by topic 0, for the txLogs of callSteps.
const EVENT_BY_TOPIC = new Map<string, string>(
  [
    "CallIssued(bytes32,address,address,uint8,uint256,bytes32)",
    "CallAnswered(bytes32,uint8,uint256,uint256,bytes32)",
    "CollateralProposed(bytes32,uint256,bytes32)",
    "ProposalDecided(bytes32,uint256,bool,bytes32)",
    "CallSettled(bytes32,bool,bytes32)",
    "CallWithdrawn(bytes32,bytes32)",
    "CancellationRequested(bytes32,address,bytes32)",
    "CancellationDecided(bytes32,bool,bytes32)",
    "CallReplaced(bytes32,bytes32)",
    "Pledged(bytes32,address,address,uint256)",
    "Transferred(bytes32,address,address,uint256)",
    "Returned(bytes32,address,address)",
    "Enforced(bytes32,address,address,bytes32)",
    "RegisterConfirmed(bytes32,address,string)",
    "ClosedOut(bytes32,address,address,uint256,uint256,bytes32)",
    "Reclaimed(bytes32,address,address,bytes32)",
    "SubstitutionRequested(bytes32,address,address,bytes32)",
    "SubstitutionDecided(bytes32,bool,bytes32)",
    "SubstitutionSettled(bytes32,bytes32)",
    "InterestStated(bytes32,address,address,address,int256,bytes32)",
    "InterestSettled(bytes32,address,address,uint256)",
    "SettlementNetted(bytes32,address,address,address,uint256,bytes32)",
    "AmendmentProposed(bytes32,address,address,address,bytes32)",
    "AmendmentDecided(bytes32,bool,bytes32)",
    "TermsAmendmentProposed(bytes32,bytes32,address,address,bytes32)",
    "TermsAmendmentDecided(bytes32,bytes32,bool,bytes32)",
    "RepoBooked(bytes32,address,address,bytes32)",
    "RepoAffirmed(bytes32,address,bytes32)",
    "RepoInstructed(bytes32,uint8,address,bytes32)",
    "RepoSettled(bytes32,uint8,bytes32)",
    "LoanBooked(bytes32,address,address,bytes32)",
    "LoanAffirmed(bytes32,address,bytes32)",
    "LoanDeliveryInstructed(bytes32,address,bytes32)",
    "LoanDelivered(bytes32,bytes32)",
    "LoanReturnInstructed(bytes32,address,uint256,uint256,bytes32)",
    "LoanReturned(bytes32,uint256,uint256,bytes32,bool)",
    "LoanRecalled(bytes32,uint256,uint32,bytes32)",
    "LoanRecallWithdrawn(bytes32,bytes32,bytes32)",
    "LoanRecallReduced(bytes32,bytes32,uint256)",
    "LoanSubstitutionRequested(bytes32,address,uint256,bytes32)",
    "LoanSubstituted(bytes32,address,uint256,bytes32)",
    "LoanSubstitutionRefused(bytes32,bytes32)",
    "LoanBilled(bytes32,address,address,uint32,uint256,bytes32)",
    "LoanBillPaid(bytes32,address,uint32,uint256,bytes32)",
    "LoanBillRefused(bytes32,bytes32)",
    "Transfer(address,address,uint256)",
    "Approval(address,address,uint256)",
  ].map((sig) => [toEventSelector(sig).toLowerCase(), sig.slice(0, sig.indexOf("("))]),
);

/** The on-chain key of a master agreement kind (wp-adr-repo-gmra-terms): keccak256 of its name, for example "GMRA". */
export const kindOf = (kind: string): Hex => keccak256(toHex(kind));

export interface AssetArg {
  token: Address;
  qty: bigint;
}

export interface OnChainCall {
  kind: number;
  from: Address;
  to: Address;
  amount: bigint;
  agreed: bigint;
  disputed: bigint;
  deadline: bigint;
  state: number;
  cdmHash: Hex;
  proposalCount: bigint;
  activeProposal: bigint;
  settleCdmHash: Hex;
  /** The party whose cancellation request is pending; the zero address when none (task-csa-call-cancellation). */
  cancellationRequestedBy: Address;
  /** The cancelled call this call replaces, and the call that replaces this one; zero when none (task-csa-call-replacement). */
  replaces?: Hex;
  replacementOf?: Hex;
  /** The settlement netting the call settled in; zero when none (flow-settlement-netting). */
  nettedIn?: Hex;
}

const marginCallAbi = parseAbi([
  "struct Asset { address token; uint256 qty; }",
  "struct Call { uint8 kind; address from; address to; uint256 amount; uint256 agreed; uint256 disputed; uint64 deadline; uint8 state; bytes32 cdmHash; uint256 proposalCount; uint256 activeProposal; bytes32 settleCdmHash; address cancellationRequestedBy; }",
  "struct Proposal { uint8 state; bytes32 cdmHash; bytes32 decisionCdmHash; }",
  "function issueCall(bytes32 callId, uint8 kind, address to, uint256 amount, uint64 deadline, bytes32 cdmHash)",
  "function respond(bytes32 callId, uint8 response, uint256 agreed, bytes32 cdmHash)",
  "function propose(bytes32 callId, Asset[] assets, bytes32 cdmHash) returns (uint256 proposalId)",
  "function decideProposal(bytes32 callId, uint256 proposalId, bool accept, bytes32 cdmHash)",
  "function getCall(bytes32 callId) view returns (Call)",
  "function withdrawCall(bytes32 callId, bytes32 cdmHash)",
  "function issueReplacementCall(bytes32 callId, bytes32 replacedCallId, uint8 kind, address to, uint256 amount, uint64 deadline, bytes32 cdmHash)",
  "function replaces(bytes32 callId) view returns (bytes32)",
  "function replacementOf(bytes32 callId) view returns (bytes32)",
  "function requestCancellation(bytes32 callId, bytes32 cdmHash)",
  "function decideCancellation(bytes32 callId, bool accept, bytes32 cdmHash)",
  "function getProposal(bytes32 callId, uint256 proposalId) view returns (Proposal)",
  "function getProposalAssets(bytes32 callId, uint256 proposalId) view returns (Asset[])",
  "event CallIssued(bytes32 indexed callId, address indexed from, address indexed to, uint8 kind, uint256 amount, bytes32 cdmHash)",
  "event CallAnswered(bytes32 indexed callId, uint8 response, uint256 agreed, uint256 disputed, bytes32 cdmHash)",
  "event CollateralProposed(bytes32 indexed callId, uint256 indexed proposalId, bytes32 cdmHash)",
  "event ProposalDecided(bytes32 indexed callId, uint256 indexed proposalId, bool accepted, bytes32 cdmHash)",
  "event CallSettled(bytes32 indexed callId, bool disputedRemains, bytes32 cdmHash)",
  "event CallWithdrawn(bytes32 indexed callId, bytes32 cdmHash)",
  "event CancellationRequested(bytes32 indexed callId, address indexed by, bytes32 cdmHash)",
  "event CancellationDecided(bytes32 indexed callId, bool accepted, bytes32 cdmHash)",
  "event CallReplaced(bytes32 indexed replacedCallId, bytes32 indexed callId)",
]);

const controlAbi = parseAbi([
  "struct Asset { address token; uint256 qty; }",
  "function pledge(bytes32 callId, uint256 proposalId, bytes32 cdmHash)",
  "function settleByTransfer(bytes32 callId, uint256 proposalId, bytes32 cdmHash)",
  "function returnCollateral(bytes32 callId, Asset[] release, bytes32 cdmHash)",
  "function returnByTransfer(bytes32 callId, Asset[] assets, bytes32 cdmHash)",
  "struct Substitution { address pledgor; address securedParty; uint8 state; bytes32 requestCdmHash; bytes32 decisionCdmHash; bytes32 settleCdmHash; }",
  "function enforce(bytes32 callId, bytes32 cdmHash)",
  "function closeOut(bytes32 closeOutId, address pledgor, uint256 owed, bytes32 cdmHash)",
  "function reclaim(bytes32 reclaimId, address securedParty, bytes32 cdmHash)",
  "function requestSubstitution(bytes32 substitutionId, address securedParty, Asset[] original, Asset[] substitute, bytes32 cdmHash)",
  "function decideSubstitution(bytes32 substitutionId, bool consent, bytes32 cdmHash)",
  "function settleSubstitution(bytes32 substitutionId, bytes32 cdmHash)",
  "function getSubstitution(bytes32 substitutionId) view returns (Substitution)",
  "function getSubstitutionAssets(bytes32 substitutionId) view returns (Asset[] original, Asset[] substitute)",
  "struct Eligibility { bool eligible; uint16 haircutBps; }",
  "struct HaircutTerm { address token; bool eligible; uint16 haircutBps; }",
  "struct Amendment { address pledgor; address securedParty; address proposer; uint8 state; bytes32 beforeHash; bytes32 proposeCdmHash; bytes32 decisionCdmHash; }",
  "function proposeAmendment(bytes32 amendmentId, address pledgor, address securedParty, HaircutTerm[] terms, bytes32 beforeHash, bytes32 cdmHash)",
  "function decideAmendment(bytes32 amendmentId, bool consent, bytes32 cdmHash)",
  "function getAmendment(bytes32 amendmentId) view returns (Amendment amendment, HaircutTerm[] terms)",
  "function eligibilityFor(address pledgor, address securedParty, address token) view returns (Eligibility)",
  "function agreementHash(address pledgor, address securedParty) view returns (bytes32)",
  "function pendingAmendment(address pledgor, address securedParty) view returns (bytes32)",
  "function proposeTermsAmendment(bytes32 amendmentId, bytes32 kind, address counterparty, bytes32 beforeHash, bytes32 cdmHash)",
  "function decideTermsAmendment(bytes32 amendmentId, bool consent, bytes32 cdmHash)",
  "function pairKey(address x, address y) view returns (bytes32)",
  "function termsHash(bytes32 kind, bytes32 pair) view returns (bytes32)",
  "function pendingTermsAmendment(bytes32 kind, bytes32 pair) view returns (bytes32)",
  "function amendmentKind(bytes32 amendmentId) view returns (bytes32)",
  "struct InterestStatement { address pledgor; address securedParty; address cashToken; int256 amount; uint8 state; bytes32 cdmHash; }",
  "function stateInterest(bytes32 interestId, address pledgor, address cashToken, int256 amount, bytes32 cdmHash)",
  "function payInterest(bytes32 interestId)",
  "function getInterest(bytes32 interestId) view returns (InterestStatement)",
  "function stateInterestForNetting(bytes32 interestId, address pledgor, address cashToken, int256 amount, bytes32 cdmHash)",
  "struct Netting { address payer; address receiver; address cashToken; uint256 amount; bytes32 cdmHash; }",
  "function settleNetted(bytes32 nettingId, bytes32[] callIds, bytes32[] callCdmHashes, bytes32[] interestIds, address cashToken, bytes32 cdmHash)",
  "function getNetting(bytes32 nettingId) view returns (Netting netting, bytes32[] callIds, bytes32[] interestIds)",
  "function nettedIn(bytes32 id) view returns (bytes32)",
  "event SettlementNetted(bytes32 indexed nettingId, address indexed settledBy, address indexed counterparty, address cashToken, uint256 amount, bytes32 cdmHash)",
  "function pledgedBalance(address pledgor, address securedParty, address token) view returns (uint256)",
  "function pledgedTokens(address pledgor, address securedParty) view returns (address[])",
  "event Returned(bytes32 indexed callId, address indexed securedParty, address indexed pledgor)",
  "event Enforced(bytes32 indexed callId, address indexed securedParty, address indexed pledgor, bytes32 cdmHash)",
  "event ClosedOut(bytes32 indexed closeOutId, address indexed securedParty, address indexed pledgor, uint256 owed, uint256 applied, bytes32 cdmHash)",
  "event Reclaimed(bytes32 indexed reclaimId, address indexed pledgor, address indexed securedParty, bytes32 cdmHash)",
  "event SubstitutionRequested(bytes32 indexed substitutionId, address indexed pledgor, address indexed securedParty, bytes32 cdmHash)",
  "event SubstitutionDecided(bytes32 indexed substitutionId, bool consent, bytes32 cdmHash)",
  "event SubstitutionSettled(bytes32 indexed substitutionId, bytes32 cdmHash)",
  "event AmendmentProposed(bytes32 indexed amendmentId, address indexed pledgor, address indexed securedParty, address proposer, bytes32 cdmHash)",
  "event AmendmentDecided(bytes32 indexed amendmentId, bool consent, bytes32 cdmHash)",
  "event TermsAmendmentProposed(bytes32 indexed amendmentId, bytes32 indexed kind, address indexed proposer, address counterparty, bytes32 cdmHash)",
  "event TermsAmendmentDecided(bytes32 indexed amendmentId, bytes32 indexed kind, bool consent, bytes32 cdmHash)",
  "event InterestStated(bytes32 indexed interestId, address indexed securedParty, address indexed pledgor, address cashToken, int256 amount, bytes32 cdmHash)",
  "event InterestSettled(bytes32 indexed interestId, address indexed payer, address indexed payee, uint256 amount)",
]);

const oracleAbi = parseAbi([
  "function setDefault(address party, bool inDefault)",
  "function isDefaulted(address party) view returns (bool)",
  "function publishPrice(address token, uint256 priceScaled)",
  "function price(address token) view returns (uint256)",
  "function hasPrice(address token) view returns (bool)",
  "function publisher() view returns (address)",
  "event DefaultPublished(address indexed party, bool inDefault)",
]);

// flow-reconciliation (wp-adr-reconciliation-scope): hashes of the parties' trade snapshots and of their results.
const reconciliationAbi = parseAbi([
  "function commitSnapshot(bytes32 snapshotId, address counterparty, bytes32 snapshotHash)",
  "function commitResult(bytes32 reconciliationId, bytes32 firstSnapshotId, bytes32 secondSnapshotId, bytes32 resultHash, uint32 breakCount)",
  "function reconciliationIdOf(bytes32 firstSnapshotId, bytes32 secondSnapshotId) pure returns (bytes32)",
  "function getSnapshot(bytes32 snapshotId) view returns ((address party, address counterparty, bytes32 snapshotHash, uint64 committedAt))",
  "function getRun(bytes32 reconciliationId) view returns ((bytes32 firstSnapshotId, bytes32 secondSnapshotId, bytes32 firstPartyResult, bytes32 secondPartyResult, uint32 breakCount, uint8 state))",
  "event SnapshotCommitted(bytes32 indexed snapshotId, address indexed party, address indexed counterparty, bytes32 snapshotHash)",
  "event ResultCommitted(bytes32 indexed reconciliationId, address indexed party, bytes32 resultHash, uint32 breakCount)",
  "event ReconciliationDecided(bytes32 indexed reconciliationId, address indexed firstParty, address indexed secondParty, bool agreed)",
]);

export const RunStateName = ["none", "one result", "agreed", "disagreed"];

// flow-repo-purchase-repurchase (wp-adr-repo-purchase-repurchase): a term repo's trade hash, its amounts, and the
// delivery-versus-payment settlement of its purchase and repurchase.
const repoAbi = parseAbi([
  "function book(bytes32 repoId, address buyer, address security, uint256 quantity, address cash, uint256 purchasePrice, uint256 repurchasePrice, bytes32 tradeHash)",
  "function bookBuySellBack(bytes32 repoId, address buyer, address security, uint256 quantity, address cash, uint256 purchasePrice, uint256 repurchasePrice, bytes32 tradeHash)",
  "function isBuySellBack(bytes32 repoId) view returns (bool)",
  "function incomeDeduction(bytes32 repoId) view returns (uint256)",
  "function affirm(bytes32 repoId, bytes32 tradeHash)",
  "function instruct(bytes32 repoId, uint8 phase, bytes32 cdmHash)",
  "function instructReprice(bytes32 repoId, bytes32 cdmHash, uint256 newPurchasePrice, uint256 newRepurchasePrice, int256 cashFromSeller)",
  "function instructAdjustment(bytes32 repoId, bytes32 cdmHash, uint256 newQuantity, uint256 newRepurchasePrice, uint256 accruedFromSeller)",
  "function instructSubstitution(bytes32 repoId, bytes32 cdmHash, address newSecurity, uint256 newQuantity)",
  "function refuseSubstitution(bytes32 repoId)",
  "function instructInterimInterest(bytes32 repoId, bytes32 cdmHash, uint256 amount, uint256 newRepurchasePrice)",
  "function instructIncome(bytes32 repoId, bytes32 cdmHash, uint256 amount)",
  "function refusePayment(bytes32 repoId, uint8 phase)",
  "function instructRoll(bytes32 repoId, bytes32 cdmHash, uint256 newRepurchasePrice)",
  "function refuseRoll(bytes32 repoId)",
  "function instructPairOff(bytes32 repoA, bytes32 repoB, bytes32 cdmHash)",
  "function refusePairOff(bytes32 repoId)",
  "function pairOffWith(bytes32 repoId) view returns (bytes32)",
  "function getRepo(bytes32 repoId) view returns ((address seller, address buyer, address security, uint256 quantity, address cash, uint256 purchasePrice, uint256 repurchasePrice, bytes32 tradeHash, uint8 state, bytes32 purchaseHash, bytes32 repurchaseHash))",
  "function getInstructions(bytes32 repoId, uint8 phase) view returns (bytes32 seller, bytes32 buyer)",
  "function reposOf(address party) view returns (bytes32[])",
  "event RepoBooked(bytes32 indexed repoId, address indexed seller, address indexed buyer, bytes32 tradeHash)",
  "event RepoAffirmed(bytes32 indexed repoId, address indexed buyer, bytes32 tradeHash)",
  "event RepoInstructed(bytes32 indexed repoId, uint8 phase, address indexed party, bytes32 cdmHash)",
  "event RepoSettled(bytes32 indexed repoId, uint8 phase, bytes32 cdmHash)",
  // GMRA default close-out (wp-adr-repo-default-close-out)
  "function serveDefaultNotice(address defaulting, bytes32 noticeHash)",
  "function closeOutDefault(bytes32 closeOutId, address defaulting, bytes32 noticeHash, bytes32 cdmHash, address cash, address payer, uint256 amount)",
  "function payCloseOut(bytes32 closeOutId)",
  "function defaultNotice(address nonDefaulting, address defaulting) view returns (bytes32)",
  "function getCloseOut(bytes32 closeOutId) view returns ((address nonDefaulting, address defaulting, address payer, address cash, uint256 amount, bytes32 noticeHash, bytes32 cdmHash, bool paid))",
  "function closeOutsOf(address party) view returns (bytes32[])",
]);

export const RepoStateName = ["none", "booked", "affirmed", "purchased", "repurchased", "closedOut", "novated"];

const loanAbi = parseAbi([
  "function book(bytes32 loanId, address borrower, address security, uint256 quantity, address collateral, uint256 collateralAmount, bytes32 tradeHash)",
  "function affirm(bytes32 loanId, bytes32 tradeHash)",
  "function instructDelivery(bytes32 loanId, bytes32 cdmHash)",
  "function instructReturn(bytes32 loanId, uint256 quantity, uint256 collateralAmount, bytes32 cdmHash)",
  "function getLoan(bytes32 loanId) view returns ((address lender, address borrower, address security, uint256 quantity, address collateral, uint256 collateralAmount, bytes32 tradeHash, uint8 state, bytes32 deliveryHash))",
  "function getDeliveryInstructions(bytes32 loanId) view returns (bytes32 lender, bytes32 borrower)",
  "function getReturnInstructions(bytes32 loanId) view returns (bytes32 lender, bytes32 borrower, uint256 quantity, uint256 collateralAmount)",
  "function loansOf(address party) view returns (bytes32[])",
  "function recall(bytes32 loanId, uint256 quantity, uint32 settlementDate, bytes32 noticeHash)",
  "function withdrawRecall(bytes32 loanId, bytes32 withdrawalHash)",
  "function getRecall(bytes32 loanId) view returns (uint256 quantity, uint32 settlementDate, bytes32 noticeHash)",
  "function requestSubstitution(bytes32 loanId, address collateral, uint256 collateralAmount, bytes32 cdmHash)",
  "function agreeSubstitution(bytes32 loanId, bytes32 cdmHash)",
  "function refuseSubstitution(bytes32 loanId)",
  "function getSubstitution(bytes32 loanId) view returns (address collateral, uint256 collateralAmount, bytes32 cdmHash)",
  "function bill(bytes32 loanId, address cashToken, uint32 periodEnd, uint256 amount, bytes32 invoiceHash)",
  "function payBill(bytes32 loanId, bytes32 invoiceHash)",
  "function refuseBill(bytes32 loanId)",
  "function getBill(bytes32 loanId) view returns (address biller, address cashToken, uint32 periodEnd, uint256 amount, bytes32 invoiceHash, uint32 billedThrough)",
  // GMSLA default close-out (wp-adr-gmsla-default-close-out)
  "function serveDefaultNotice(address defaulting, bytes32 noticeHash)",
  "function closeOutDefault(bytes32 closeOutId, address defaulting, bytes32 noticeHash, bytes32 cdmHash, address cash, address payer, uint256 amount)",
  "function payCloseOut(bytes32 closeOutId)",
  "function defaultNotice(address nonDefaulting, address defaulting) view returns (bytes32)",
  "function getCloseOut(bytes32 closeOutId) view returns ((address nonDefaulting, address defaulting, address payer, address cash, uint256 amount, bytes32 noticeHash, bytes32 cdmHash, bool paid))",
  "function closeOutsOf(address party) view returns (bytes32[])",
  "function closeOutOf(bytes32 loanId) view returns (bytes32)",
]);

export const LoanStateName = ["none", "booked", "affirmed", "open", "returned", "closedOut"];

const tripartyAbi = parseAbi([
  "function proposeTerms(address receiver, address agent, bytes32 termsHash) returns (bytes32)",
  "function affirmTerms(bytes32 termsId, bytes32 termsHash)",
  "function refuseTerms(bytes32 termsId)",
  "function terminateTerms(bytes32 termsId)",
  "function getTerms(bytes32 termsId) view returns ((address giver, address receiver, address agent, bytes32 termsHash, uint8 state, bool receiverAffirmed, bool agentAffirmed, uint64 proposedAt, uint64 effectiveAt))",
  "function currentTerms(address giver, address receiver, address agent) view returns (bytes32)",
  "function termsOf(address party) view returns (bytes32[])",
  "function deposit(bytes32 termsId, address token, uint256 amount, uint256 rank)",
  "function withdraw(bytes32 termsId, address token, uint256 amount)",
  "function requestRepo(bytes32 termsId, bytes32 requestHash, address cash, uint256 purchasePrice) returns (bytes32)",
  "function affirmRequest(bytes32 repoId, bytes32 requestHash)",
  "function allocate(bytes32 repoId, bytes32 allocationHash, address[] tokens, uint256[] amounts)",
  "function refuseAllocation(bytes32 repoId)",
  "function settlePurchase(bytes32 repoId, bytes32 allocationHash)",
  "function cancelRepo(bytes32 repoId)",
  "function getRepo(bytes32 repoId) view returns ((bytes32 termsId, bytes32 requestHash, address cash, uint256 purchasePrice, uint8 state, bytes32 allocationHash, uint64 requestedAt, uint64 settledAt))",
  "function reposOf(bytes32 termsId) view returns (bytes32[])",
  "function allocationOf(bytes32 repoId) view returns (address[] tokens, uint256[] amounts)",
  "function freeOf(bytes32 termsId) view returns ((address token, uint256 amount, uint256 rank)[])",
  "function revalue(bytes32 repoId, bytes32 revaluationHash, address[] tokens, uint256[] amounts)",
  "function changesOf(bytes32 repoId) view returns ((bytes32 hash, uint64 blockNumber, uint8 kind)[])",
  "function pendingSubstitutionOf(bytes32 repoId) view returns ((bytes32 requestHash, address requester))",
  "function requestSubstitution(bytes32 repoId, bytes32 requestHash)",
  "function withdrawSubstitution(bytes32 repoId)",
  "function substitute(bytes32 repoId, bytes32 substitutionHash, address[] tokens, uint256[] amounts)",
  "function declineSubstitution(bytes32 repoId, bytes32 substitutionHash)",
  "function prepareTradeEnd(bytes32 repoId, bytes32 tradeEndHash, uint256 repurchasePrice)",
  "function recordReport(bytes32 termsId, bytes32 reportHash)",
  "function reportsOf(bytes32 termsId) view returns ((bytes32 reportHash, uint64 blockNumber)[])",
  "function settleRepurchase(bytes32 repoId, bytes32 tradeEndHash)",
  "function tradeEndOf(bytes32 repoId) view returns ((bytes32 tradeEndHash, uint256 repurchasePrice, uint64 blockNumber))",
]);

export const TripartyTermsStateName = ["none", "proposed", "effective", "refused", "terminated"];
export const TripartyRepoStateName = ["none", "requested", "affirmed", "allocated", "settled", "cancelled", "repurchased"];

/** A triparty repo on TripartySettlement (wp-adr-triparty-trade-start), with the tokens allocated to it. */
export interface OnChainTripartyRepo {
  repoId: Hex;
  termsId: Hex;
  requestHash: Hex;
  cash: Address;
  purchasePrice: bigint;
  state: string;
  allocationHash: Hex;
  requestedAt: bigint;
  settledAt: bigint;
  allocation: { token: Address; amount: bigint }[];
}

/** The giver's free account under a set of triparty terms. */
export interface TripartyHolding {
  token: Address;
  amount: bigint;
  rank: bigint;
}

/** Triparty terms on TripartySettlement (wp-adr-triparty-terms-profile). */
export interface OnChainTripartyTerms {
  termsId: Hex;
  giver: Address;
  receiver: Address;
  agent: Address;
  termsHash: Hex;
  state: string;
  receiverAffirmed: boolean;
  agentAffirmed: boolean;
  /** Block timestamps, seconds. */
  proposedAt: bigint;
  effectiveAt: bigint;
}

/** A securities loan on SecuritiesLoan (wp-adr-gmsla-loan-delivery-return). */
export interface OnChainLoan {
  loanId: Hex;
  lender: Address;
  borrower: Address;
  security: Address;
  /** The loaned quantity outstanding. */
  quantity: bigint;
  collateral: Address;
  /** The collateral the lender holds. */
  collateralAmount: bigint;
  tradeHash: Hex;
  state: string;
  deliveryHash: Hex;
  /** The hashes each party has instructed for the delivery (zero hash: not yet). */
  delivery: { lender: Hex; borrower: Hex };
  /** The pending return: each party's hash, the quantity and the collateral (zeros: none pending). */
  pendingReturn: { lender: Hex; borrower: Hex; quantity: bigint; collateralAmount: bigint };
  /** The pending recall (wp-adr-gmsla-recall): the quantity still recalled, the intended settlement date as YYYYMMDD and
   *  the notice hash (zeros: none). */
  recall: { quantity: bigint; settlementDate: number; noticeHash: Hex };
  /** The pending substitution (wp-adr-gmsla-substitution): the substitute token, its quantity and the CDM document's
   *  hash (zeros: none). */
  substitution: { collateral: Address; collateralAmount: bigint; cdmHash: Hex };
  /** The pending invoice of the loan's rate (wp-adr-gmsla-rebate) and the date (YYYYMMDD) it is billed through (zeros:
   *  none, never billed). */
  bill: { biller: Address; cashToken: Address; periodEnd: number; amount: bigint; invoiceHash: Hex; billedThrough: number };
  /** The GMSLA default close-out that closed the loan (wp-adr-gmsla-default-close-out; zero hash: none). */
  closeOutId: Hex;
}

/** A GMRA default close-out on RepoSettlement (wp-adr-repo-default-close-out). */
export interface OnChainRepoCloseOut {
  closeOutId: Hex;
  nonDefaulting: Address;
  defaulting: Address;
  payer: Address;
  cash: Address;
  amount: bigint;
  noticeHash: Hex;
  cdmHash: Hex;
  paid: boolean;
}
export const RepoPhase: Record<string, number> = { purchase: 0, repurchase: 1, reprice: 2, adjustment: 3, substitution: 4, interimInterest: 5, income: 6, roll: 7, pairOff: 8 };

export interface OnChainRepo {
  repoId: Hex;
  seller: Address;
  buyer: Address;
  security: Address;
  quantity: bigint;
  cash: Address;
  purchasePrice: bigint;
  repurchasePrice: bigint;
  tradeHash: Hex;
  state: string;
  purchaseHash: Hex;
  repurchaseHash: Hex;
  /** The hashes each party has instructed for the phase in progress (zero hash: not yet). */
  instructed: { seller: Hex; buyer: Hex };
  /** The hashes each party has instructed for a pending reprice (zero hash: not yet). */
  reprice: { seller: Hex; buyer: Hex };
  /** The same for a pending adjustment. */
  adjustment: { seller: Hex; buyer: Hex };
  /** The same for a pending substitution. */
  substitution: { seller: Hex; buyer: Hex };
  /** The same for a pending interim interest payment and a pending income payment. */
  interimInterest: { seller: Hex; buyer: Hex };
  income: { seller: Hex; buyer: Hex };
  /** The same for a pending roll. */
  roll: { seller: Hex; buyer: Hex };
  /** The same for a pending pair-off (wp-adr-repo-pair-off), and the other repo of it (zero hash: none). */
  pairOff: { seller: Hex; buyer: Hex };
  pairOffWith: Hex;
  /** A buy/sell-back (wp-adr-repo-buy-sell-back), and its agreed income deductions in the current term (zero for a repo). */
  buySellBack: boolean;
  incomeDeduction: bigint;
}

const ccpAbi = parseAbi([
  "struct Rulebook { address ccp; bytes32 rulebookHash; address token; uint256 capital; uint256 fund; uint8 state; uint64 publishedAt; uint64 effectiveAt; }",
  "function publishRulebook(bytes32 rulebookHash, address token, address[] members, uint256[] shares, uint256 capital)",
  "function join(bytes32 rulebookHash)",
  "function leave(bytes32 rulebookHash)",
  "function rulebook(bytes32 rulebookHash) view returns (Rulebook)",
  "function members(bytes32 rulebookHash) view returns (address[] member, uint256[] share, bool[] hasPaid)",
  "function rulebookOf(address ccp) view returns (bytes32)",
  "function clearedCount(bytes32 rulebookHash, address member) view returns (uint256)",
  "struct ClearedRepo { address ccp; bytes32 rulebookHash; address seller; address buyer; address security; uint256 quantity; address cash; uint256 purchasePrice; uint256 repurchasePrice; bytes32 novationHash; uint8 state; bytes32 reasonHash; bytes32 sellerLegHash; bytes32 buyerLegHash; }",
  "function submitClearing(bytes32 repoId, address ccp, bytes32 novationHash)",
  "function affirmClearing(bytes32 repoId, bytes32 novationHash)",
  "function acceptClearing(bytes32 repoId)",
  "function refuseClearing(bytes32 repoId, bytes32 reasonHash)",
  "function instructCleared(bytes32 repoId, bytes32 legHash)",
  "function clearing(bytes32 repoId) view returns (ClearedRepo)",
  "function clearingsOfParty(address party) view returns (bytes32[])",
  "event RulebookPublished(bytes32 indexed rulebookHash, address indexed ccp, address token, uint256 capital)",
  "event MemberJoined(bytes32 indexed rulebookHash, address indexed member, uint256 share)",
  "event MemberLeft(bytes32 indexed rulebookHash, address indexed member, uint256 share)",
  "event RulebookEffective(bytes32 indexed rulebookHash)",
  "event ClearingSubmitted(bytes32 indexed repoId, address indexed ccp, address indexed seller, bytes32 novationHash)",
  "event ClearingAffirmed(bytes32 indexed repoId, address indexed buyer, bytes32 novationHash)",
  "event ClearingAccepted(bytes32 indexed repoId, address indexed ccp, bytes32 novationHash)",
  "event ClearingRefused(bytes32 indexed repoId, address indexed ccp, bytes32 reasonHash)",
  "event ClearedLegInstructed(bytes32 indexed repoId, address indexed member, uint8 state, bytes32 legHash)",
  "event ClearedRepoSettled(bytes32 indexed repoId, uint8 state, bytes32 sellerLegHash, bytes32 buyerLegHash)",
  // margin (wp-adr-ccp-margin)
  "function contributed(bytes32 rulebookHash, address member) view returns (uint256)",
  "function imHeld(bytes32 rulebookHash, address member) view returns (uint256)",
  "function admissionOf(bytes32 rulebookHash, address member) view returns (bytes32)",
  "function vmBalance(bytes32 repoId) view returns (int256)",
  "function openRound(address ccp) view returns (bytes32)",
  "struct MarginRound { address ccp; bytes32 rulebookHash; uint64 businessDate; uint8 state; uint32 unpaid; }",
  "function issueMargin(uint64 businessDate, bytes32[] repoIds, int256[] repoVm, address[] ms, int256[] im, bytes32[] statementHashes) returns (bytes32)",
  "function payMargin(bytes32 roundId)",
  "function cancelMarginRound(bytes32 roundId)",
  "function marginRound(bytes32 roundId) view returns (MarginRound)",
  "function roundMembers(bytes32 roundId) view returns (address[] member, int256[] vm, int256[] im, bytes32[] statementHash, bool[] hasPaid)",
  "function roundRepos(bytes32 roundId) view returns (bytes32[] repoId, int256[] vm)",
  "function marginRoundsOf(address ccp) view returns (bytes32[])",
  "event MarginRoundIssued(bytes32 indexed roundId, address indexed ccp, uint64 businessDate)",
  "event MarginStatementIssued(bytes32 indexed roundId, address indexed member, bytes32 statementHash, int256 vm, int256 im)",
  "event MarginPaid(bytes32 indexed roundId, address indexed member, uint256 amount)",
  "event MarginRoundSettled(bytes32 indexed roundId, address indexed ccp)",
  "event MarginRoundCancelled(bytes32 indexed roundId, address indexed ccp)",
  // default (wp-adr-ccp-default)
  "struct DefaultRecord { address ccp; bytes32 rulebookHash; address defaulter; int256 loss; uint256 fromInitialMargin; uint256 fromDefaulterFund; uint256 fromCapital; uint256 fromMembersFund; uint256 returned; uint256 dueOutstanding; }",
  "function closeOutDefault(address defaulter, bytes32 closeOutHash, bytes32[] repoIds, int256[] residuals)",
  "function payDefaultDue(bytes32 closeOutHash)",
  "function defaultRecord(bytes32 closeOutHash) view returns (DefaultRecord record, bytes32[] repoIds)",
  "function defaultsOf(address ccp) view returns (bytes32[])",
  "function defaultDue(bytes32 closeOutHash, address member) view returns (uint256)",
  "event MemberDefaulted(bytes32 indexed closeOutHash, address indexed ccp, address indexed defaulter, int256 loss)",
  "event WaterfallApplied(bytes32 indexed closeOutHash, uint256 fromInitialMargin, uint256 fromDefaulterFund, uint256 fromCapital, uint256 fromMembersFund, uint256 returned)",
  "event DefaultDuePaid(bytes32 indexed closeOutHash, address indexed member, uint256 amount)",
  // porting (wp-adr-ccp-porting)
  "struct Porting { address from; address to; bytes32 portingHash; int256 payment; uint8 state; }",
  "function admitMember(address member, uint256 share, bytes32 admissionHash)",
  "function requestPorting(bytes32 repoId, address to, bytes32 portingHash, int256 payment)",
  "function acceptPorting(bytes32 repoId, bytes32 portingHash)",
  "function approvePorting(bytes32 repoId)",
  "function refusePorting(bytes32 repoId)",
  "function porting(bytes32 repoId) view returns (Porting)",
  "event MemberAdmitted(bytes32 indexed rulebookHash, address indexed member, uint256 share, bytes32 admissionHash)",
  "event PortingRequested(bytes32 indexed repoId, address indexed from, address indexed to, bytes32 portingHash, int256 payment)",
  "event PortingAccepted(bytes32 indexed repoId, address indexed to, bytes32 portingHash)",
  "event PortingExecuted(bytes32 indexed repoId, address indexed from, address indexed to, bytes32 portingHash)",
  "event PortingRefused(bytes32 indexed repoId, address indexed by, bytes32 portingHash)",
]);

export const CcpClearingStateName = ["none", "submitted", "affirmed", "cleared", "refused", "purchased", "repurchased", "closedOut"] as const;
export const CcpRoundStateName = ["none", "issued", "settled", "cancelled"] as const;
export const CcpPortingStateName = ["none", "requested", "accepted", "executed", "refused"] as const;

/** A CCP margin round (wp-adr-ccp-margin): each member's variation and initial margin, positive when it pays, its
 *  statement hash and whether it paid; each repo's variation margin change from the seller's side. */
export interface OnChainCcpMarginRound {
  roundId: Hex;
  ccp: Address;
  rulebookHash: Hex;
  businessDate: string;
  state: string;
  unpaid: number;
  members: { member: Address; vm: bigint; im: bigint; statementHash: Hex; paid: boolean }[];
  repos: { repoId: Hex; vm: bigint }[];
}

/** A member default at the CCP (wp-adr-ccp-default): the loss, the waterfall and what the survivors still owe. */
export interface OnChainCcpDefault {
  closeOutHash: Hex;
  ccp: Address;
  rulebookHash: Hex;
  defaulter: Address;
  loss: bigint;
  fromInitialMargin: bigint;
  fromDefaulterFund: bigint;
  fromCapital: bigint;
  fromMembersFund: bigint;
  returned: bigint;
  dueOutstanding: bigint;
  repoIds: Hex[];
}

/** A repo submitted to a CCP on CcpClearing (wp-adr-ccp-clearing), with each member's pending leg instruction. */
export interface OnChainCcpClearing {
  repoId: Hex;
  ccp: Address;
  rulebookHash: Hex;
  seller: Address;
  buyer: Address;
  security: Address;
  quantity: bigint;
  cash: Address;
  purchasePrice: bigint;
  repurchasePrice: bigint;
  novationHash: Hex;
  state: string;
  reasonHash: Hex;
  sellerLegHash: Hex;
  buyerLegHash: Hex;
  /** The variation margin paid on the repo, from the seller's side (wp-adr-ccp-margin). */
  vmBalance: bigint;
  /** The latest request to port a leg (wp-adr-ccp-porting), or null. */
  porting: { from: Address; to: Address; portingHash: Hex; payment: bigint; state: string } | null;
}

export const CcpRulebookStateName = ["None", "Published", "Effective"] as const;

/** A CCP rulebook on CcpClearing (wp-adr-ccp-membership): its hash, the CCP's capital, the default fund paid in, and
 *  each named member with its share and whether it has paid. */
export interface OnChainCcpRulebook {
  rulebookHash: Hex;
  ccp: Address;
  token: Address;
  capital: bigint;
  fund: bigint;
  state: string;
  publishedAt: bigint;
  effectiveAt: bigint;
  /** contributed: what is in the default fund for the member; imHeld: its initial margin with the CCP; admissionHash:
   *  its CcpAdmission, zero for a member the rulebook names (wp-adr-ccp-margin, wp-adr-ccp-default, wp-adr-ccp-porting). */
  members: { member: Address; share: bigint; paid: boolean; contributed: bigint; imHeld: bigint; admissionHash: Hex }[];
}

// The record keeper's confirmations for Registered and Claim tokens (task-authoritative-record-settlement-enforcement).
const registerAbi = parseAbi([
  "function confirm(bytes32 txHash, address token, string ref)",
  "function confirmed(bytes32 txHash, address token) view returns (bool)",
  "event RegisterConfirmed(bytes32 indexed txHash, address indexed token, string ref)",
]);

const transferAbi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

/** The ledger-neutral surface the workflow service depends on. A second ledger (Canton) implements the same methods. */
export interface LedgerAdapter {
  readonly account: Address;
  issueCall(callId: Hex, kind: number, to: Address, amount: bigint, deadline: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  respond(callId: Hex, response: number, agreed: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  propose(callId: Hex, assets: AssetArg[], cdmHash: Hex): Promise<{ txHash: Hex; block: bigint; proposalId: bigint }>;
  decide(callId: Hex, proposalId: bigint, accept: boolean, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  withdrawCall(callId: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  issueReplacementCall(callId: Hex, replacedCallId: Hex, kind: number, to: Address, amount: bigint, deadline: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  requestCancellation(callId: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  decideCancellation(callId: Hex, accept: boolean, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  approve(token: Address, spender: Address, amount: bigint): Promise<{ txHash: Hex; block: bigint }>;
  pledge(callId: Hex, proposalId: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  settleByTransfer(callId: Hex, proposalId: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  returnCollateral(callId: Hex, release: AssetArg[], cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  returnByTransfer(callId: Hex, assets: AssetArg[], cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  enforce(callId: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** The Enforced event of a call with its transaction, as callSteps reads a step (for the Enforcement LedgerAnchor). */
  enforcement(callId: Hex): Promise<CallStep[]>;
  /** Every Transfer of a token, in chain order, each marked confirmed when the record keeper's register shows it. */
  registerTransfers(token: Address): Promise<RegisterTransfer[]>;
  /** The transactions of a flow contract (repo, loan or triparty) that moved Registered or Claim tokens, by record. */
  registerMovements(flow: "repo" | "loan" | "triparty", tokens: Address[]): Promise<RegisterMovement[]>;
  /** The record keeper's confirmations, in chain order. */
  registerConfirmations(): Promise<RegisterConfirmation[]>;
  /** The record keeper confirms that its register shows a transaction's movements of a token (record keeper's key). */
  confirmRegister(txHash: Hex, token: Address, ref: string): Promise<{ txHash: Hex; block: bigint }>;
  closeOut(closeOutId: Hex, pledgor: Address, owed: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  reclaim(reclaimId: Hex, securedParty: Address, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  listCloseOuts(party: Address): Promise<CloseOutRecord[]>;
  requestSubstitution(substitutionId: Hex, securedParty: Address, original: AssetArg[], substitute: AssetArg[], cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  decideSubstitution(substitutionId: Hex, consent: boolean, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  settleSubstitution(substitutionId: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getSubstitution(substitutionId: Hex): Promise<OnChainSubstitution>;
  getSubstitutionAssets(substitutionId: Hex): Promise<{ original: AssetArg[]; substitute: AssetArg[] }>;
  listSubstitutions(party: Address): Promise<{ substitutionId: Hex; substitution: OnChainSubstitution }[]>;
  substitutionSteps(substitutionId: Hex): Promise<SubstitutionStep[]>;
  proposeAmendment(amendmentId: Hex, pledgor: Address, securedParty: Address, terms: HaircutTermArg[], beforeHash: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  decideAmendment(amendmentId: Hex, consent: boolean, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getAmendment(amendmentId: Hex): Promise<OnChainAmendment>;
  listAmendments(party: Address): Promise<{ amendmentId: Hex; block: string; amendment: OnChainAmendment }[]>;
  pairTerms(pledgor: Address, securedParty: Address): Promise<{ agreementHash: Hex; pendingAmendment: Hex; eligibility: HaircutTermArg[] }>;
  /** Master agreement terms (wp-adr-repo-gmra-terms): kind is the agreement's name, for example "GMRA". */
  proposeTermsAmendment(amendmentId: Hex, kind: string, counterparty: Address, beforeHash: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  decideTermsAmendment(amendmentId: Hex, consent: boolean, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  masterTerms(kind: string, x: Address, y: Address): Promise<{ termsHash: Hex; pendingAmendment: Hex }>;
  listTermsAmendments(kind: string, party: Address): Promise<{ amendmentId: Hex; block: string; amendment: OnChainAmendment }[]>;
  stateInterest(interestId: Hex, pledgor: Address, cashToken: Address, amount: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  payInterest(interestId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getInterest(interestId: Hex): Promise<Omit<InterestRecord, "interestId" | "block" | "txHash">>;
  listInterest(party: Address): Promise<InterestRecord[]>;
  stateInterestForNetting(interestId: Hex, pledgor: Address, cashToken: Address, amount: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  settleNetted(nettingId: Hex, callIds: Hex[], callCdmHashes: Hex[], interestIds: Hex[], cashToken: Address, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  nettedIn(id: Hex): Promise<Hex>;
  listNettings(party: Address): Promise<NettingRecord[]>;
  escrowAt(pledgor: Address, securedParty: Address, block: bigint): Promise<{ token: Address; qty: bigint; price: bigint | null }[]>;
  setDefault(party: Address, inDefault: boolean): Promise<{ txHash: Hex; block: bigint }>;
  isDefaulted(party: Address): Promise<boolean>;
  publishPrice(token: Address, priceScaled: bigint): Promise<{ txHash: Hex; block: bigint }>;
  priceOf(token: Address): Promise<bigint | null>;
  settlementHistory(pledgor: Address, securedParty: Address): Promise<{ settled: { callId: Hex; block: string }[]; enforced: { callId: Hex; block: string }[]; closedOut: { closeOutId: Hex; block: string }[]; reclaimed: { reclaimId: Hex; block: string }[] }>;
  getCall(callId: Hex): Promise<OnChainCall>;
  listCalls(party: Address): Promise<{ callId: Hex; call: OnChainCall }[]>;
  callSteps(callId: Hex): Promise<CallStep[]>;
  commitSnapshot(snapshotId: Hex, counterparty: Address, snapshotHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  commitResult(reconciliationId: Hex, firstSnapshotId: Hex, secondSnapshotId: Hex, resultHash: Hex, breakCount: number): Promise<{ txHash: Hex; block: bigint }>;
  reconciliationIdOf(firstSnapshotId: Hex, secondSnapshotId: Hex): Promise<Hex>;
  getSnapshot(snapshotId: Hex): Promise<{ party: Address; counterparty: Address; snapshotHash: Hex; committedAt: bigint }>;
  getRun(reconciliationId: Hex): Promise<{ firstSnapshotId: Hex; secondSnapshotId: Hex; firstPartyResult: Hex; secondPartyResult: Hex; breakCount: number; state: string }>;
  /** Repo (wp-adr-repo-purchase-repurchase): the seller books, the buyer affirms, each party instructs each phase. */
  bookRepo(repoId: Hex, buyer: Address, security: Address, quantity: bigint, cash: Address, purchasePrice: bigint, repurchasePrice: bigint, tradeHash: Hex, buySellBack?: boolean): Promise<{ txHash: Hex; block: bigint }>;
  affirmRepo(repoId: Hex, tradeHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  instructRepo(repoId: Hex, phase: "purchase" | "repurchase", cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** Reprice (wp-adr-repo-reprice): each party instructs the same reprice; the second instruction settles it. */
  instructRepoReprice(repoId: Hex, cdmHash: Hex, newPurchasePrice: bigint, newRepurchasePrice: bigint, cashFromSeller: bigint): Promise<{ txHash: Hex; block: bigint }>;
  /** Adjustment (wp-adr-repo-adjustment): each party instructs the same adjustment; the second instruction settles it. */
  instructRepoAdjustment(repoId: Hex, cdmHash: Hex, newQuantity: bigint, newRepurchasePrice: bigint, accruedFromSeller: bigint): Promise<{ txHash: Hex; block: bigint }>;
  /** Substitution (wp-adr-repo-substitution): the seller requests, the buyer's matching instruction agrees and settles. */
  instructRepoSubstitution(repoId: Hex, cdmHash: Hex, newSecurity: Hex, newQuantity: bigint): Promise<{ txHash: Hex; block: bigint }>;
  refuseRepoSubstitution(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** Interim interest and manufactured income (wp-adr-repo-income). */
  instructRepoInterimInterest(repoId: Hex, cdmHash: Hex, amount: bigint, newRepurchasePrice: bigint): Promise<{ txHash: Hex; block: bigint }>;
  instructRepoIncome(repoId: Hex, cdmHash: Hex, amount: bigint): Promise<{ txHash: Hex; block: bigint }>;
  refuseRepoPayment(repoId: Hex, phase: number): Promise<{ txHash: Hex; block: bigint }>;
  /** A roll on the Repurchase Date (wp-adr-repo-roll). */
  instructRepoRoll(repoId: Hex, cdmHash: Hex, newRepurchasePrice: bigint): Promise<{ txHash: Hex; block: bigint }>;
  refuseRepoRoll(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** The pair-off of two offsetting repos on their common Repurchase Date (wp-adr-repo-pair-off). */
  instructRepoPairOff(repoA: Hex, repoB: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  refuseRepoPairOff(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getRepo(repoId: Hex): Promise<OnChainRepo>;
  listRepos(party: Address): Promise<OnChainRepo[]>;
  repoContract(): Address;
  /** GMRA default close-out (wp-adr-repo-default-close-out). */
  serveRepoDefaultNotice(defaulting: Address, noticeHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  closeOutRepoDefault(closeOutId: Hex, defaulting: Address, noticeHash: Hex, cdmHash: Hex, cash: Address, payer: Address, amount: bigint): Promise<{ txHash: Hex; block: bigint }>;
  payRepoCloseOut(closeOutId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  repoDefaultNotice(nonDefaulting: Address, defaulting: Address): Promise<Hex>;
  listRepoCloseOuts(party: Address): Promise<OnChainRepoCloseOut[]>;
  /** Securities loans under the GMSLA (wp-adr-gmsla-loan-delivery-return). */
  loanContract(): Address;
  bookLoan(loanId: Hex, borrower: Address, security: Address, quantity: bigint, collateral: Address, collateralAmount: bigint, tradeHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  affirmLoan(loanId: Hex, tradeHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  instructLoanDelivery(loanId: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  instructLoanReturn(loanId: Hex, quantity: bigint, collateralAmount: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getLoan(loanId: Hex): Promise<OnChainLoan>;
  recallLoan(loanId: Hex, quantity: bigint, settlementDate: number, noticeHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  withdrawLoanRecall(loanId: Hex, withdrawalHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  requestLoanSubstitution(loanId: Hex, collateral: Address, collateralAmount: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  agreeLoanSubstitution(loanId: Hex, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  refuseLoanSubstitution(loanId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  billLoan(loanId: Hex, cashToken: Address, periodEnd: number, amount: bigint, invoiceHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  payLoanBill(loanId: Hex, invoiceHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  refuseLoanBill(loanId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  listLoans(party: Address): Promise<OnChainLoan[]>;
  /** GMSLA default close-out (wp-adr-gmsla-default-close-out); the record has the shape of a GMRA close-out. */
  serveLoanDefaultNotice(defaulting: Address, noticeHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  closeOutLoanDefault(closeOutId: Hex, defaulting: Address, noticeHash: Hex, cdmHash: Hex, cash: Address, payer: Address, amount: bigint): Promise<{ txHash: Hex; block: bigint }>;
  payLoanCloseOut(closeOutId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  loanDefaultNotice(nonDefaulting: Address, defaulting: Address): Promise<Hex>;
  listLoanCloseOuts(party: Address): Promise<OnChainRepoCloseOut[]>;
  /** Triparty terms between a giver, a receiver and an agent (wp-adr-triparty-terms-profile). */
  tripartyContract(): Address;
  proposeTripartyTerms(receiver: Address, agent: Address, termsHash: Hex): Promise<{ txHash: Hex; block: bigint; termsId: Hex }>;
  affirmTripartyTerms(termsId: Hex, termsHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  refuseTripartyTerms(termsId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  terminateTripartyTerms(termsId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getTripartyTerms(termsId: Hex): Promise<OnChainTripartyTerms>;
  listTripartyTerms(party: Address): Promise<OnChainTripartyTerms[]>;
  /** Trade start (wp-adr-triparty-trade-start). The deposit approves TripartySettlement for the amount first. */
  depositTriparty(termsId: Hex, token: Address, amount: bigint, rank: bigint): Promise<{ txHash: Hex; block: bigint }>;
  withdrawTriparty(termsId: Hex, token: Address, amount: bigint): Promise<{ txHash: Hex; block: bigint }>;
  requestTripartyRepo(termsId: Hex, requestHash: Hex, cash: Address, purchasePrice: bigint): Promise<{ txHash: Hex; block: bigint; repoId: Hex }>;
  affirmTripartyRequest(repoId: Hex, requestHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  allocateTriparty(repoId: Hex, allocationHash: Hex, tokens: Address[], amounts: bigint[]): Promise<{ txHash: Hex; block: bigint }>;
  refuseTripartyAllocation(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** The receiver approves TripartySettlement for the Purchase Price, then settles. */
  settleTripartyPurchase(repoId: Hex, allocationHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** Trade end (wp-adr-triparty-trade-end): the agent prepares; the giver pays the Repurchase Price against the release. */
  prepareTripartyTradeEnd(repoId: Hex, tradeEndHash: Hex, repurchasePrice: bigint): Promise<{ txHash: Hex; block: bigint }>;
  settleTripartyRepurchase(repoId: Hex, tradeEndHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  tripartyTradeEnd(repoId: Hex): Promise<{ tradeEndHash: Hex; repurchasePrice: bigint; block: bigint } | null>;
  /** Reporting (wp-adr-triparty-reporting): the agent records a report; the parties read the terms as they were at a block. */
  recordTripartyReport(termsId: Hex, reportHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  tripartyReports(termsId: Hex): Promise<{ reportHash: Hex; block: bigint }[]>;
  tripartyTermsAt(termsId: Hex, block: bigint): Promise<{ repos: { repoId: Hex; state: string; allocation: { token: Address; amount: bigint }[] }[]; free: TripartyHolding[]; prices: { token: Address; price: bigint | null }[] }>;
  cancelTripartyRepo(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getTripartyRepo(repoId: Hex): Promise<OnChainTripartyRepo>;
  listTripartyRepos(termsId: Hex): Promise<OnChainTripartyRepo[]>;
  tripartyFree(termsId: Hex): Promise<TripartyHolding[]>;
  /** Revaluation (wp-adr-triparty-revaluation): the agent replaces a settled repo's holding; the hash is kept with its block. */
  revalueTriparty(repoId: Hex, revaluationHash: Hex, tokens: Address[], amounts: bigint[]): Promise<{ txHash: Hex; block: bigint }>;
  /** The repo's holding changes, oldest first: revaluation, substitution or declined. */
  tripartyChanges(repoId: Hex): Promise<{ hash: Hex; block: bigint; kind: "revaluation" | "substitution" | "declined" }[]>;
  /** Substitution (wp-adr-triparty-substitution): the request awaiting the agent, the request, withdrawal, and the agent's answer. */
  tripartyPendingSubstitution(repoId: Hex): Promise<{ requestHash: Hex; requester: Address } | null>;
  requestTripartySubstitution(repoId: Hex, requestHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  withdrawTripartySubstitution(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  substituteTriparty(repoId: Hex, substitutionHash: Hex, tokens: Address[], amounts: bigint[]): Promise<{ txHash: Hex; block: bigint }>;
  declineTripartySubstitution(repoId: Hex, substitutionHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** A repo's holding, its terms' free account and the feed prices of those tokens at the end of a block. */
  tripartyRepoAt(repoId: Hex, block: bigint): Promise<{ allocation: { token: Address; amount: bigint }[]; free: TripartyHolding[]; prices: { token: Address; price: bigint | null }[] }>;
  /** CCP membership (wp-adr-ccp-membership): the CCP's rulebook, its capital and the members' default fund shares. */
  ccpContract(): Address;
  publishCcpRulebook(rulebookHash: Hex, token: Address, members: Address[], shares: bigint[], capital: bigint): Promise<{ txHash: Hex; block: bigint }>;
  joinCcp(rulebookHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  leaveCcp(rulebookHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** The rulebook with this hash, or the CCP's own rulebook when the hash is omitted; null when there is none. */
  getCcpRulebook(rulebookHash: Hex | null, ccp?: Address, block?: bigint): Promise<OnChainCcpRulebook | null>;
  /** CCP clearing (wp-adr-ccp-clearing): submission, affirmation, acceptance or refusal, and each leg's instruction. */
  submitCcpClearing(repoId: Hex, ccp: Address, novationHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  affirmCcpClearing(repoId: Hex, novationHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  acceptCcpClearing(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  refuseCcpClearing(repoId: Hex, reasonHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  instructCcpCleared(repoId: Hex, legHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getCcpClearing(repoId: Hex): Promise<OnChainCcpClearing | null>;
  listCcpClearings(party: Address): Promise<OnChainCcpClearing[]>;
  /** CCP margin (wp-adr-ccp-margin): the CCP issues a round; each member that owes pays; the CCP may cancel a round
   *  when a member in it is in default. */
  issueCcpMargin(businessDate: bigint, repoIds: Hex[], repoVm: bigint[], members: Address[], im: bigint[], statementHashes: Hex[]): Promise<{ txHash: Hex; block: bigint }>;
  payCcpMargin(roundId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  cancelCcpMargin(roundId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getCcpMarginRound(roundId: Hex): Promise<OnChainCcpMarginRound | null>;
  listCcpMarginRounds(ccp: Address): Promise<OnChainCcpMarginRound[]>;
  /** CCP default (wp-adr-ccp-default): the close-out and waterfall, and a survivor's payment of what it owes. */
  closeOutCcpDefault(defaulter: Address, closeOutHash: Hex, repoIds: Hex[], residuals: bigint[]): Promise<{ txHash: Hex; block: bigint }>;
  payCcpDefaultDue(closeOutHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getCcpDefault(closeOutHash: Hex): Promise<OnChainCcpDefault | null>;
  listCcpDefaults(ccp: Address): Promise<(OnChainCcpDefault & { due: { member: Address; amount: bigint }[] })[]>;
  /** CCP admission and porting (wp-adr-ccp-porting). */
  admitCcpMember(member: Address, share: bigint, admissionHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  requestCcpPorting(repoId: Hex, to: Address, portingHash: Hex, payment: bigint): Promise<{ txHash: Hex; block: bigint }>;
  acceptCcpPorting(repoId: Hex, portingHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  approveCcpPorting(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  refuseCcpPorting(repoId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  /** Wait until this gateway's node has the highest block a peer node reports (task-live-spec-node-read-after-write). */
  catchUpWithPeers(maxWaitMs?: number): Promise<void>;
  watchSteps(onStep: (e: StepEvent) => void): () => void;
  watchLedgerEvents(onEvent: (e: LedgerEvent) => void): () => void;
  getProposalState(callId: Hex, proposalId: bigint): Promise<number>;
  pledgedBalance(pledgor: Address, securedParty: Address, token: Address): Promise<bigint>;
  tokenBalance(token: Address, owner: Address): Promise<bigint>;
}

export class BesuAdapter implements LedgerAdapter {
  readonly account: Address;
  private readonly pub: PublicClient;
  private readonly ws: PublicClient;
  private readonly wallet: WalletClient;
  private readonly reg: Registry;

  private readonly node: string;

  constructor(node: string, reg: Registry = loadRegistry()) {
    this.reg = reg;
    this.node = node;
    const rpc = reg.rpc[node];
    if (!rpc) throw new Error(`no RPC URL for node ${node} in the registry`);
    const chain = defineChain({
      id: reg.chainId,
      name: `besu-${node}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    });
    const acct = privateKeyToAccount(loadNodeKey(node));
    this.account = getAddress(acct.address);
    // viem polls for a transaction receipt every 4 s by default, twice the 2 s block period, so each send() waited about
    // 4 s (task-gateway-receipt-poll). Only the receipt wait polls this client; the live events come over WebSocket.
    const pollingInterval = Number(process.env.GATEWAY_RECEIPT_POLL_MS ?? 250);
    // Concurrent reads (listCalls reads four values per call) go to Besu as JSON-RPC batches (task-live-read-latency).
    this.pub = createPublicClient({ chain, transport: http(rpc, { batch: { batchSize: 200 } }), pollingInterval });
    this.wallet = createWalletClient({ account: acct, chain, transport: http(rpc) });
    // Besu exposes a WebSocket JSON-RPC on the http port + 1 (besu/docker-compose.yml --rpc-ws-enabled); the live
    // event subscription (watchSteps -> eth_subscribe) runs over it, the historical scan stays on http.
    const wsRpc = (reg as { wsRpc?: Record<string, string> }).wsRpc?.[node]
      ?? rpc.replace(/^http/, "ws").replace(/:(\d+)(?=\/|$)/, (_m, p) => ":" + (Number(p) + 1));
    this.ws = createPublicClient({ chain, transport: webSocket(wsRpc) });
  }

  // The head of the chain for a log scan, never cached: viem caches getBlockNumber for the polling interval, so a scan
  // could stop short of a step mined moments ago while getCall (eth_call at latest) already shows its effect. That gave
  // folds one step behind the contract (flow-call-cancellation folded "Agreed" for a call cancelled on-chain).
  private latestBlock(): Promise<bigint> {
    return this.pub.getBlockNumber({ cacheTime: 0 });
  }

  /**
   * Wait until this node has the highest block any node reports (task-live-spec-node-read-after-write). A party's
   * service reads, or writes against, a record the other party has just written on its own node; under QBFT this node
   * can be a block behind, so the read reverted or came back empty as for an unknown record ("repo … is not booked",
   * "loan … is not affirmed", an unknown call in flow-settlement-netting). The gateway subscribes to new heads on every
   * node in the registry (WebSocket, eth_subscribe newHeads) and keeps the highest; a request waits only while this
   * node is below it, polling every 25 ms for at most maxWaitMs, and costs no RPC call otherwise. A head pushed by the
   * writer's node reaches this gateway before the writer's HTTP response reaches this party's service in the cases
   * observed; that ordering is not guaranteed.
   */
  async catchUpWithPeers(maxWaitMs = 10_000): Promise<void> {
    this.watchHeads();
    if (this.localHead >= this.networkHead) return;
    const target = this.networkHead;
    const deadline = Date.now() + maxWaitMs;
    while (this.localHead < target && Date.now() < deadline) {
      const n = await this.latestBlock();
      if (n > this.localHead) this.localHead = n;
      if (this.localHead >= target) break;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  private localHead = 0n;
  private networkHead = 0n;
  private headWatchers: (() => void)[] | null = null;

  /** Subscribe once to new heads on this node and on every other node in the registry. */
  private watchHeads(): void {
    if (this.headWatchers) return;
    this.headWatchers = [];
    const seen = (n: bigint, local: boolean) => {
      if (local && n > this.localHead) this.localHead = n;
      if (n > this.networkHead) this.networkHead = n;
    };
    this.headWatchers.push(this.ws.watchBlockNumber({ emitOnBegin: true, onBlockNumber: (n) => seen(n, true), onError: () => undefined }));
    for (const [n, url] of Object.entries(this.reg.rpc)) {
      if (n === this.node) continue;
      const wsUrl = (this.reg as { wsRpc?: Record<string, string> }).wsRpc?.[n]
        ?? url.replace(/^http/, "ws").replace(/:(\d+)(?=\/|$)/, (_m, p) => ":" + (Number(p) + 1));
      const peer = createPublicClient({ transport: webSocket(wsUrl) });
      this.headWatchers.push(peer.watchBlockNumber({ emitOnBegin: true, onBlockNumber: (b) => seen(b, false), onError: () => undefined }));
    }
  }


  // One key per gateway: sends run one at a time, and the gateway tracks the next nonce itself. Right after a receipt
  // (now polled every 250 ms) the node's pending nonce can still be the used one, and viem reused it ("Nonce provided
  // for the transaction is lower than the current nonce", flow-agreement-amendment, task-gateway-receipt-poll).
  private sendQueue: Promise<unknown> = Promise.resolve();
  private nextNonce = 0;

  private send(address: Address, abi: readonly unknown[], functionName: string, args: unknown[]): Promise<{ txHash: Hex; block: bigint }> {
    const run = this.sendQueue.then(() => this.sendNow(address, abi, functionName, args));
    this.sendQueue = run.catch(() => undefined);
    return run;
  }

  // gasPrice 0 forces a legacy transaction, which the zero-base-fee Besu chain accepts.
  private async sendNow(address: Address, abi: readonly unknown[], functionName: string, args: unknown[]): Promise<{ txHash: Hex; block: bigint }> {
    let txHash: Hex | undefined;
    for (let attempt = 0; txHash === undefined; attempt++) {
      const pending = await this.pub.getTransactionCount({ address: this.account, blockTag: "pending" });
      const nonce = Math.max(pending, this.nextNonce);
      try {
        txHash = await this.wallet.writeContract({
          address,
          abi: abi as never,
          functionName,
          args: args as never,
          account: this.wallet.account!,
          chain: this.wallet.chain,
          gasPrice: 0n,
          nonce,
        });
        this.nextNonce = nonce + 1;
      } catch (e) {
        // A nonce the node has already seen: count past it and send again, once.
        if (attempt === 0 && /nonce/i.test(String((e as Error).message))) { this.nextNonce = nonce + 1; continue; }
        throw e;
      }
    }
    const receipt = await this.pub.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted (tx ${txHash})`);
    return { txHash, block: receipt.blockNumber };
  }

  issueCall(callId: Hex, kind: number, to: Address, amount: bigint, deadline: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "issueCall", [callId, kind, to, amount, deadline, cdmHash]);
  }

  respond(callId: Hex, response: number, agreed: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "respond", [callId, response, agreed, cdmHash]);
  }

  async propose(callId: Hex, assets: AssetArg[], cdmHash: Hex) {
    const sent = await this.send(this.reg.contracts.marginCall, marginCallAbi, "propose", [callId, assets, cdmHash]);
    // The proposal id is not a return value in a transaction; read it from the call's proposalCount - 1 after mining.
    const call = await this.getCall(callId);
    return { ...sent, proposalId: call.proposalCount - 1n };
  }

  decide(callId: Hex, proposalId: bigint, accept: boolean, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "decideProposal", [callId, proposalId, accept, cdmHash]);
  }

  /** Cancellation (task-csa-call-cancellation): the caller withdraws an unanswered call; after a response either party
   * requests and the other decides. */
  withdrawCall(callId: Hex, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "withdrawCall", [callId, cdmHash]);
  }

  /** A call that replaces a cancelled call (task-csa-call-replacement): same caller, called party and kind. */
  issueReplacementCall(callId: Hex, replacedCallId: Hex, kind: number, to: Address, amount: bigint, deadline: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "issueReplacementCall", [callId, replacedCallId, kind, to, amount, deadline, cdmHash]);
  }

  requestCancellation(callId: Hex, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "requestCancellation", [callId, cdmHash]);
  }

  decideCancellation(callId: Hex, accept: boolean, cdmHash: Hex) {
    return this.send(this.reg.contracts.marginCall, marginCallAbi, "decideCancellation", [callId, accept, cdmHash]);
  }

  approve(token: Address, spender: Address, amount: bigint) {
    return this.send(token, erc20Abi, "approve", [spender, amount]);
  }

  pledge(callId: Hex, proposalId: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "pledge", [callId, proposalId, cdmHash]);
  }

  settleByTransfer(callId: Hex, proposalId: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "settleByTransfer", [callId, proposalId, cdmHash]);
  }

  returnCollateral(callId: Hex, release: AssetArg[], cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "returnCollateral", [callId, release, cdmHash]);
  }

  returnByTransfer(callId: Hex, assets: AssetArg[], cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "returnByTransfer", [callId, assets, cdmHash]);
  }

  /** Seize the pledged initial margin after the oracle feed records the pledgor's default (secured party's key). */
  enforce(callId: Hex, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "enforce", [callId, cdmHash]);
  }

  async enforcement(callId: Hex): Promise<CallStep[]> {
    const network = { name: "besu-prototype", platform: "Hyperledger Besu", chainId: this.reg.chainId };
    const out: CallStep[] = [];
    for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "Enforced", { callId })) {
      const receipt = await this.receipt(l.transactionHash as Hex);
      out.push({
        step: "Enforce", event: "Enforced", cdmHash: (l.args as { cdmHash: Hex }).cdmHash,
        block: l.blockNumber.toString(), logIndex: Number(l.logIndex), txHash: l.transactionHash as Hex,
        contract: (l.address as string).toLowerCase(), network,
        status: receipt.status === "success" ? "Final" : "Reverted",
        txLogs: receipt.logs
          .filter((x) => Number(x.logIndex) !== Number(l.logIndex))
          .map((x) => ({ contract: x.address.toLowerCase(), logIndex: Number(x.logIndex), event: EVENT_BY_TOPIC.get((x.topics[0] ?? "").toLowerCase()) })),
      });
    }
    return out;
  }

  private registerAddress(): Address {
    const a = this.reg.contracts.recordKeeperRegister;
    if (!a) throw new Error("this deployment has no RecordKeeperRegister; redeploy (task-authoritative-record-settlement-enforcement)");
    return a;
  }

  async registerConfirmations(): Promise<RegisterConfirmation[]> {
    return (await this.scan(this.registerAddress(), registerAbi, "RegisterConfirmed")).map((l) => {
      const a = l.args as { txHash: Hex; token: Address; ref: string };
      return { txHash: a.txHash.toLowerCase() as Hex, token: getAddress(a.token), ref: a.ref, block: l.blockNumber.toString(), confirmationTx: l.transactionHash as Hex };
    });
  }

  async registerTransfers(token: Address): Promise<RegisterTransfer[]> {
    const confirmed = new Set((await this.registerConfirmations()).filter((c) => c.token === getAddress(token)).map((c) => c.txHash));
    return (await this.scan(token, transferAbi, "Transfer")).map((l) => {
      const a = l.args as { from: Address; to: Address; value: bigint };
      const txHash = (l.transactionHash as string).toLowerCase() as Hex;
      return { txHash, block: l.blockNumber.toString(), logIndex: Number(l.logIndex), from: getAddress(a.from), to: getAddress(a.to), value: a.value.toString(), confirmed: confirmed.has(txHash) };
    });
  }

  /**
   * Each register token's Transfer logs joined on the transaction hash with the flow contract's logs. Both come from
   * the cached log index, so no receipt is read; a reverted transaction leaves no logs, so every movement is Final.
   * A transaction whose flow logs name more than one record (a pair-off) is reported once for each.
   */
  async registerMovements(flow: "repo" | "loan" | "triparty", tokens: Address[]): Promise<RegisterMovement[]> {
    const c = this.reg.contracts;
    const address = (flow === "repo" ? c.repoSettlement : flow === "loan" ? c.securitiesLoan : c.tripartySettlement) as Address | undefined;
    if (!address) return [];
    const transferTopic = toEventSelector(transferAbi[0]).toLowerCase();
    const moved = new Map<string, RegisterMovement["txLogs"]>();
    for (const token of tokens) {
      for (const l of await this.contractLogs(token)) {
        if ((l.topics[0] ?? "").toLowerCase() !== transferTopic) continue;
        const tx = (l.transactionHash as string).toLowerCase();
        const logs = moved.get(tx) ?? [];
        logs.push({ contract: (l.address as string).toLowerCase(), logIndex: Number(l.logIndex), event: "Transfer" });
        moved.set(tx, logs);
      }
    }
    const byRecord = new Map<string, RegisterMovement>();
    for (const l of await this.contractLogs(address)) {
      const tx = (l.transactionHash as string).toLowerCase();
      const txLogs = moved.get(tx);
      const recordId = l.topics[1] as Hex | undefined;
      if (!txLogs || !recordId) continue;
      const key = tx + "/" + recordId.toLowerCase();
      const m: RegisterMovement = byRecord.get(key) ?? { recordId: recordId.toLowerCase() as Hex, txHash: tx as Hex, block: l.blockNumber.toString(), events: [], status: "Final", txLogs };
      const name = EVENT_BY_TOPIC.get((l.topics[0] ?? "").toLowerCase());
      if (name && !m.events.includes(name)) m.events.push(name);
      byRecord.set(key, m);
    }
    return [...byRecord.values()];
  }

  confirmRegister(txHash: Hex, token: Address, ref: string) {
    return this.send(this.registerAddress(), registerAbi, "confirm", [txHash, token, ref]);
  }

  /** Close out after the pledgor's default (secured party's key, flow-close-out-netting): the control contract applies
   * the pledged collateral to `owed` and returns the surplus to the pledgor. */
  closeOut(closeOutId: Hex, pledgor: Address, owed: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "closeOut", [closeOutId, pledgor, owed, cdmHash]);
  }

  /** Reclaim after the secured party's default (pledgor's key, wp-adr-two-way-im): the control contract returns the
   * pledgor's whole escrow on the leg once the oracle feed records the secured party's default. */
  reclaim(reclaimId: Hex, securedParty: Address, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "reclaim", [reclaimId, securedParty, cdmHash]);
  }

  /** Every close-out a party is in, from the ClosedOut events (securedParty and pledgor are indexed). */
  async listCloseOuts(party: Address): Promise<CloseOutRecord[]> {
    const out: CloseOutRecord[] = [];
    for (const args of [{ securedParty: party }, { pledgor: party }]) {
      for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "ClosedOut", args)) {
        const a = l.args as { closeOutId: Hex; securedParty: Address; pledgor: Address; owed: bigint; applied: bigint; cdmHash: Hex };
        out.push({ ...a, block: l.blockNumber.toString(), txHash: l.transactionHash as Hex });
      }
    }
    return out;
  }

  /** Amendment of the agreement terms (flow-agreement-amendment): either party proposes, the other decides. */
  proposeAmendment(amendmentId: Hex, pledgor: Address, securedParty: Address, terms: HaircutTermArg[], beforeHash: Hex, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "proposeAmendment", [amendmentId, pledgor, securedParty, terms, beforeHash, cdmHash]);
  }

  decideAmendment(amendmentId: Hex, consent: boolean, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "decideAmendment", [amendmentId, consent, cdmHash]);
  }

  async getAmendment(amendmentId: Hex): Promise<OnChainAmendment> {
    const [a, terms] = (await this.pub.readContract({ address: this.reg.contracts.collateralControl, abi: controlAbi, functionName: "getAmendment", args: [amendmentId] })) as unknown as [
      Omit<OnChainAmendment, "terms" | "state"> & { state: number }, HaircutTermArg[],
    ];
    return { ...a, state: Number(a.state), terms: terms.map((t) => ({ token: t.token, eligible: t.eligible, haircutBps: Number(t.haircutBps) })) };
  }

  /** Every amendment a party is in, from the AmendmentProposed events (pledgor and securedParty are indexed), in chain order. */
  async listAmendments(party: Address) {
    const seen = new Map<string, { amendmentId: Hex; block: string; order: bigint }>();
    for (const args of [{ pledgor: party }, { securedParty: party }]) {
      for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "AmendmentProposed", args)) {
        const id = (l.args as { amendmentId: Hex }).amendmentId;
        seen.set(id, { amendmentId: id, block: l.blockNumber.toString(), order: l.blockNumber * 100000n + BigInt(l.logIndex) });
      }
    }
    const out = [];
    for (const r of [...seen.values()].sort((x, y) => (x.order < y.order ? -1 : 1))) {
      out.push({ amendmentId: r.amendmentId, block: r.block, amendment: await this.getAmendment(r.amendmentId) });
    }
    return out;
  }

  /** The terms that apply between a pledgor and a secured party: agreement hash, pending amendment, each registry
   * token's eligibility and haircut. */
  async pairTerms(pledgor: Address, securedParty: Address) {
    const read = (functionName: string, args: unknown[]) =>
      this.pub.readContract({ address: this.reg.contracts.collateralControl, abi: controlAbi, functionName, args } as never);
    const eligibility: HaircutTermArg[] = [];
    for (const t of Object.values(this.reg.tokens) as { address: Address }[]) {
      const e = (await read("eligibilityFor", [pledgor, securedParty, t.address])) as { eligible: boolean; haircutBps: number };
      eligibility.push({ token: t.address, eligible: e.eligible, haircutBps: Number(e.haircutBps) });
    }
    return {
      agreementHash: (await read("agreementHash", [pledgor, securedParty])) as Hex,
      pendingAmendment: (await read("pendingAmendment", [pledgor, securedParty])) as Hex,
      eligibility,
    };
  }

  /** Master agreement terms (wp-adr-repo-gmra-terms): either party proposes a terms amendment to the other, who
   * decides; the pair's terms hash for the kind moves on consent. On-chain the proposer is stored as `pledgor` and the
   * counterparty as `securedParty`. */
  proposeTermsAmendment(amendmentId: Hex, kind: string, counterparty: Address, beforeHash: Hex, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "proposeTermsAmendment", [amendmentId, kindOf(kind), counterparty, beforeHash, cdmHash]);
  }

  decideTermsAmendment(amendmentId: Hex, consent: boolean, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "decideTermsAmendment", [amendmentId, consent, cdmHash]);
  }

  async masterTerms(kind: string, x: Address, y: Address) {
    const read = (functionName: string, args: unknown[]) =>
      this.pub.readContract({ address: this.reg.contracts.collateralControl, abi: controlAbi, functionName, args } as never);
    const pair = (await read("pairKey", [x, y])) as Hex;
    return {
      termsHash: (await read("termsHash", [kindOf(kind), pair])) as Hex,
      pendingAmendment: (await read("pendingTermsAmendment", [kindOf(kind), pair])) as Hex,
    };
  }

  /** Every terms amendment of a kind that a party proposed or received, in chain order. */
  async listTermsAmendments(kind: string, party: Address) {
    const out = [];
    for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "TermsAmendmentProposed", { kind: kindOf(kind) })) {
      const a = l.args as { amendmentId: Hex; proposer: Address; counterparty: Address };
      if (getAddress(a.proposer) !== getAddress(party) && getAddress(a.counterparty) !== getAddress(party)) continue;
      out.push({ amendmentId: a.amendmentId, block: l.blockNumber.toString(), amendment: await this.getAmendment(a.amendmentId) });
    }
    return out;
  }

  /** Interest on cash collateral (flow-interest-on-cash): the secured party states the amount (and pays it when
   * positive); the pledgor pays a negative amount. */
  stateInterest(interestId: Hex, pledgor: Address, cashToken: Address, amount: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "stateInterest", [interestId, pledgor, cashToken, amount, cdmHash]);
  }

  payInterest(interestId: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "payInterest", [interestId]);
  }

  async getInterest(interestId: Hex) {
    const s = (await this.pub.readContract({ address: this.reg.contracts.collateralControl, abi: controlAbi, functionName: "getInterest", args: [interestId] })) as {
      pledgor: Address; securedParty: Address; cashToken: Address; amount: bigint; state: number; cdmHash: Hex;
    };
    return { pledgor: s.pledgor, securedParty: s.securedParty, cashToken: s.cashToken, amount: s.amount, state: Number(s.state), cdmHash: s.cdmHash };
  }

  /** Settlement netting (flow-settlement-netting): the secured party holds an Interest Amount for netting; the party
   * owing the net settles the day's VM calls, VM returns and held Interest Amounts by one transfer of the cash token. */
  stateInterestForNetting(interestId: Hex, pledgor: Address, cashToken: Address, amount: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "stateInterestForNetting", [interestId, pledgor, cashToken, amount, cdmHash]);
  }

  settleNetted(nettingId: Hex, callIds: Hex[], callCdmHashes: Hex[], interestIds: Hex[], cashToken: Address, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "settleNetted", [nettingId, callIds, callCdmHashes, interestIds, cashToken, cdmHash]);
  }

  async nettedIn(id: Hex) {
    return (await this.pub.readContract({ address: this.reg.contracts.collateralControl, abi: controlAbi, functionName: "nettedIn", args: [id] })) as Hex;
  }

  /** Every netting a party is in, from the SettlementNetted events, with the calls and interest statements it settled. */
  async listNettings(party: Address): Promise<NettingRecord[]> {
    const out: NettingRecord[] = [];
    for (const args of [{ settledBy: party }, { counterparty: party }]) {
      for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "SettlementNetted", args)) {
        const a = l.args as { nettingId: Hex; settledBy: Address; counterparty: Address; cashToken: Address; amount: bigint; cdmHash: Hex };
        const [, callIds, interestIds] = (await this.pub.readContract({
          address: this.reg.contracts.collateralControl, abi: controlAbi, functionName: "getNetting", args: [a.nettingId],
        })) as [unknown, Hex[], Hex[]];
        out.push({ ...a, callIds: [...callIds], interestIds: [...interestIds], block: l.blockNumber.toString(), txHash: l.transactionHash as Hex });
      }
    }
    return out;
  }

  /** Every interest statement a party is in, from the InterestStated events, with the current state. */
  async listInterest(party: Address): Promise<InterestRecord[]> {
    const out: InterestRecord[] = [];
    for (const args of [{ securedParty: party }, { pledgor: party }]) {
      for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "InterestStated", args)) {
        const a = l.args as { interestId: Hex; securedParty: Address; pledgor: Address; cashToken: Address; amount: bigint; cdmHash: Hex };
        const { state } = await this.getInterest(a.interestId);
        out.push({ ...a, state, block: l.blockNumber.toString(), txHash: l.transactionHash as Hex });
      }
    }
    return out;
  }

  /** Substitution steps (flow-substitution): the pledgor requests and settles, the secured party decides. */
  requestSubstitution(substitutionId: Hex, securedParty: Address, original: AssetArg[], substitute: AssetArg[], cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "requestSubstitution", [substitutionId, securedParty, original, substitute, cdmHash]);
  }

  decideSubstitution(substitutionId: Hex, consent: boolean, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "decideSubstitution", [substitutionId, consent, cdmHash]);
  }

  settleSubstitution(substitutionId: Hex, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "settleSubstitution", [substitutionId, cdmHash]);
  }

  async getSubstitution(substitutionId: Hex): Promise<OnChainSubstitution> {
    return (await this.pub.readContract({
      address: this.reg.contracts.collateralControl, abi: controlAbi, functionName: "getSubstitution", args: [substitutionId],
    })) as OnChainSubstitution;
  }

  async getSubstitutionAssets(substitutionId: Hex): Promise<{ original: AssetArg[]; substitute: AssetArg[] }> {
    const [original, substitute] = (await this.pub.readContract({
      address: this.reg.contracts.collateralControl, abi: controlAbi, functionName: "getSubstitutionAssets", args: [substitutionId],
    })) as [AssetArg[], AssetArg[]];
    return { original: [...original], substitute: [...substitute] };
  }

  /** The substitutions a party is in, from the SubstitutionRequested events (pledgor and securedParty are indexed). */
  async listSubstitutions(party: Address): Promise<{ substitutionId: Hex; substitution: OnChainSubstitution }[]> {
    const ids = new Set<Hex>();
    for (const args of [{ pledgor: party }, { securedParty: party }]) {
      for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, "SubstitutionRequested", args)) {
        ids.add((l.args as { substitutionId: Hex }).substitutionId);
      }
    }
    const out = [];
    for (const substitutionId of ids) out.push({ substitutionId, substitution: await this.getSubstitution(substitutionId) });
    return out;
  }

  /** The steps of one substitution in chain order, each with its CDM hash: the ordered list the service folds. */
  async substitutionSteps(substitutionId: Hex): Promise<SubstitutionStep[]> {
    const specs: { name: string; step: SubstitutionStep["step"] }[] = [
      { name: "SubstitutionRequested", step: "request" },
      { name: "SubstitutionDecided", step: "consent" },
      { name: "SubstitutionSettled", step: "settle" },
    ];
    const rows: (SubstitutionStep & { bn: bigint })[] = [];
    for (const s of specs) {
      for (const l of await this.scan(this.reg.contracts.collateralControl, controlAbi, s.name, { substitutionId })) {
        const a = l.args as { cdmHash: Hex; consent?: boolean };
        rows.push({
          step: s.step, event: s.name, cdmHash: a.cdmHash, consent: a.consent, block: l.blockNumber.toString(), timestamp: 0,
          logIndex: Number(l.logIndex), txHash: l.transactionHash as Hex, bn: l.blockNumber,
        });
      }
    }
    rows.sort((x, y) => (x.bn === y.bn ? x.logIndex - y.logIndex : x.bn < y.bn ? -1 : 1));
    for (const r of rows) r.timestamp = Number((await this.pub.getBlock({ blockNumber: r.bn })).timestamp);
    return rows.map(({ bn, ...r }) => r);
  }

  /** The escrow between a pledgor and a secured party and the feed prices, as of the end of `block`. Both parties read
   * the same block from their own nodes, so the CDM portfolio they build from it is the same (flow-substitution). */
  async escrowAt(pledgor: Address, securedParty: Address, block: bigint): Promise<{ token: Address; qty: bigint; price: bigint | null }[]> {
    const control = this.reg.contracts.collateralControl;
    const feed = this.reg.contracts.oracleFeed;
    const tokens = (await this.pub.readContract({
      address: control, abi: controlAbi, functionName: "pledgedTokens", args: [pledgor, securedParty], blockNumber: block,
    })) as Address[];
    const out = [];
    for (const token of tokens) {
      const qty = (await this.pub.readContract({
        address: control, abi: controlAbi, functionName: "pledgedBalance", args: [pledgor, securedParty, token], blockNumber: block,
      })) as bigint;
      const has = (await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "hasPrice", args: [token], blockNumber: block })) as boolean;
      const price = has
        ? ((await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "price", args: [token], blockNumber: block })) as bigint)
        : null;
      out.push({ token: getAddress(token), qty, price });
    }
    return out;
  }

  // The log index (task-live-read-latency): every log of each contract the gateway reads, from the deploy block,
  // extended on each read by the blocks mined since the last one, in windows under Besu's eth_getLogs range cap. A
  // read no longer rescans the chain from the deploy block, so its cost stops growing with chain age. QBFT finalises
  // at mining (concept-asr-settlement-finality), so indexed logs never change.
  private readonly logIndex = new Map<string, { to: bigint; logs: any[]; busy: Promise<unknown> }>();

  private async contractLogs(address: Address): Promise<any[]> {
    const key = address.toLowerCase();
    let entry = this.logIndex.get(key);
    if (!entry) {
      entry = { to: BigInt(this.reg.deployBlock ?? 0) - 1n, logs: [], busy: Promise.resolve() };
      this.logIndex.set(key, entry);
    }
    const e = entry;
    const run = e.busy.then(async () => {
      const latest = await this.latestBlock();
      const WINDOW = 4000n;
      for (let from = e.to + 1n; from <= latest; from += WINDOW) {
        const to = from + WINDOW - 1n > latest ? latest : from + WINDOW - 1n;
        e.logs.push(...(await this.pub.getLogs({ address, fromBlock: from, toBlock: to })));
        e.to = to;
      }
    });
    e.busy = run.catch(() => undefined);
    await run;
    return e.logs;
  }

  // Logs of one event, decoded, whose arguments equal every value in args (the indexed-topic filter of eth_getLogs).
  private async scan(address: Address, abi: readonly any[], name: string, args: Record<string, unknown> = {}): Promise<any[]> {
    const event = abi.find((x: any) => x.type === "event" && x.name === name);
    if (!event) throw new Error(`no event ${name} in the ABI`);
    const selector = toEventSelector(event).toLowerCase();
    const same = (x: unknown, y: unknown) => String(x).toLowerCase() === String(y).toLowerCase();
    const out: any[] = [];
    for (const log of await this.contractLogs(address)) {
      if ((log.topics[0] ?? "").toLowerCase() !== selector) continue;
      const decoded = decodeEventLog({ abi: [event], data: log.data, topics: log.topics }) as { args: Record<string, unknown> };
      if (!Object.entries(args).every(([k, v]) => same(decoded.args[k], v))) continue;
      out.push({ ...log, args: decoded.args, eventName: name });
    }
    return out;
  }

  // Mined receipts never change, so each is read once.
  private readonly receiptCache = new Map<Hex, Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>>();

  private async receipt(hash: Hex) {
    let r = this.receiptCache.get(hash);
    if (!r) {
      r = await this.pub.getTransactionReceipt({ hash });
      this.receiptCache.set(hash, r);
    }
    return r;
  }

  /** Write a party's default status to the oracle feed. Only the publisher (the market operator's key) may write, so
   * this succeeds only on the operator's gateway instance; the contract reverts NotPublisher for any other key. */
  async setDefault(party: Address, inDefault: boolean) {
    if (getAddress(this.reg.publisher) !== this.account) {
      throw new Error(`this gateway signs as ${this.account}, not the oracle publisher ${this.reg.publisher}; default status is written through the operator's gateway`);
    }
    return this.send(this.reg.contracts.oracleFeed, oracleAbi, "setDefault", [party, inDefault]);
  }

  /** Write a token's price (scaled by OracleFeed.PRICE_SCALE) to the oracle feed (flow-oracle-update transition 3).
   * Publisher key only, like setDefault: only the operator's gateway instance can serve it. */
  async publishPrice(token: Address, priceScaled: bigint) {
    if (getAddress(this.reg.publisher) !== this.account) {
      throw new Error(`this gateway signs as ${this.account}, not the oracle publisher ${this.reg.publisher}; prices are written through the operator's gateway`);
    }
    return this.send(this.reg.contracts.oracleFeed, oracleAbi, "publishPrice", [token, priceScaled]);
  }

  /** A token's price on the oracle feed (scaled by PRICE_SCALE), or null when none has been published. */
  async priceOf(token: Address): Promise<bigint | null> {
    const feed = this.reg.contracts.oracleFeed;
    if (!(await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "hasPrice", args: [token] }))) return null;
    return (await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "price", args: [token] })) as bigint;
  }

  async isDefaulted(party: Address): Promise<boolean> {
    return (await this.pub.readContract({
      address: this.reg.contracts.oracleFeed,
      abi: oracleAbi,
      functionName: "isDefaulted",
      args: [party],
    })) as boolean;
  }

  /** The SecuritiesLoan address, which each party approves for what it delivers. */
  loanContract(): Address {
    const a = this.reg.contracts.securitiesLoan;
    if (!a) throw new Error("no SecuritiesLoan in the deployment registry; redeploy the contracts");
    return a;
  }

  bookLoan(loanId: Hex, borrower: Address, security: Address, quantity: bigint, collateral: Address, collateralAmount: bigint, tradeHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "book", [loanId, borrower, security, quantity, collateral, collateralAmount, tradeHash]);
  }

  affirmLoan(loanId: Hex, tradeHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "affirm", [loanId, tradeHash]);
  }

  instructLoanDelivery(loanId: Hex, cdmHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "instructDelivery", [loanId, cdmHash]);
  }

  instructLoanReturn(loanId: Hex, quantity: bigint, collateralAmount: bigint, cdmHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "instructReturn", [loanId, quantity, collateralAmount, cdmHash]);
  }

  recallLoan(loanId: Hex, quantity: bigint, settlementDate: number, noticeHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "recall", [loanId, quantity, settlementDate, noticeHash]);
  }

  withdrawLoanRecall(loanId: Hex, withdrawalHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "withdrawRecall", [loanId, withdrawalHash]);
  }

  requestLoanSubstitution(loanId: Hex, collateral: Address, collateralAmount: bigint, cdmHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "requestSubstitution", [loanId, collateral, collateralAmount, cdmHash]);
  }

  agreeLoanSubstitution(loanId: Hex, cdmHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "agreeSubstitution", [loanId, cdmHash]);
  }

  refuseLoanSubstitution(loanId: Hex) {
    return this.send(this.loanContract(), loanAbi, "refuseSubstitution", [loanId]);
  }

  billLoan(loanId: Hex, cashToken: Address, periodEnd: number, amount: bigint, invoiceHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "bill", [loanId, cashToken, periodEnd, amount, invoiceHash]);
  }

  payLoanBill(loanId: Hex, invoiceHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "payBill", [loanId, invoiceHash]);
  }

  refuseLoanBill(loanId: Hex) {
    return this.send(this.loanContract(), loanAbi, "refuseBill", [loanId]);
  }

  async getLoan(loanId: Hex): Promise<OnChainLoan> {
    const address = this.loanContract();
    const l = (await this.pub.readContract({ address, abi: loanAbi, functionName: "getLoan", args: [loanId] })) as Omit<OnChainLoan, "loanId" | "state" | "delivery" | "pendingReturn" | "recall" | "substitution" | "bill" | "closeOutId"> & { state: number };
    const [cq, cd, cn] = (await this.pub.readContract({ address, abi: loanAbi, functionName: "getRecall", args: [loanId] })) as readonly [bigint, number, Hex];
    const [bb, bt, be, ba, bh, bth] = (await this.pub.readContract({ address, abi: loanAbi, functionName: "getBill", args: [loanId] })) as readonly [Address, Address, number, bigint, Hex, number];
    const [sc, sa, sh] = (await this.pub.readContract({ address, abi: loanAbi, functionName: "getSubstitution", args: [loanId] })) as readonly [Address, bigint, Hex];
    const [dl, db] = (await this.pub.readContract({ address, abi: loanAbi, functionName: "getDeliveryInstructions", args: [loanId] })) as readonly [Hex, Hex];
    const [rl, rb, rq, rc] = (await this.pub.readContract({ address, abi: loanAbi, functionName: "getReturnInstructions", args: [loanId] })) as readonly [Hex, Hex, bigint, bigint];
    const closeOutId = (await this.pub.readContract({ address, abi: loanAbi, functionName: "closeOutOf", args: [loanId] })) as Hex;
    const state = Number(l.state);
    return { ...l, loanId, closeOutId, state: LoanStateName[state] ?? String(state), delivery: { lender: dl, borrower: db }, pendingReturn: { lender: rl, borrower: rb, quantity: rq, collateralAmount: rc }, recall: { quantity: cq, settlementDate: Number(cd), noticeHash: cn }, substitution: { collateral: sc, collateralAmount: sa, cdmHash: sh }, bill: { biller: bb, cashToken: bt, periodEnd: Number(be), amount: ba, invoiceHash: bh, billedThrough: Number(bth) } };
  }

  async listLoans(party: Address) {
    const ids = (await this.pub.readContract({ address: this.loanContract(), abi: loanAbi, functionName: "loansOf", args: [party] })) as readonly Hex[];
    return Promise.all(ids.map((id) => this.getLoan(id)));
  }

  /** The non-defaulting party serves a GMSLA Default Notice (wp-adr-gmsla-default-close-out) with its CDM record's hash. */
  serveLoanDefaultNotice(defaulting: Address, noticeHash: Hex) {
    return this.send(this.loanContract(), loanAbi, "serveDefaultNotice", [defaulting, noticeHash]);
  }

  /** The non-defaulting party closes out every open loan with the defaulting party under the statement hash. */
  closeOutLoanDefault(closeOutId: Hex, defaulting: Address, noticeHash: Hex, cdmHash: Hex, cash: Address, payer: Address, amount: bigint) {
    return this.send(this.loanContract(), loanAbi, "closeOutDefault", [closeOutId, defaulting, noticeHash, cdmHash, cash, payer, amount]);
  }

  /** The party that owes a GMSLA close-out balance pays it (after approving the loan contract for the amount). */
  payLoanCloseOut(closeOutId: Hex) {
    return this.send(this.loanContract(), loanAbi, "payCloseOut", [closeOutId]);
  }

  async loanDefaultNotice(nonDefaulting: Address, defaulting: Address): Promise<Hex> {
    return (await this.pub.readContract({ address: this.loanContract(), abi: loanAbi, functionName: "defaultNotice", args: [nonDefaulting, defaulting] })) as Hex;
  }

  async listLoanCloseOuts(party: Address): Promise<OnChainRepoCloseOut[]> {
    const address = this.loanContract();
    const ids = (await this.pub.readContract({ address, abi: loanAbi, functionName: "closeOutsOf", args: [party] })) as readonly Hex[];
    return Promise.all(ids.map(async (closeOutId) => ({
      closeOutId,
      ...((await this.pub.readContract({ address, abi: loanAbi, functionName: "getCloseOut", args: [closeOutId] })) as Omit<OnChainRepoCloseOut, "closeOutId">),
    })));
  }

  /** The TripartySettlement address: the triparty agent's books. */
  tripartyContract(): Address {
    const a = this.reg.contracts.tripartySettlement;
    if (!a) throw new Error("no TripartySettlement in the deployment registry; redeploy the contracts");
    return a;
  }

  /** The giver proposes triparty terms; the id is the giver's current terms with the receiver and the agent. */
  async proposeTripartyTerms(receiver: Address, agent: Address, termsHash: Hex) {
    const r = await this.send(this.tripartyContract(), tripartyAbi, "proposeTerms", [receiver, agent, termsHash]);
    const termsId = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "currentTerms", args: [this.account, receiver, agent] })) as Hex;
    return { ...r, termsId };
  }

  affirmTripartyTerms(termsId: Hex, termsHash: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "affirmTerms", [termsId, termsHash]);
  }

  refuseTripartyTerms(termsId: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "refuseTerms", [termsId]);
  }

  terminateTripartyTerms(termsId: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "terminateTerms", [termsId]);
  }

  async getTripartyTerms(termsId: Hex): Promise<OnChainTripartyTerms> {
    const t = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "getTerms", args: [termsId] })) as {
      giver: Address; receiver: Address; agent: Address; termsHash: Hex; state: number; receiverAffirmed: boolean; agentAffirmed: boolean; proposedAt: bigint; effectiveAt: bigint };
    return { termsId, ...t, state: TripartyTermsStateName[t.state] ?? String(t.state) };
  }

  async listTripartyTerms(party: Address) {
    const ids = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "termsOf", args: [party] })) as readonly Hex[];
    return Promise.all(ids.map((id) => this.getTripartyTerms(id)));
  }

  async depositTriparty(termsId: Hex, token: Address, amount: bigint, rank: bigint) {
    await this.approve(token, this.tripartyContract(), amount);
    return this.send(this.tripartyContract(), tripartyAbi, "deposit", [termsId, token, amount, rank]);
  }

  withdrawTriparty(termsId: Hex, token: Address, amount: bigint) {
    return this.send(this.tripartyContract(), tripartyAbi, "withdraw", [termsId, token, amount]);
  }

  /** The giver requests a repo; the id is the last repo under the terms. */
  async requestTripartyRepo(termsId: Hex, requestHash: Hex, cash: Address, purchasePrice: bigint) {
    const r = await this.send(this.tripartyContract(), tripartyAbi, "requestRepo", [termsId, requestHash, cash, purchasePrice]);
    const ids = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "reposOf", args: [termsId] })) as readonly Hex[];
    return { ...r, repoId: ids[ids.length - 1] };
  }

  affirmTripartyRequest(repoId: Hex, requestHash: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "affirmRequest", [repoId, requestHash]);
  }

  allocateTriparty(repoId: Hex, allocationHash: Hex, tokens: Address[], amounts: bigint[]) {
    return this.send(this.tripartyContract(), tripartyAbi, "allocate", [repoId, allocationHash, tokens, amounts]);
  }

  refuseTripartyAllocation(repoId: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "refuseAllocation", [repoId]);
  }

  async settleTripartyPurchase(repoId: Hex, allocationHash: Hex) {
    const r = await this.getTripartyRepo(repoId);
    await this.approve(r.cash, this.tripartyContract(), r.purchasePrice);
    return this.send(this.tripartyContract(), tripartyAbi, "settlePurchase", [repoId, allocationHash]);
  }

  cancelTripartyRepo(repoId: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "cancelRepo", [repoId]);
  }

  prepareTripartyTradeEnd(repoId: Hex, tradeEndHash: Hex, repurchasePrice: bigint) {
    return this.send(this.tripartyContract(), tripartyAbi, "prepareTradeEnd", [repoId, tradeEndHash, repurchasePrice]);
  }

  async settleTripartyRepurchase(repoId: Hex, tradeEndHash: Hex) {
    const r = await this.getTripartyRepo(repoId);
    const e = await this.tripartyTradeEnd(repoId);
    if (!e) throw new Error("no trade end prepared");
    await this.approve(r.cash, this.tripartyContract(), e.repurchasePrice);
    return this.send(this.tripartyContract(), tripartyAbi, "settleRepurchase", [repoId, tradeEndHash]);
  }

  recordTripartyReport(termsId: Hex, reportHash: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "recordReport", [termsId, reportHash]);
  }

  async tripartyReports(termsId: Hex) {
    const rs = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "reportsOf", args: [termsId] })) as readonly { reportHash: Hex; blockNumber: bigint }[];
    return rs.map((r) => ({ reportHash: r.reportHash, block: r.blockNumber }));
  }

  /** The terms as a report's check reads them: each repo's state and holding, the free account and the feed prices of
   *  all those tokens, at the end of the block. */
  async tripartyTermsAt(termsId: Hex, block: bigint) {
    const tri = this.tripartyContract();
    const feed = this.reg.contracts.oracleFeed;
    const ids = (await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "reposOf", args: [termsId], blockNumber: block })) as readonly Hex[];
    const repos = [];
    for (const repoId of ids) {
      const r = (await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "getRepo", args: [repoId], blockNumber: block })) as { state: number };
      const [tokens, amounts] = (await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "allocationOf", args: [repoId], blockNumber: block })) as readonly [readonly Address[], readonly bigint[]];
      repos.push({ repoId, state: TripartyRepoStateName[r.state] ?? String(r.state), allocation: tokens.map((token, i) => ({ token: getAddress(token), amount: amounts[i] })) });
    }
    const free = [...((await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "freeOf", args: [termsId], blockNumber: block })) as readonly TripartyHolding[])];
    const prices = [];
    for (const token of new Set([...repos.flatMap((r) => r.allocation.map((a) => a.token)), ...free.map((h) => getAddress(h.token))])) {
      const has = (await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "hasPrice", args: [token], blockNumber: block })) as boolean;
      const price = has ? ((await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "price", args: [token], blockNumber: block })) as bigint) : null;
      prices.push({ token, price });
    }
    return { repos, free, prices };
  }

  async tripartyTradeEnd(repoId: Hex) {
    const e = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "tradeEndOf", args: [repoId] })) as { tradeEndHash: Hex; repurchasePrice: bigint; blockNumber: bigint };
    return /^0x0+$/.test(e.tradeEndHash) ? null : { tradeEndHash: e.tradeEndHash, repurchasePrice: e.repurchasePrice, block: e.blockNumber };
  }

  async getTripartyRepo(repoId: Hex): Promise<OnChainTripartyRepo> {
    const r = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "getRepo", args: [repoId] })) as {
      termsId: Hex; requestHash: Hex; cash: Address; purchasePrice: bigint; state: number; allocationHash: Hex; requestedAt: bigint; settledAt: bigint };
    const [tokens, amounts] = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "allocationOf", args: [repoId] })) as readonly [readonly Address[], readonly bigint[]];
    return { repoId, ...r, state: TripartyRepoStateName[r.state] ?? String(r.state), allocation: tokens.map((token, i) => ({ token, amount: amounts[i] })) };
  }

  async listTripartyRepos(termsId: Hex) {
    const ids = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "reposOf", args: [termsId] })) as readonly Hex[];
    return Promise.all(ids.map((id) => this.getTripartyRepo(id)));
  }

  async tripartyFree(termsId: Hex) {
    return [...((await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "freeOf", args: [termsId] })) as readonly TripartyHolding[])];
  }

  revalueTriparty(repoId: Hex, revaluationHash: Hex, tokens: Address[], amounts: bigint[]) {
    return this.send(this.tripartyContract(), tripartyAbi, "revalue", [repoId, revaluationHash, tokens, amounts]);
  }

  async tripartyChanges(repoId: Hex) {
    const kinds = { 1: "revaluation", 2: "substitution", 3: "declined" } as const;
    const cs = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "changesOf", args: [repoId] })) as readonly { hash: Hex; blockNumber: bigint; kind: number }[];
    return cs.map((c) => ({ hash: c.hash, block: c.blockNumber, kind: kinds[c.kind as 1 | 2 | 3] }));
  }

  async tripartyPendingSubstitution(repoId: Hex) {
    const p = (await this.pub.readContract({ address: this.tripartyContract(), abi: tripartyAbi, functionName: "pendingSubstitutionOf", args: [repoId] })) as { requestHash: Hex; requester: Address };
    return /^0x0+$/.test(p.requestHash) ? null : { requestHash: p.requestHash, requester: getAddress(p.requester) };
  }

  requestTripartySubstitution(repoId: Hex, requestHash: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "requestSubstitution", [repoId, requestHash]);
  }

  withdrawTripartySubstitution(repoId: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "withdrawSubstitution", [repoId]);
  }

  substituteTriparty(repoId: Hex, substitutionHash: Hex, tokens: Address[], amounts: bigint[]) {
    return this.send(this.tripartyContract(), tripartyAbi, "substitute", [repoId, substitutionHash, tokens, amounts]);
  }

  declineTripartySubstitution(repoId: Hex, substitutionHash: Hex) {
    return this.send(this.tripartyContract(), tripartyAbi, "declineSubstitution", [repoId, substitutionHash]);
  }

  /** The chain as a revaluation's check reads it (wp-adr-triparty-revaluation): the repo's holding, the free account of
   *  its terms and the feed price of each of those tokens, at the end of the block (the block before a revaluation). */
  async tripartyRepoAt(repoId: Hex, block: bigint) {
    const tri = this.tripartyContract();
    const feed = this.reg.contracts.oracleFeed;
    const r = (await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "getRepo", args: [repoId], blockNumber: block })) as { termsId: Hex };
    const [tokens, amounts] = (await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "allocationOf", args: [repoId], blockNumber: block })) as readonly [readonly Address[], readonly bigint[]];
    const free = [...((await this.pub.readContract({ address: tri, abi: tripartyAbi, functionName: "freeOf", args: [r.termsId], blockNumber: block })) as readonly TripartyHolding[])];
    const prices = [];
    for (const token of new Set([...tokens, ...free.map((h) => h.token)].map((t) => getAddress(t)))) {
      const has = (await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "hasPrice", args: [token], blockNumber: block })) as boolean;
      const price = has ? ((await this.pub.readContract({ address: feed, abi: oracleAbi, functionName: "price", args: [token], blockNumber: block })) as bigint) : null;
      prices.push({ token, price });
    }
    return { allocation: tokens.map((token, i) => ({ token: getAddress(token), amount: amounts[i] })), free, prices };
  }

  /** The RepoSettlement address, which each party approves for its leg. */
  repoContract(): Address {
    const a = this.reg.contracts.repoSettlement;
    if (!a) throw new Error("no RepoSettlement in the deployment registry; redeploy the contracts");
    return a;
  }

  bookRepo(repoId: Hex, buyer: Address, security: Address, quantity: bigint, cash: Address, purchasePrice: bigint, repurchasePrice: bigint, tradeHash: Hex, buySellBack = false) {
    return this.send(this.repoContract(), repoAbi, buySellBack ? "bookBuySellBack" : "book", [repoId, buyer, security, quantity, cash, purchasePrice, repurchasePrice, tradeHash]);
  }

  affirmRepo(repoId: Hex, tradeHash: Hex) {
    return this.send(this.repoContract(), repoAbi, "affirm", [repoId, tradeHash]);
  }

  instructRepo(repoId: Hex, phase: "purchase" | "repurchase", cdmHash: Hex) {
    if (!(phase in RepoPhase)) throw new Error(`unknown repo phase ${phase}`);
    return this.send(this.repoContract(), repoAbi, "instruct", [repoId, RepoPhase[phase], cdmHash]);
  }

  instructRepoReprice(repoId: Hex, cdmHash: Hex, newPurchasePrice: bigint, newRepurchasePrice: bigint, cashFromSeller: bigint) {
    return this.send(this.repoContract(), repoAbi, "instructReprice", [repoId, cdmHash, newPurchasePrice, newRepurchasePrice, cashFromSeller]);
  }

  instructRepoAdjustment(repoId: Hex, cdmHash: Hex, newQuantity: bigint, newRepurchasePrice: bigint, accruedFromSeller: bigint) {
    return this.send(this.repoContract(), repoAbi, "instructAdjustment", [repoId, cdmHash, newQuantity, newRepurchasePrice, accruedFromSeller]);
  }

  instructRepoSubstitution(repoId: Hex, cdmHash: Hex, newSecurity: Hex, newQuantity: bigint) {
    return this.send(this.repoContract(), repoAbi, "instructSubstitution", [repoId, cdmHash, newSecurity, newQuantity]);
  }

  refuseRepoSubstitution(repoId: Hex) {
    return this.send(this.repoContract(), repoAbi, "refuseSubstitution", [repoId]);
  }

  instructRepoInterimInterest(repoId: Hex, cdmHash: Hex, amount: bigint, newRepurchasePrice: bigint) {
    return this.send(this.repoContract(), repoAbi, "instructInterimInterest", [repoId, cdmHash, amount, newRepurchasePrice]);
  }

  instructRepoIncome(repoId: Hex, cdmHash: Hex, amount: bigint) {
    return this.send(this.repoContract(), repoAbi, "instructIncome", [repoId, cdmHash, amount]);
  }

  refuseRepoPayment(repoId: Hex, phase: number) {
    return this.send(this.repoContract(), repoAbi, "refusePayment", [repoId, phase]);
  }

  instructRepoRoll(repoId: Hex, cdmHash: Hex, newRepurchasePrice: bigint) {
    return this.send(this.repoContract(), repoAbi, "instructRoll", [repoId, cdmHash, newRepurchasePrice]);
  }

  refuseRepoRoll(repoId: Hex) {
    return this.send(this.repoContract(), repoAbi, "refuseRoll", [repoId]);
  }

  instructRepoPairOff(repoA: Hex, repoB: Hex, cdmHash: Hex) {
    return this.send(this.repoContract(), repoAbi, "instructPairOff", [repoA, repoB, cdmHash]);
  }

  refuseRepoPairOff(repoId: Hex) {
    return this.send(this.repoContract(), repoAbi, "refusePairOff", [repoId]);
  }

  async getRepo(repoId: Hex): Promise<OnChainRepo> {
    const address = this.repoContract();
    const r = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getRepo", args: [repoId] })) as Omit<OnChainRepo, "repoId" | "state" | "instructed"> & { state: number };
    const state = Number(r.state);
    // The phase in progress: the purchase until it settles, then the repurchase.
    const [seller, buyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, state >= 3 ? 1 : 0] })) as readonly [Hex, Hex];
    const [repriceSeller, repriceBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.reprice] })) as readonly [Hex, Hex];
    const [adjustSeller, adjustBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.adjustment] })) as readonly [Hex, Hex];
    const [substituteSeller, substituteBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.substitution] })) as readonly [Hex, Hex];
    const [interimSeller, interimBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.interimInterest] })) as readonly [Hex, Hex];
    const [incomeSeller, incomeBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.income] })) as readonly [Hex, Hex];
    const [rollSeller, rollBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.roll] })) as readonly [Hex, Hex];
    const [pairOffSeller, pairOffBuyer] = (await this.pub.readContract({ address, abi: repoAbi, functionName: "getInstructions", args: [repoId, RepoPhase.pairOff] })) as readonly [Hex, Hex];
    const pairOffWith = (await this.pub.readContract({ address, abi: repoAbi, functionName: "pairOffWith", args: [repoId] })) as Hex;
    const buySellBack = (await this.pub.readContract({ address, abi: repoAbi, functionName: "isBuySellBack", args: [repoId] })) as boolean;
    const incomeDeduction = (await this.pub.readContract({ address, abi: repoAbi, functionName: "incomeDeduction", args: [repoId] })) as bigint;
    return { ...r, repoId, state: RepoStateName[state] ?? String(state), instructed: { seller, buyer }, reprice: { seller: repriceSeller, buyer: repriceBuyer }, adjustment: { seller: adjustSeller, buyer: adjustBuyer }, substitution: { seller: substituteSeller, buyer: substituteBuyer }, interimInterest: { seller: interimSeller, buyer: interimBuyer }, income: { seller: incomeSeller, buyer: incomeBuyer }, roll: { seller: rollSeller, buyer: rollBuyer }, pairOff: { seller: pairOffSeller, buyer: pairOffBuyer }, pairOffWith, buySellBack, incomeDeduction };
  }

  async listRepos(party: Address) {
    const ids = (await this.pub.readContract({ address: this.repoContract(), abi: repoAbi, functionName: "reposOf", args: [party] })) as readonly Hex[];
    return Promise.all(ids.map((id) => this.getRepo(id)));
  }

  /** The non-defaulting party serves a Default Notice (wp-adr-repo-default-close-out) with the hash of its CDM record. */
  serveRepoDefaultNotice(defaulting: Address, noticeHash: Hex) {
    return this.send(this.repoContract(), repoAbi, "serveDefaultNotice", [defaulting, noticeHash]);
  }

  /** The non-defaulting party closes out every purchased repo with the defaulting party under the statement hash. */
  closeOutRepoDefault(closeOutId: Hex, defaulting: Address, noticeHash: Hex, cdmHash: Hex, cash: Address, payer: Address, amount: bigint) {
    return this.send(this.repoContract(), repoAbi, "closeOutDefault", [closeOutId, defaulting, noticeHash, cdmHash, cash, payer, amount]);
  }

  /** The party that owes a close-out balance pays it (after approving the repo contract for the amount). */
  payRepoCloseOut(closeOutId: Hex) {
    return this.send(this.repoContract(), repoAbi, "payCloseOut", [closeOutId]);
  }

  async repoDefaultNotice(nonDefaulting: Address, defaulting: Address): Promise<Hex> {
    return (await this.pub.readContract({ address: this.repoContract(), abi: repoAbi, functionName: "defaultNotice", args: [nonDefaulting, defaulting] })) as Hex;
  }

  async listRepoCloseOuts(party: Address): Promise<OnChainRepoCloseOut[]> {
    const address = this.repoContract();
    const ids = (await this.pub.readContract({ address, abi: repoAbi, functionName: "closeOutsOf", args: [party] })) as readonly Hex[];
    return Promise.all(ids.map(async (closeOutId) => ({
      closeOutId,
      ...((await this.pub.readContract({ address, abi: repoAbi, functionName: "getCloseOut", args: [closeOutId] })) as Omit<OnChainRepoCloseOut, "closeOutId">),
    })));
  }

  private reconciliationAddress(): Address {
    const a = this.reg.contracts.portfolioReconciliation;
    if (!a) throw new Error("no PortfolioReconciliation in the deployment registry; redeploy the contracts");
    return a;
  }

  /** flow-reconciliation: record the hash of this party's trade snapshot with a counterparty. */
  commitSnapshot(snapshotId: Hex, counterparty: Address, snapshotHash: Hex) {
    return this.send(this.reconciliationAddress(), reconciliationAbi, "commitSnapshot", [snapshotId, counterparty, snapshotHash]);
  }

  /** flow-reconciliation: record the hash of the result this party computed from two snapshots. */
  commitResult(reconciliationId: Hex, firstSnapshotId: Hex, secondSnapshotId: Hex, resultHash: Hex, breakCount: number) {
    return this.send(this.reconciliationAddress(), reconciliationAbi, "commitResult", [reconciliationId, firstSnapshotId, secondSnapshotId, resultHash, breakCount]);
  }

  async reconciliationIdOf(firstSnapshotId: Hex, secondSnapshotId: Hex): Promise<Hex> {
    return (await this.pub.readContract({ address: this.reconciliationAddress(), abi: reconciliationAbi, functionName: "reconciliationIdOf", args: [firstSnapshotId, secondSnapshotId] })) as Hex;
  }

  async getSnapshot(snapshotId: Hex) {
    return (await this.pub.readContract({ address: this.reconciliationAddress(), abi: reconciliationAbi, functionName: "getSnapshot", args: [snapshotId] })) as {
      party: Address; counterparty: Address; snapshotHash: Hex; committedAt: bigint;
    };
  }

  async getRun(reconciliationId: Hex) {
    const r = (await this.pub.readContract({ address: this.reconciliationAddress(), abi: reconciliationAbi, functionName: "getRun", args: [reconciliationId] })) as {
      firstSnapshotId: Hex; secondSnapshotId: Hex; firstPartyResult: Hex; secondPartyResult: Hex; breakCount: number; state: number;
    };
    return { ...r, breakCount: Number(r.breakCount), state: RunStateName[Number(r.state)] ?? String(r.state) };
  }

  async getCall(callId: Hex): Promise<OnChainCall> {
    const read = (functionName: "getCall" | "replaces" | "replacementOf") =>
      this.pub.readContract({ address: this.reg.contracts.marginCall, abi: marginCallAbi, functionName, args: [callId] });
    const [call, replaces, replacementOf, nettedIn] = await Promise.all([read("getCall"), read("replaces"), read("replacementOf"), this.nettedIn(callId)]);
    return { ...(call as OnChainCall), replaces: replaces as Hex, replacementOf: replacementOf as Hex, nettedIn };
  }

  // Discover the calls a party is involved in by scanning CallIssued logs (from and to are indexed). Used by each
// participant's workflow service to learn of calls it did not itself issue, with the chain as the shared source.
  async listCalls(party: Address): Promise<{ callId: Hex; call: OnChainCall }[]> {
    const ids = new Set<Hex>();
    for (const log of await this.scan(this.reg.contracts.marginCall, marginCallAbi, "CallIssued")) {
      const a = log.args as { callId: Hex; from: Address; to: Address };
      if (getAddress(a.from) === party || getAddress(a.to) === party) ids.add(a.callId);
    }
    return Promise.all([...ids].map(async (callId) => ({ callId, call: await this.getCall(callId) })));
  }

  // Settlement history for revaluation (flow-revaluation-top-up): the block of every CallSettled event, and the
  // Enforced events for one pledgor/secured-party pair. Enforcement moves the pair's whole escrow to the secured
  // party, so a reader counts only the calls settled after the pair's last enforcement. Scanned in windows like
  // listCalls.
  async settlementHistory(pledgor: Address, securedParty: Address): Promise<{ settled: { callId: Hex; block: string }[]; enforced: { callId: Hex; block: string }[]; closedOut: { closeOutId: Hex; block: string }[]; reclaimed: { reclaimId: Hex; block: string }[] }> {
    const settled = (await this.scan(this.reg.contracts.marginCall, marginCallAbi, "CallSettled")).map((l) => ({
      callId: (l.args as { callId: Hex }).callId, block: l.blockNumber.toString(),
    }));
    const enforced = (await this.scan(this.reg.contracts.collateralControl, controlAbi, "Enforced", { securedParty, pledgor })).map((l) => ({
      callId: (l.args as { callId: Hex }).callId, block: l.blockNumber.toString(),
    }));
    // A close-out empties the pair's escrow like an enforcement (flow-close-out-netting).
    const closedOut = (await this.scan(this.reg.contracts.collateralControl, controlAbi, "ClosedOut", { securedParty, pledgor })).map((l) => ({
      closeOutId: (l.args as { closeOutId: Hex }).closeOutId, block: l.blockNumber.toString(),
    }));
    // A reclaim empties the leg's escrow too (wp-adr-two-way-im).
    const reclaimed = (await this.scan(this.reg.contracts.collateralControl, controlAbi, "Reclaimed", { pledgor, securedParty })).map((l) => ({
      reclaimId: (l.args as { reclaimId: Hex }).reclaimId, block: l.blockNumber.toString(),
    }));
    return { settled, enforced, closedOut, reclaimed };
  }

  // The lifecycle steps of one call, in chain order, each with its CDM hash — the authoritative ordered commitment
  // list for the MarginCallState fold (wp-adr-cdm-payload-carrier). Read from the step events (callId is indexed).
  // Each step also carries what the service needs to build its CDM LedgerAnchor (G25, nw-ledger-anchor-redesign): the
  // network, the transaction, the emitting contract, the transaction status, and the other events of the same
  // transaction (for a settlement, the token Transfer and Pledged or Transferred logs). QBFT finalises at mining
  // (concept-asr-settlement-finality), so a mined, successful transaction is Final.
  async callSteps(callId: Hex): Promise<CallStep[]> {
    const rows: (Omit<CallStep, "status" | "txLogs" | "network"> & { bn: bigint })[] = [];
    for (const s of STEP_EVENTS) {
      for (const l of await this.scan(this.reg.contracts.marginCall, marginCallAbi, s.name, { callId })) {
        rows.push({
          step: s.step, event: s.name, cdmHash: (l.args as { cdmHash?: Hex }).cdmHash as Hex,
          block: l.blockNumber.toString(), logIndex: Number(l.logIndex), txHash: l.transactionHash as Hex,
          contract: (l.address as string).toLowerCase(), bn: l.blockNumber,
        });
      }
    }
    rows.sort((x, y) => (x.bn === y.bn ? x.logIndex - y.logIndex : x.bn < y.bn ? -1 : 1));
    const network = { name: "besu-prototype", platform: "Hyperledger Besu", chainId: this.reg.chainId };
    const receipts = new Map<Hex, Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>>();
    for (const r of rows) if (!receipts.has(r.txHash)) receipts.set(r.txHash, await this.receipt(r.txHash));
    return rows.map(({ bn, ...r }) => {
      const receipt = receipts.get(r.txHash)!;
      const txLogs = receipt.logs
        .filter((x) => Number(x.logIndex) !== r.logIndex)
        .map((x) => ({ contract: x.address.toLowerCase(), logIndex: Number(x.logIndex), event: EVENT_BY_TOPIC.get((x.topics[0] ?? "").toLowerCase()) }));
      return { ...r, network, status: receipt.status === "success" ? "Final" : "Reverted", txLogs };
    });
  }

  // Live subscription to the margin call lifecycle events over the WebSocket RPC (eth_subscribe). Each matching log is
  // delivered to onStep as it is mined, so the stack pushes state changes instead of the console polling. Returns an
  // unwatch function. QBFT finalises at mining, so a delivered event is final (concept-asr-settlement-finality).
  watchSteps(onStep: (e: StepEvent) => void): () => void {
    const stepByName = new Map(STEP_EVENTS.map((s) => [s.name, s.step]));
    return this.ws.watchContractEvent({
      address: this.reg.contracts.marginCall,
      abi: marginCallAbi,
      onLogs: (logs) => {
        for (const log of logs) {
          const step = stepByName.get((log as any).eventName as string);
          if (!step) continue;
          const a = ((log as any).args ?? {}) as { callId?: Hex; cdmHash?: Hex };
          onStep({
            callId: a.callId as Hex,
            step,
            cdmHash: (a.cdmHash as Hex) ?? ("0x" as Hex),
            block: (log as any).blockNumber?.toString() ?? "",
            logIndex: Number((log as any).logIndex ?? 0),
          });
        }
      },
      onError: (e) => console.error(`watchSteps error: ${(e as Error).message}`),
    });
  }

  // Live subscription to the settlement and feed events that are not margin call lifecycle steps: Returned and Enforced
  // (collateral control contract) and DefaultPublished (oracle feed). Pushed to the services next to the step events
  // (flow-return transition 14, flow-default-enforcement transition 8). Returns an unwatch function.
  watchLedgerEvents(onEvent: (e: LedgerEvent) => void): () => void {
    const meta = (log: any) => ({ block: log.blockNumber?.toString() ?? "", logIndex: Number(log.logIndex ?? 0) });
    const onError = (e: Error) => console.error(`watchLedgerEvents error: ${e.message}`);
    const unwatchControl = this.ws.watchContractEvent({
      address: this.reg.contracts.collateralControl,
      abi: controlAbi,
      onLogs: (logs) => {
        for (const log of logs) {
          const name = (log as any).eventName as LedgerEvent["event"];
          const a = ((log as any).args ?? {}) as { callId?: Hex; pledgor?: Address; payer?: Address; closeOutId?: Hex; substitutionId?: Hex; interestId?: Hex; cdmHash?: Hex };
          if (name === "Returned" || name === "Enforced") {
            onEvent({ event: name, callId: a.callId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "ClosedOut") {
            onEvent({ event: name, closeOutId: a.closeOutId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "Reclaimed") {
            onEvent({ event: name, reclaimId: (a as any).reclaimId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "SubstitutionRequested" || name === "SubstitutionDecided" || name === "SubstitutionSettled") {
            onEvent({ event: name, substitutionId: a.substitutionId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "AmendmentProposed") {
            onEvent({ event: name, amendmentId: (a as any).amendmentId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "AmendmentDecided") {
            onEvent({ event: name, amendmentId: (a as any).amendmentId, consent: (a as any).consent, cdmHash: a.cdmHash, ...meta(log) });
          } else if (name === "TermsAmendmentProposed") {
            onEvent({ event: name, amendmentId: (a as any).amendmentId, cdmHash: a.cdmHash, party: (a as any).proposer, ...meta(log) });
          } else if (name === "TermsAmendmentDecided") {
            onEvent({ event: name, amendmentId: (a as any).amendmentId, consent: (a as any).consent, cdmHash: a.cdmHash, ...meta(log) });
          } else if (name === "InterestStated") {
            onEvent({ event: name, interestId: a.interestId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "InterestSettled") {
            onEvent({ event: name, interestId: a.interestId, party: a.payer, ...meta(log) });
          } else if (name === "SettlementNetted") {
            onEvent({ event: name, nettingId: (a as any).nettingId, cdmHash: a.cdmHash, party: (a as any).settledBy, ...meta(log) });
          }
        }
      },
      onError,
    });
    const unwatchOracle = this.ws.watchContractEvent({
      address: this.reg.contracts.oracleFeed,
      abi: oracleAbi,
      eventName: "DefaultPublished",
      onLogs: (logs) => {
        for (const log of logs) {
          const a = ((log as any).args ?? {}) as { party?: Address; inDefault?: boolean };
          onEvent({ event: "DefaultPublished", party: a.party, inDefault: a.inDefault, ...meta(log) });
        }
      },
      onError,
    });
    const repo = this.reg.contracts.repoSettlement;
    const unwatchRepo = repo
      ? this.ws.watchContractEvent({
          address: repo,
          abi: repoAbi,
          onLogs: (logs) => {
            for (const log of logs) {
              const name = (log as any).eventName as LedgerEvent["event"];
              const a = ((log as any).args ?? {}) as { repoId?: Hex; seller?: Address; buyer?: Address; party?: Address; tradeHash?: Hex; cdmHash?: Hex };
              onEvent({ event: name, repoId: a.repoId, cdmHash: a.cdmHash ?? a.tradeHash, party: a.party ?? a.seller ?? a.buyer, ...meta(log) });
            }
          },
          onError,
        })
      : () => undefined;
    // CCP membership and clearing (wp-adr-ccp-membership, wp-adr-ccp-clearing): relayed so the consoles refresh.
    const ccp = this.reg.contracts.ccpClearing;
    const unwatchCcp = ccp
      ? this.ws.watchContractEvent({
          address: ccp,
          abi: ccpAbi,
          onLogs: (logs) => {
            for (const log of logs) {
              const a = ((log as any).args ?? {}) as { repoId?: Hex; novationHash?: Hex; rulebookHash?: Hex; member?: Address; ccp?: Address };
              onEvent({ event: (log as any).eventName as LedgerEvent["event"], repoId: a.repoId, cdmHash: a.novationHash ?? a.rulebookHash,
                party: a.member ?? a.ccp, ...meta(log) });
            }
          },
          onError,
        })
      : () => undefined;
    const register = this.reg.contracts.recordKeeperRegister;
    const unwatchRegister = register
      ? this.ws.watchContractEvent({
          address: register,
          abi: registerAbi,
          eventName: "RegisterConfirmed",
          onLogs: (logs) => {
            for (const log of logs) {
              const a = ((log as any).args ?? {}) as { txHash?: Hex; token?: Address };
              onEvent({ event: "RegisterConfirmed", txHash: a.txHash, token: a.token, ...meta(log) });
            }
          },
          onError,
        })
      : () => undefined;
    return () => {
      unwatchControl();
      unwatchOracle();
      unwatchRepo();
      unwatchCcp();
      unwatchRegister();
    };
  }

  async getProposalState(callId: Hex, proposalId: bigint): Promise<number> {
    const p = (await this.pub.readContract({
      address: this.reg.contracts.marginCall,
      abi: marginCallAbi,
      functionName: "getProposal",
      args: [callId, proposalId],
    })) as { state: number };
    return p.state;
  }

  async getProposalAssets(callId: Hex, proposalId: bigint): Promise<{ token: Address; qty: bigint }[]> {
    return (await this.pub.readContract({
      address: this.reg.contracts.marginCall,
      abi: marginCallAbi,
      functionName: "getProposalAssets",
      args: [callId, proposalId],
    })) as { token: Address; qty: bigint }[];
  }

  async pledgedBalance(pledgor: Address, securedParty: Address, token: Address): Promise<bigint> {
    return (await this.pub.readContract({
      address: this.reg.contracts.collateralControl,
      abi: controlAbi,
      functionName: "pledgedBalance",
      args: [pledgor, securedParty, token],
    })) as bigint;
  }

  async tokenBalance(token: Address, owner: Address): Promise<bigint> {
    return (await this.pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] })) as bigint;
  }

  /** The CcpClearing address: the CCP's rulebook and default fund. */
  ccpContract(): Address {
    const a = this.reg.contracts.ccpClearing;
    if (!a) throw new Error("no CcpClearing in the deployment registry; redeploy the contracts");
    return a;
  }

  /** The CCP publishes its rulebook's hash, members and shares, and pays its capital in the same transaction. */
  async publishCcpRulebook(rulebookHash: Hex, token: Address, members: Address[], shares: bigint[], capital: bigint) {
    await this.approve(token, this.ccpContract(), capital);
    return this.send(this.ccpContract(), ccpAbi, "publishRulebook", [rulebookHash, token, members, shares, capital]);
  }

  /** A member affirms the rulebook's hash and pays its default fund share. */
  async joinCcp(rulebookHash: Hex) {
    const r = await this.getCcpRulebook(rulebookHash);
    const share = r?.members.find((m) => m.member === this.account)?.share;
    if (!r || share === undefined) throw new Error(`no rulebook ${rulebookHash} naming ${this.account}`);
    await this.approve(r.token, this.ccpContract(), share);
    return this.send(this.ccpContract(), ccpAbi, "join", [rulebookHash]);
  }

  async leaveCcp(rulebookHash: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "leave", [rulebookHash]);
  }

  async getCcpRulebook(rulebookHash: Hex | null, ccp?: Address, block?: bigint): Promise<OnChainCcpRulebook | null> {
    const at = block === undefined ? {} : { blockNumber: block };
    const address = this.ccpContract();
    let hash = rulebookHash;
    if (!hash) {
      if (!ccp) throw new Error("a rulebook hash or a CCP address is needed");
      hash = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "rulebookOf", args: [ccp], ...at })) as Hex;
    }
    const r = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "rulebook", args: [hash], ...at })) as {
      ccp: Address; rulebookHash: Hex; token: Address; capital: bigint; fund: bigint; state: number; publishedAt: bigint; effectiveAt: bigint };
    if (r.state === 0) return null;
    const [member, share, hasPaid] = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "members", args: [hash], ...at })) as [
      readonly Address[], readonly bigint[], readonly boolean[]];
    return {
      rulebookHash: hash, ccp: r.ccp, token: r.token, capital: r.capital, fund: r.fund,
      state: CcpRulebookStateName[r.state] ?? String(r.state), publishedAt: r.publishedAt, effectiveAt: r.effectiveAt,
      members: await Promise.all(member.map(async (m, i) => {
        const read = (functionName: "contributed" | "imHeld" | "admissionOf") =>
          this.pub.readContract({ address, abi: ccpAbi, functionName, args: [hash!, m], ...at }) as Promise<unknown>;
        const [contributed, imHeld, admissionHash] = await Promise.all([read("contributed"), read("imHeld"), read("admissionOf")]);
        return { member: m, share: share[i], paid: hasPaid[i], contributed: contributed as bigint, imHeld: imHeld as bigint, admissionHash: admissionHash as Hex };
      })),
    };
  }

  submitCcpClearing(repoId: Hex, ccp: Address, novationHash: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "submitClearing", [repoId, ccp, novationHash]);
  }

  affirmCcpClearing(repoId: Hex, novationHash: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "affirmClearing", [repoId, novationHash]);
  }

  acceptCcpClearing(repoId: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "acceptClearing", [repoId]);
  }

  refuseCcpClearing(repoId: Hex, reasonHash: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "refuseClearing", [repoId, reasonHash]);
  }

  /** A member instructs its leg. For the purchase the seller approves the securities and the buyer the Purchase Price;
   *  for the repurchase the buyer approves the securities and the seller the Repurchase Price, all to CcpClearing. */
  async instructCcpCleared(repoId: Hex, legHash: Hex) {
    const c = await this.getCcpClearing(repoId);
    if (!c) throw new Error(`repo ${repoId} is not submitted for clearing`);
    const seller = c.seller === this.account;
    if (c.state === "cleared") await this.approve(seller ? c.security : c.cash, this.ccpContract(), seller ? c.quantity : c.purchasePrice);
    else if (c.state === "purchased") await this.approve(seller ? c.cash : c.security, this.ccpContract(), seller ? c.repurchasePrice : c.quantity);
    return this.send(this.ccpContract(), ccpAbi, "instructCleared", [repoId, legHash]);
  }

  async getCcpClearing(repoId: Hex): Promise<OnChainCcpClearing | null> {
    const address = this.ccpContract();
    const c = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "clearing", args: [repoId] })) as Omit<OnChainCcpClearing, "repoId" | "state" | "vmBalance" | "porting"> & { state: number };
    if (Number(c.state) === 0) return null;
    const [vmBalance, p] = await Promise.all([
      this.pub.readContract({ address, abi: ccpAbi, functionName: "vmBalance", args: [repoId] }) as Promise<bigint>,
      this.pub.readContract({ address, abi: ccpAbi, functionName: "porting", args: [repoId] }) as Promise<{ from: Address; to: Address; portingHash: Hex; payment: bigint; state: number }>,
    ]);
    const porting = Number(p.state) === 0 ? null
      : { from: p.from, to: p.to, portingHash: p.portingHash, payment: p.payment, state: CcpPortingStateName[Number(p.state)] ?? String(p.state) };
    return { repoId, ...c, state: CcpClearingStateName[Number(c.state)] ?? String(c.state), vmBalance, porting };
  }

  // ---- CCP margin (wp-adr-ccp-margin) ----

  issueCcpMargin(businessDate: bigint, repoIds: Hex[], repoVm: bigint[], members: Address[], im: bigint[], statementHashes: Hex[]) {
    return this.send(this.ccpContract(), ccpAbi, "issueMargin", [businessDate, repoIds, repoVm, members, im, statementHashes]);
  }

  /** A member pays its net on a round, approving it to CcpClearing first. */
  async payCcpMargin(roundId: Hex) {
    const r = await this.getCcpMarginRound(roundId);
    const mine = r?.members.find((m) => m.member === this.account);
    if (!r || !mine) throw new Error(`no margin round ${roundId} naming ${this.account}`);
    const rb = await this.getCcpRulebook(r.rulebookHash);
    await this.approve(rb!.token, this.ccpContract(), mine.vm + mine.im);
    return this.send(this.ccpContract(), ccpAbi, "payMargin", [roundId]);
  }

  cancelCcpMargin(roundId: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "cancelMarginRound", [roundId]);
  }

  async getCcpMarginRound(roundId: Hex): Promise<OnChainCcpMarginRound | null> {
    const address = this.ccpContract();
    const r = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "marginRound", args: [roundId] })) as {
      ccp: Address; rulebookHash: Hex; businessDate: bigint; state: number; unpaid: number };
    if (Number(r.state) === 0) return null;
    const [member, vm, im, statementHash, hasPaid] = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "roundMembers", args: [roundId] })) as [
      readonly Address[], readonly bigint[], readonly bigint[], readonly Hex[], readonly boolean[]];
    const [repoId, repoVm] = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "roundRepos", args: [roundId] })) as [readonly Hex[], readonly bigint[]];
    return {
      roundId, ccp: r.ccp, rulebookHash: r.rulebookHash, businessDate: r.businessDate.toString(),
      state: CcpRoundStateName[Number(r.state)] ?? String(r.state), unpaid: Number(r.unpaid),
      members: member.map((m, i) => ({ member: m, vm: vm[i], im: im[i], statementHash: statementHash[i], paid: hasPaid[i] })),
      repos: repoId.map((id, j) => ({ repoId: id, vm: repoVm[j] })),
    };
  }

  async listCcpMarginRounds(ccp: Address) {
    const ids = (await this.pub.readContract({ address: this.ccpContract(), abi: ccpAbi, functionName: "marginRoundsOf", args: [ccp] })) as readonly Hex[];
    return (await Promise.all(ids.map((id) => this.getCcpMarginRound(id)))).filter((r): r is OnChainCcpMarginRound => r !== null);
  }

  // ---- CCP default (wp-adr-ccp-default) ----

  closeOutCcpDefault(defaulter: Address, closeOutHash: Hex, repoIds: Hex[], residuals: bigint[]) {
    return this.send(this.ccpContract(), ccpAbi, "closeOutDefault", [defaulter, closeOutHash, repoIds, residuals]);
  }

  /** A survivor pays what it owes on a close-out, approving it to CcpClearing first. */
  async payCcpDefaultDue(closeOutHash: Hex) {
    const address = this.ccpContract();
    const due = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "defaultDue", args: [closeOutHash, this.account] })) as bigint;
    const d = await this.getCcpDefault(closeOutHash);
    if (!d || due === 0n) throw new Error(`nothing due from ${this.account} on ${closeOutHash}`);
    const rb = await this.getCcpRulebook(d.rulebookHash);
    await this.approve(rb!.token, address, due);
    return this.send(address, ccpAbi, "payDefaultDue", [closeOutHash]);
  }

  async getCcpDefault(closeOutHash: Hex): Promise<OnChainCcpDefault | null> {
    const [d, repoIds] = (await this.pub.readContract({ address: this.ccpContract(), abi: ccpAbi, functionName: "defaultRecord", args: [closeOutHash] })) as [
      Omit<OnChainCcpDefault, "closeOutHash" | "repoIds">, readonly Hex[]];
    if (d.ccp === zeroAddress) return null;
    return { closeOutHash, ...d, repoIds: [...repoIds] };
  }

  async listCcpDefaults(ccp: Address) {
    const address = this.ccpContract();
    const ids = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "defaultsOf", args: [ccp] })) as readonly Hex[];
    const out: (OnChainCcpDefault & { due: { member: Address; amount: bigint }[] })[] = [];
    for (const id of ids) {
      const d = await this.getCcpDefault(id);
      if (!d) continue;
      const rb = await this.getCcpRulebook(d.rulebookHash);
      const due: { member: Address; amount: bigint }[] = [];
      for (const m of rb?.members ?? []) {
        const amount = (await this.pub.readContract({ address, abi: ccpAbi, functionName: "defaultDue", args: [id, m.member] })) as bigint;
        if (amount > 0n) due.push({ member: m.member, amount });
      }
      out.push({ ...d, due });
    }
    return out;
  }

  // ---- CCP admission and porting (wp-adr-ccp-porting) ----

  admitCcpMember(member: Address, share: bigint, admissionHash: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "admitMember", [member, share, admissionHash]);
  }

  /** The leaving member requests the porting; it approves what it moves: the payment when it pays, and its securities
   *  when it is the buyer. */
  async requestCcpPorting(repoId: Hex, to: Address, portingHash: Hex, payment: bigint) {
    const c = await this.getCcpClearing(repoId);
    if (!c) throw new Error(`repo ${repoId} is not cleared`);
    if (payment < 0n) await this.approve(c.cash, this.ccpContract(), -payment);
    if (c.buyer === this.account) await this.approve(c.security, this.ccpContract(), c.quantity);
    return this.send(this.ccpContract(), ccpAbi, "requestPorting", [repoId, to, portingHash, payment]);
  }

  /** The receiving member accepts, approving the payment when it pays. */
  async acceptCcpPorting(repoId: Hex, portingHash: Hex) {
    const c = await this.getCcpClearing(repoId);
    if (!c?.porting) throw new Error(`no porting requested for ${repoId}`);
    if (c.porting.payment > 0n) await this.approve(c.cash, this.ccpContract(), c.porting.payment);
    return this.send(this.ccpContract(), ccpAbi, "acceptPorting", [repoId, portingHash]);
  }

  approveCcpPorting(repoId: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "approvePorting", [repoId]);
  }

  refuseCcpPorting(repoId: Hex) {
    return this.send(this.ccpContract(), ccpAbi, "refusePorting", [repoId]);
  }

  async listCcpClearings(party: Address) {
    const ids = (await this.pub.readContract({ address: this.ccpContract(), abi: ccpAbi, functionName: "clearingsOfParty", args: [party] })) as readonly Hex[];
    return (await Promise.all(ids.map((id) => this.getCcpClearing(id)))).filter((c): c is OnChainCcpClearing => c !== null);
  }
}
