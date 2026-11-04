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
export const CallStateName = ["none", "issued", "agreed", "partially agreed", "disputed", "settled", "settled (agreed part)"];
export const ProposalStateName = ["none", "proposed", "accepted", "rejected"];

// The MarginCall lifecycle events, in fold order, each with the CDM step it maps to. Shared by the historical scan
// (callSteps) and the live subscription (watchSteps).
const STEP_EVENTS: { name: string; step: string }[] = [
  { name: "CallIssued", step: "IssueCall" },
  { name: "CallAnswered", step: "RespondToCall" },
  { name: "CollateralProposed", step: "ProposeCollateral" },
  { name: "ProposalDecided", step: "DecideProposal" },
  { name: "CallSettled", step: "SettleCall" },
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
  event: "Returned" | "Enforced" | "DefaultPublished";
  callId?: Hex;
  party?: Address;
  inDefault?: boolean;
  block: string;
  logIndex: number;
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
    "Pledged(bytes32,address,address,uint256)",
    "Transferred(bytes32,address,address,uint256)",
    "Returned(bytes32,address,address)",
    "Enforced(bytes32,address,address)",
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
}

const marginCallAbi = parseAbi([
  "struct Asset { address token; uint256 qty; }",
  "struct Call { uint8 kind; address from; address to; uint256 amount; uint256 agreed; uint256 disputed; uint64 deadline; uint8 state; bytes32 cdmHash; uint256 proposalCount; uint256 activeProposal; bytes32 settleCdmHash; }",
  "struct Proposal { uint8 state; bytes32 cdmHash; bytes32 decisionCdmHash; }",
  "function issueCall(bytes32 callId, uint8 kind, address to, uint256 amount, uint64 deadline, bytes32 cdmHash)",
  "function respond(bytes32 callId, uint8 response, uint256 agreed, bytes32 cdmHash)",
  "function propose(bytes32 callId, Asset[] assets, bytes32 cdmHash) returns (uint256 proposalId)",
  "function decideProposal(bytes32 callId, uint256 proposalId, bool accept, bytes32 cdmHash)",
  "function getCall(bytes32 callId) view returns (Call)",
  "function getProposal(bytes32 callId, uint256 proposalId) view returns (Proposal)",
  "function getProposalAssets(bytes32 callId, uint256 proposalId) view returns (Asset[])",
  "event CallIssued(bytes32 indexed callId, address indexed from, address indexed to, uint8 kind, uint256 amount, bytes32 cdmHash)",
  "event CallAnswered(bytes32 indexed callId, uint8 response, uint256 agreed, uint256 disputed, bytes32 cdmHash)",
  "event CollateralProposed(bytes32 indexed callId, uint256 indexed proposalId, bytes32 cdmHash)",
  "event ProposalDecided(bytes32 indexed callId, uint256 indexed proposalId, bool accepted, bytes32 cdmHash)",
  "event CallSettled(bytes32 indexed callId, bool disputedRemains, bytes32 cdmHash)",
]);

const controlAbi = parseAbi([
  "struct Asset { address token; uint256 qty; }",
  "function pledge(bytes32 callId, uint256 proposalId, bytes32 cdmHash)",
  "function settleByTransfer(bytes32 callId, uint256 proposalId, bytes32 cdmHash)",
  "function returnCollateral(bytes32 callId, Asset[] release, bytes32 cdmHash)",
  "function returnByTransfer(bytes32 callId, Asset[] assets, bytes32 cdmHash)",
  "function enforce(bytes32 callId)",
  "function pledgedBalance(address pledgor, address securedParty, address token) view returns (uint256)",
  "function pledgedTokens(address pledgor, address securedParty) view returns (address[])",
  "event Returned(bytes32 indexed callId, address indexed securedParty, address indexed pledgor)",
  "event Enforced(bytes32 indexed callId, address indexed securedParty, address indexed pledgor)",
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
  approve(token: Address, spender: Address, amount: bigint): Promise<{ txHash: Hex; block: bigint }>;
  pledge(callId: Hex, proposalId: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  settleByTransfer(callId: Hex, proposalId: bigint, cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  returnCollateral(callId: Hex, release: AssetArg[], cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  returnByTransfer(callId: Hex, assets: AssetArg[], cdmHash: Hex): Promise<{ txHash: Hex; block: bigint }>;
  enforce(callId: Hex): Promise<{ txHash: Hex; block: bigint }>;
  setDefault(party: Address, inDefault: boolean): Promise<{ txHash: Hex; block: bigint }>;
  isDefaulted(party: Address): Promise<boolean>;
  publishPrice(token: Address, priceScaled: bigint): Promise<{ txHash: Hex; block: bigint }>;
  priceOf(token: Address): Promise<bigint | null>;
  settlementHistory(pledgor: Address, securedParty: Address): Promise<{ settled: { callId: Hex; block: string }[]; enforced: { callId: Hex; block: string }[] }>;
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
    return (await this.pub.readContract({
      address: this.reg.contracts.marginCall,
      abi: marginCallAbi,
      functionName: "getCall",
      args: [callId],
    })) as OnChainCall;
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
  async settlementHistory(pledgor: Address, securedParty: Address): Promise<{ settled: { callId: Hex; block: string }[]; enforced: { callId: Hex; block: string }[] }> {
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
    return { settled, enforced };
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
          const name = (log as any).eventName as string;
          if (name !== "Returned" && name !== "Enforced") continue;
          const a = ((log as any).args ?? {}) as { callId?: Hex; pledgor?: Address };
          onEvent({ event: name, callId: a.callId, party: a.pledgor, ...meta(log) });
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
