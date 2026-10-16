// Domain types for the mocked console state. The shapes follow the prototype architecture
// (architecture/prototype.architecture.json): a margin call contract, a collateral control contract,
// an oracle feed, token wallets, and off-chain messages between the parties' workflow services.

export type PartyId = "A" | "B" | "M";
export type TokenId = "tUST" | "tMMF" | "tUSD";
export type AgreementKind = "IM" | "VM";
export type CallKind = "IM" | "VM" | "Return";
export type CallState = "issued" | "agreed" | "partially agreed" | "disputed" | "settled" | "settled (agreed part)";
export type ProposalState = "proposed" | "accepted" | "rejected";
export type PledgeState = "pledged" | "returned" | "enforced";
export type ResponseType = "full" | "partial" | "dispute";

export type Asset = [TokenId, number];

export interface Proposal {
  id: string;
  assets: Asset[];
  state: ProposalState;
  reason?: string;
}

export interface MarginCall {
  id: string;
  kind: CallKind;
  /** Party that issued the call (it receives collateral, except for a return call). */
  from: PartyId;
  /** Party called to deliver (or, for a return call, to release). */
  to: PartyId;
  amount: number;
  deadline: string;
  state: CallState;
  agreed: number;
  disputed: number;
  proposals: Proposal[];
}

export interface Pledge {
  token: TokenId;
  qty: number;
  call: string;
  state: PledgeState;
}

export type LedgerEvent =
  | { lane: "on"; step: number; block: number; signer: PartyId; fn: string; text: string }
  | { lane: "off"; step: number; from: PartyId; to: PartyId; what: string; text: string };

export interface State {
  kind: AgreementKind;
  block: number;
  /** Prices on the on-chain oracle feed (what contracts and valuations use). */
  feed: Record<TokenId, number>;
  /** Prices in the mock market data source (what the operator edits before publishing). */
  mock: Record<TokenId, number>;
  defaulted: PartyId[];
  wallet: Record<"A" | "B", Record<TokenId, number>>;
  pledges: Pledge[];
  calls: MarginCall[];
  ev: LedgerEvent[];
  /** IM: required amount above the threshold. VM: exposure (mark-to-market). */
  req: number;
  /** VM only: credit support balance held by the Transferee. */
  held: number;
  /** VM only: amount the Transferee moved on to its treasury (reuse). */
  reused: number;
  nextCall: number;
  /** Step counter used to label events (guided step number, or action count in free mode). */
  step: number;
}
