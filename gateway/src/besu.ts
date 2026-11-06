// Besu adapter behind a ledger-neutral interface (concept-asr-ledger-neutrality, ADR wp-adr-prototype-ledgers).
// A BesuAdapter instance holds exactly one participant's account (its Besu node key) and signs every write with it.
// QBFT gives immediate per-block finality, so a mined receipt is final (concept-asr-settlement-finality): each write
// waits for its receipt before returning. The chain charges no gas (genesis zeroBaseFee, --min-gas-price=0), so every
// write is a legacy transaction with gasPrice 0.
import { createPublicClient, createWalletClient, defineChain, http, webSocket, getAddress, parseAbi, toEventSelector } from "viem";
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
    | "SubstitutionRequested"
    | "SubstitutionDecided"
    | "SubstitutionSettled"
    | "InterestStated"
    | "InterestSettled"
    | "AmendmentProposed"
    | "AmendmentDecided";
  callId?: Hex;
  /** ClosedOut (flow-close-out-netting). */
  closeOutId?: Hex;
  /** SubstitutionRequested, SubstitutionDecided, SubstitutionSettled (flow-substitution). */
  substitutionId?: Hex;
  /** InterestStated, InterestSettled (flow-interest-on-cash). */
  interestId?: Hex;
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
    "Enforced(bytes32,address,address)",
    "ClosedOut(bytes32,address,address,uint256,uint256,bytes32)",
    "SubstitutionRequested(bytes32,address,address,bytes32)",
    "SubstitutionDecided(bytes32,bool,bytes32)",
    "SubstitutionSettled(bytes32,bytes32)",
    "InterestStated(bytes32,address,address,address,int256,bytes32)",
    "InterestSettled(bytes32,address,address,uint256)",
    "AmendmentProposed(bytes32,address,address,address,bytes32)",
    "AmendmentDecided(bytes32,bool,bytes32)",
    "Transfer(address,address,uint256)",
    "Approval(address,address,uint256)",
  ].map((sig) => [toEventSelector(sig).toLowerCase(), sig.slice(0, sig.indexOf("("))]),
);

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
  "function enforce(bytes32 callId)",
  "function closeOut(bytes32 closeOutId, address pledgor, uint256 owed, bytes32 cdmHash)",
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
  "struct InterestStatement { address pledgor; address securedParty; address cashToken; int256 amount; uint8 state; bytes32 cdmHash; }",
  "function stateInterest(bytes32 interestId, address pledgor, address cashToken, int256 amount, bytes32 cdmHash)",
  "function payInterest(bytes32 interestId)",
  "function getInterest(bytes32 interestId) view returns (InterestStatement)",
  "function pledgedBalance(address pledgor, address securedParty, address token) view returns (uint256)",
  "function pledgedTokens(address pledgor, address securedParty) view returns (address[])",
  "event Returned(bytes32 indexed callId, address indexed securedParty, address indexed pledgor)",
  "event Enforced(bytes32 indexed callId, address indexed securedParty, address indexed pledgor)",
  "event ClosedOut(bytes32 indexed closeOutId, address indexed securedParty, address indexed pledgor, uint256 owed, uint256 applied, bytes32 cdmHash)",
  "event SubstitutionRequested(bytes32 indexed substitutionId, address indexed pledgor, address indexed securedParty, bytes32 cdmHash)",
  "event SubstitutionDecided(bytes32 indexed substitutionId, bool consent, bytes32 cdmHash)",
  "event SubstitutionSettled(bytes32 indexed substitutionId, bytes32 cdmHash)",
  "event AmendmentProposed(bytes32 indexed amendmentId, address indexed pledgor, address indexed securedParty, address proposer, bytes32 cdmHash)",
  "event AmendmentDecided(bytes32 indexed amendmentId, bool consent, bytes32 cdmHash)",
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
  enforce(callId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  closeOut(closeOutId: Hex, pledgor: Address, owed: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
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
  stateInterest(interestId: Hex, pledgor: Address, cashToken: Address, amount: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  payInterest(interestId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  getInterest(interestId: Hex): Promise<Omit<InterestRecord, "interestId" | "block" | "txHash">>;
  listInterest(party: Address): Promise<InterestRecord[]>;
  escrowAt(pledgor: Address, securedParty: Address, block: bigint): Promise<{ token: Address; qty: bigint; price: bigint | null }[]>;
  setDefault(party: Address, inDefault: boolean): Promise<{ txHash: Hex; block: bigint }>;
  isDefaulted(party: Address): Promise<boolean>;
  publishPrice(token: Address, priceScaled: bigint): Promise<{ txHash: Hex; block: bigint }>;
  priceOf(token: Address): Promise<bigint | null>;
  settlementHistory(pledgor: Address, securedParty: Address): Promise<{ settled: { callId: Hex; block: string }[]; enforced: { callId: Hex; block: string }[]; closedOut: { closeOutId: Hex; block: string }[] }>;
  getCall(callId: Hex): Promise<OnChainCall>;
  listCalls(party: Address): Promise<{ callId: Hex; call: OnChainCall }[]>;
  callSteps(callId: Hex): Promise<CallStep[]>;
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

  constructor(node: string, reg: Registry = loadRegistry()) {
    this.reg = reg;
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
    this.pub = createPublicClient({ chain, transport: http(rpc) });
    this.wallet = createWalletClient({ account: acct, chain, transport: http(rpc) });
    // Besu exposes a WebSocket JSON-RPC on the http port + 1 (besu/docker-compose.yml --rpc-ws-enabled); the live
    // event subscription (watchSteps -> eth_subscribe) runs over it, the historical scan stays on http.
    const wsRpc = (reg as { wsRpc?: Record<string, string> }).wsRpc?.[node]
      ?? rpc.replace(/^http/, "ws").replace(/:(\d+)(?=\/|$)/, (_m, p) => ":" + (Number(p) + 1));
    this.ws = createPublicClient({ chain, transport: webSocket(wsRpc) });
  }

  // gasPrice 0 forces a legacy transaction, which the zero-base-fee Besu chain accepts.
  private async send(address: Address, abi: readonly unknown[], functionName: string, args: unknown[]): Promise<{ txHash: Hex; block: bigint }> {
    const txHash = await this.wallet.writeContract({
      address,
      abi: abi as never,
      functionName,
      args: args as never,
      account: this.wallet.account!,
      chain: this.wallet.chain,
      gasPrice: 0n,
    });
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
  enforce(callId: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "enforce", [callId]);
  }

  /** Close out after the pledgor's default (secured party's key, flow-close-out-netting): the control contract applies
   * the pledged collateral to `owed` and returns the surplus to the pledgor. */
  closeOut(closeOutId: Hex, pledgor: Address, owed: bigint, cdmHash: Hex) {
    return this.send(this.reg.contracts.collateralControl, controlAbi, "closeOut", [closeOutId, pledgor, owed, cdmHash]);
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

  // Logs of one event from the deploy block to the latest, in windows under Besu's eth_getLogs range cap.
  private async scan(address: Address, abi: readonly any[], name: string, args: Record<string, unknown>): Promise<any[]> {
    const event = abi.find((x: any) => x.type === "event" && x.name === name) as never;
    const latest = await this.pub.getBlockNumber();
    const start = BigInt(this.reg.deployBlock ?? 0);
    const WINDOW = 4000n;
    const out: any[] = [];
    for (let from = start; from <= latest; from += WINDOW) {
      const to = from + WINDOW - 1n > latest ? latest : from + WINDOW - 1n;
      out.push(...(await this.pub.getLogs({ address, event, args: args as never, fromBlock: from, toBlock: to })));
    }
    return out;
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

  async getCall(callId: Hex): Promise<OnChainCall> {
    const read = (functionName: "getCall" | "replaces" | "replacementOf") =>
      this.pub.readContract({ address: this.reg.contracts.marginCall, abi: marginCallAbi, functionName, args: [callId] });
    const [call, replaces, replacementOf] = await Promise.all([read("getCall"), read("replaces"), read("replacementOf")]);
    return { ...(call as OnChainCall), replaces: replaces as Hex, replacementOf: replacementOf as Hex };
  }

  // Discover the calls a party is involved in by scanning CallIssued logs (from and to are indexed). Used by each
// participant's workflow service to learn of calls it did not itself issue, with the chain as the shared source.
  async listCalls(party: Address): Promise<{ callId: Hex; call: OnChainCall }[]> {
    // Besu caps the eth_getLogs block range, so scan from the deploy block in windows under that cap.
    const event = marginCallAbi.find((x: any) => x.type === "event" && x.name === "CallIssued") as never;
    const latest = await this.pub.getBlockNumber();
    const start = BigInt(this.reg.deployBlock ?? 0);
    const WINDOW = 4000n;
    const ids = new Set<Hex>();
    for (let from = start; from <= latest; from += WINDOW) {
      const to = from + WINDOW - 1n > latest ? latest : from + WINDOW - 1n;
      const logs = await this.pub.getLogs({ address: this.reg.contracts.marginCall, event, fromBlock: from, toBlock: to });
      for (const log of logs) {
        const a = (log as any).args as { callId: Hex; from: Address; to: Address };
        if (getAddress(a.from) === party || getAddress(a.to) === party) ids.add(a.callId);
      }
    }
    const out: { callId: Hex; call: OnChainCall }[] = [];
    for (const callId of ids) out.push({ callId, call: await this.getCall(callId) });
    return out;
  }

  // Settlement history for revaluation (flow-revaluation-top-up): the block of every CallSettled event, and the
  // Enforced events for one pledgor/secured-party pair. Enforcement moves the pair's whole escrow to the secured
  // party, so a reader counts only the calls settled after the pair's last enforcement. Scanned in windows like
  // listCalls.
  async settlementHistory(pledgor: Address, securedParty: Address): Promise<{ settled: { callId: Hex; block: string }[]; enforced: { callId: Hex; block: string }[]; closedOut: { closeOutId: Hex; block: string }[] }> {
    const settledEvent = marginCallAbi.find((x: any) => x.type === "event" && x.name === "CallSettled") as never;
    const enforcedEvent = controlAbi.find((x: any) => x.type === "event" && x.name === "Enforced") as never;
    const latest = await this.pub.getBlockNumber();
    const start = BigInt(this.reg.deployBlock ?? 0);
    const WINDOW = 4000n;
    const settled: { callId: Hex; block: string }[] = [];
    const enforced: { callId: Hex; block: string }[] = [];
    for (let from = start; from <= latest; from += WINDOW) {
      const to = from + WINDOW - 1n > latest ? latest : from + WINDOW - 1n;
      for (const log of await this.pub.getLogs({ address: this.reg.contracts.marginCall, event: settledEvent, fromBlock: from, toBlock: to })) {
        settled.push({ callId: (log as any).args.callId as Hex, block: (log as any).blockNumber.toString() });
      }
      const pair = { securedParty, pledgor } as never;
      for (const log of await this.pub.getLogs({ address: this.reg.contracts.collateralControl, event: enforcedEvent, args: pair, fromBlock: from, toBlock: to })) {
        enforced.push({ callId: (log as any).args.callId as Hex, block: (log as any).blockNumber.toString() });
      }
    }
    // A close-out empties the pair's escrow like an enforcement (flow-close-out-netting).
    const closedOut = (await this.scan(this.reg.contracts.collateralControl, controlAbi, "ClosedOut", { securedParty, pledgor })).map((l) => ({
      closeOutId: (l.args as { closeOutId: Hex }).closeOutId, block: l.blockNumber.toString(),
    }));
    return { settled, enforced, closedOut };
  }

  // The lifecycle steps of one call, in chain order, each with its CDM hash — the authoritative ordered commitment
  // list for the MarginCallState fold (wp-adr-cdm-payload-carrier). Read from the step events (callId is indexed).
  // Each step also carries what the service needs to build its CDM LedgerAnchor (G25, nw-ledger-anchor-redesign): the
  // network, the transaction, the emitting contract, the transaction status, and the other events of the same
  // transaction (for a settlement, the token Transfer and Pledged or Transferred logs). QBFT finalises at mining
  // (concept-asr-settlement-finality), so a mined, successful transaction is Final.
  async callSteps(callId: Hex): Promise<CallStep[]> {
    const specs = STEP_EVENTS;
    const latest = await this.pub.getBlockNumber();
    const start = BigInt(this.reg.deployBlock ?? 0);
    const WINDOW = 4000n;
    const rows: (Omit<CallStep, "status" | "txLogs" | "network"> & { bn: bigint })[] = [];
    for (const s of specs) {
      const event = marginCallAbi.find((x: any) => x.type === "event" && x.name === s.name) as never;
      for (let from = start; from <= latest; from += WINDOW) {
        const to = from + WINDOW - 1n > latest ? latest : from + WINDOW - 1n;
        const logs = await this.pub.getLogs({ address: this.reg.contracts.marginCall, event, args: { callId } as never, fromBlock: from, toBlock: to });
        for (const log of logs) {
          const l = log as any;
          rows.push({
            step: s.step, event: s.name, cdmHash: (l.args as { cdmHash?: Hex }).cdmHash as Hex,
            block: l.blockNumber.toString(), logIndex: Number(l.logIndex), txHash: l.transactionHash as Hex,
            contract: (l.address as string).toLowerCase(), bn: l.blockNumber,
          });
        }
      }
    }
    rows.sort((x, y) => (x.bn === y.bn ? x.logIndex - y.logIndex : x.bn < y.bn ? -1 : 1));
    const network = { name: "besu-prototype", platform: "Hyperledger Besu", chainId: this.reg.chainId };
    const receipts = new Map<Hex, Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>>();
    for (const r of rows) if (!receipts.has(r.txHash)) receipts.set(r.txHash, await this.pub.getTransactionReceipt({ hash: r.txHash }));
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
            onEvent({ event: name, callId: a.callId, party: a.pledgor, ...meta(log) });
          } else if (name === "ClosedOut") {
            onEvent({ event: name, closeOutId: a.closeOutId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "SubstitutionRequested" || name === "SubstitutionDecided" || name === "SubstitutionSettled") {
            onEvent({ event: name, substitutionId: a.substitutionId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "AmendmentProposed") {
            onEvent({ event: name, amendmentId: (a as any).amendmentId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "AmendmentDecided") {
            onEvent({ event: name, amendmentId: (a as any).amendmentId, consent: (a as any).consent, cdmHash: a.cdmHash, ...meta(log) });
          } else if (name === "InterestStated") {
            onEvent({ event: name, interestId: a.interestId, cdmHash: a.cdmHash, party: a.pledgor, ...meta(log) });
          } else if (name === "InterestSettled") {
            onEvent({ event: name, interestId: a.interestId, party: a.payer, ...meta(log) });
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
    return () => {
      unwatchControl();
      unwatchOracle();
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
}
