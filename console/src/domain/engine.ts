// Rule engine for the mocked console. Each action stands in for a call to a party's workflow service and,
// where the design puts the step on-chain, for a contract call through that party's ledger gateway
// (wp-adr-margin-call-state-onchain, wp-adr-im-segregation). Rules that a contract would enforce throw
// EngineError with the reason the contract would give, so free mode shows the same rejections the real
// stack will. Pure: apply() returns a new state and never mutates its input.
import { AGREEMENTS, PARTIES, qty, usd } from "./reference";
import type { Asset, CallKind, LedgerEvent, MarginCall, PartyId, Proposal, ResponseType, State, TokenId } from "./types";

export class EngineError extends Error {}

export type Action =
  | { type: "issueCall"; by: PartyId; to: PartyId; kind: CallKind; amount: number; deadline: string; requirement?: number }
  | { type: "respond"; by: PartyId; callId: string; response: ResponseType; agreed: number; reason?: string }
  | { type: "propose"; by: PartyId; callId: string; assets: Asset[] }
  | { type: "decideProposal"; by: PartyId; callId: string; proposalId: string; accept: boolean; reason?: string }
  | { type: "pledge"; by: PartyId; callId: string; proposalId: string }
  | { type: "agreeReturn"; by: PartyId; callId: string; release: Asset[] }
  | { type: "settleByTransfer"; by: PartyId; callId: string; proposalId: string }
  | { type: "agreeReturnTransfer"; by: PartyId; callId: string; assets: Asset[] }
  | { type: "transfer"; by: PartyId; token: TokenId; qty: number; to: string }
  | { type: "setMockPrice"; by: PartyId; token: TokenId; price: number }
  | { type: "publishPrice"; by: PartyId; token: TokenId }
  | { type: "publishDefault"; by: PartyId; party: PartyId }
  | { type: "enforce"; by: PartyId; callId: string }
  | { type: "message"; by: PartyId; to: PartyId; what: string; text: string }
  | { type: "none" };

const fail = (msg: string): never => {
  throw new EngineError(msg);
};
const name = (p: PartyId) => PARTIES[p].name;

export function haircut(s: State, token: TokenId): number | undefined {
  return AGREEMENTS[s.kind].eligible.find((e) => e.token === token)?.haircut;
}

/** Value after haircut at the oracle feed price; ineligible tokens count as zero. */
export function valueAfterHaircut(s: State, token: TokenId, q: number): number {
  const h = haircut(s, token);
  return h === undefined ? 0 : q * s.feed[token] * (1 - h);
}

export const assetsValue = (s: State, assets: Asset[]) => assets.reduce((a, [t, q]) => a + valueAfterHaircut(s, t, q), 0);
export const marketValue = (s: State, assets: Asset[]) => assets.reduce((a, [t, q]) => a + q * s.feed[t], 0);
export const pledgedValue = (s: State) =>
  s.pledges.filter((p) => p.state === "pledged").reduce((a, p) => a + valueAfterHaircut(s, p.token, p.qty), 0);
export const fmtAssets = (assets: Asset[]) => assets.map(([t, q]) => `${t} ${qty(q)}`).join(" + ");

export interface Check {
  ok: boolean;
  text: string;
}

/** The secured party's checks of a collateral proposal against its copy of the eligibility schedule. */
export function evaluateProposal(s: State, call: MarginCall, proposal: Proposal): Check[] {
  const ag = AGREEMENTS[s.kind];
  const checks: Check[] = [];
  const mv = marketValue(s, proposal.assets);
  for (const [t, q] of proposal.assets) {
    const row = ag.eligible.find((e) => e.token === t);
    if (!row) {
      checks.push({ ok: false, text: `${t} is not eligible collateral` });
      continue;
    }
    checks.push({ ok: true, text: `${t} is eligible, haircut ${Math.round(row.haircut * 100)}%` });
    if (row.concentration !== undefined) {
      const share = mv > 0 ? (q * s.feed[t]) / mv : 0;
      checks.push({
        ok: share <= row.concentration + 1e-9,
        text: `${t} is ${(share * 100).toFixed(1)}% of market value (limit ${Math.round(row.concentration * 100)}%)`,
      });
    }
  }
  const v = assetsValue(s, proposal.assets);
  checks.push({ ok: v >= call.agreed, text: `Value after haircuts ${usd(v)} ${v >= call.agreed ? "≥" : "<"} agreed ${usd(call.agreed)}` });
  return checks;
}

function chain(s: State, signer: PartyId, fn: string, text: string) {
  s.block += 1;
  s.ev.push({ lane: "on", step: s.step, block: s.block, signer, fn, text });
}
function msg(s: State, from: PartyId, to: PartyId, what: string, text: string) {
  s.ev.push({ lane: "off", step: s.step, from, to, what, text });
}
function getCall(s: State, id: string): MarginCall {
  return s.calls.find((c) => c.id === id) ?? fail(`No margin call ${id}`);
}
function getProposal(c: MarginCall, id: string): Proposal {
  return c.proposals.find((p) => p.id === id) ?? fail(`No proposal ${id} on ${c.id}`);
}
function walletOf(s: State, p: PartyId) {
  if (p === "M") fail("The market data operator has no collateral wallet");
  return s.wallet[p as "A" | "B"];
}
function debit(s: State, p: PartyId, assets: Asset[]) {
  const w = walletOf(s, p);
  for (const [t, q] of assets) {
    if (!(q > 0) || !Number.isInteger(q)) fail(`Quantity of ${t} must be a positive whole number`);
    if (w[t] < q) fail(`${name(p)} holds only ${qty(w[t])} ${t}`);
  }
  for (const [t, q] of assets) w[t] -= q;
}
function credit(s: State, p: PartyId, assets: Asset[]) {
  const w = walletOf(s, p);
  for (const [t, q] of assets) w[t] += q;
}

export function apply(state: State, action: Action): State {
  const s: State = structuredClone(state);
  const ag = AGREEMENTS[s.kind];
  switch (action.type) {
    case "none":
      return s;

    case "message":
      msg(s, action.by, action.to, action.what, action.text);
      return s;

    case "issueCall": {
      const { by, to, kind, amount } = action;
      if (by === "M" || to === "M") fail("Margin calls are between BANK-A and BANK-B");
      if (by === to) fail("A party cannot call itself");
      if (kind === "IM" && s.kind !== "IM") fail("This agreement is a VM CSA");
      if (kind === "VM" && s.kind !== "VM") fail("This agreement is an IM CSA");
      if (kind === "IM" && by !== "B") fail("Only the Secured Party (BANK-B) calls initial margin under this agreement");
      if (kind === "Return" && s.kind === "IM" && by !== "A") fail("Only the Pledgor (BANK-A) calls for a return of initial margin");
      if (!(amount > 0)) fail("The call amount must be positive");
      if (amount < ag.mta) fail(`${usd(amount)} is below the minimum transfer amount of ${usd(ag.mta)}`);
      const open = s.calls.find((c) => c.from === by && c.to === to && !c.state.startsWith("settled"));
      if (open) fail(`${open.id} between the same parties is still open`);
      const id = "C-" + String(s.nextCall++).padStart(4, "0");
      s.calls.push({ id, kind, from: by, to, amount, deadline: action.deadline, state: "issued", agreed: 0, disputed: 0, proposals: [] });
      if (action.requirement !== undefined) s.req = action.requirement;
      chain(s, by, `issueCall(${id}, ${kind === "Return" ? "return " : ""}${qty(amount)}, ${action.deadline}, hash)`, `Call recorded on the margin call contract, signed by ${name(by)}`);
      msg(s, by, to, kind === "Return" ? "MarginCallIssuance (return)" : "MarginCallIssuance", `CDM content of ${id}; ${name(to)}'s service checks it against the on-chain hash ✓`);
      return s;
    }

    case "respond": {
      const c = getCall(s, action.callId);
      if (action.by !== c.to) fail(`Only ${name(c.to)} can respond to ${c.id}`);
      if (c.state !== "issued") fail(`${c.id} has already been answered`);
      if (c.kind === "Return" && s.kind === "IM") fail("Use “Agree and release” for a return call");
      const agreed = action.response === "full" ? c.amount : action.response === "dispute" ? 0 : action.agreed;
      if (action.response === "partial" && !(agreed > 0 && agreed < c.amount)) fail("A partial agreement must be more than zero and less than the call");
      c.agreed = agreed;
      c.disputed = c.amount - agreed;
      c.state = action.response === "full" ? "agreed" : action.response === "partial" ? "partially agreed" : "disputed";
      chain(s, action.by, `respond(${c.id}, ${action.response}, ${qty(agreed)}${c.disputed ? ", disputed " + qty(c.disputed) : ""})`, `Response recorded, signed by ${name(action.by)}`);
      msg(s, action.by, c.from, c.disputed ? "MarginCallResponse + dispute" : "MarginCallResponse",
        `${action.response === "full" ? "Agree in full" : action.response === "partial" ? "Agree " + usd(agreed) + ", dispute " + usd(c.disputed) : "Dispute " + usd(c.disputed)}${action.reason ? " · " + action.reason : ""}`);
      return s;
    }

    case "propose": {
      const c = getCall(s, action.callId);
      if (action.by !== c.to) fail(`Only ${name(c.to)} proposes collateral for ${c.id}`);
      if (c.kind === "Return") fail("A return call releases collateral already held; there is nothing to propose");
      if (!(c.state === "agreed" || c.state === "partially agreed")) fail(`${c.id} has no agreed amount to cover`);
      if (c.proposals.some((p) => p.state === "proposed")) fail("A proposal is already waiting for a decision");
      if (!action.assets.length) fail("Propose at least one asset");
      const w = walletOf(s, action.by);
      for (const [t, q] of action.assets) {
        if (!(q > 0) || !Number.isInteger(q)) fail(`Quantity of ${t} must be a positive whole number`);
        if (w[t] < q) fail(`${name(action.by)} holds only ${qty(w[t])} ${t}`);
      }
      const id = "P-" + (c.proposals.length + 1);
      c.proposals.push({ id, assets: action.assets, state: "proposed" });
      chain(s, action.by, `propose(${c.id}, ${id})`, `Collateral proposal recorded, signed by ${name(action.by)}`);
      msg(s, action.by, c.from, "Collateral proposal", `${id}: ${fmtAssets(action.assets)}`);
      return s;
    }

    case "decideProposal": {
      const c = getCall(s, action.callId);
      const p = getProposal(c, action.proposalId);
      if (action.by !== c.from) fail(`Only ${name(c.from)} decides on proposals for ${c.id}`);
      if (p.state !== "proposed") fail(`${p.id} is already ${p.state}`);
      p.state = action.accept ? "accepted" : "rejected";
      if (action.reason) p.reason = action.reason;
      chain(s, action.by, `decideProposal(${p.id}, ${action.accept ? "accept" : "reject"})`, `Proposal ${p.state}, signed by ${name(action.by)}`);
      msg(s, action.by, c.to, action.accept ? "Proposal acceptance" : "Proposal rejection", `${c.id} / ${p.id} ${p.state}${action.reason ? ": " + action.reason : ""}`);
      return s;
    }

    case "pledge": {
      if (s.kind !== "IM") fail("Pledges are for the IM agreement; under the VM CSA title passes by transfer");
      const c = getCall(s, action.callId);
      if (action.by !== c.to) fail(`Only ${name(c.to)} pledges against ${c.id}`);
      const p = getProposal(c, action.proposalId);
      if (!(c.state === "agreed" || c.state === "partially agreed")) fail(`Control contract: ${c.id} is not in an agreed state`);
      if (p.state !== "accepted") fail(`Control contract: ${p.id} has not been accepted by ${name(c.from)}`);
      const v = assetsValue(s, p.assets);
      if (v < c.agreed) fail(`Control contract: value after haircuts ${usd(v)} does not cover the agreed ${usd(c.agreed)}`);
      debit(s, action.by, p.assets);
      for (const [t, q] of p.assets) s.pledges.push({ token: t, qty: q, call: c.id, state: "pledged" });
      c.state = c.disputed ? "settled (agreed part)" : "settled";
      chain(s, action.by, `pledge(${c.id}, ${p.id})`, `Control contract checked call and proposal, took ${fmtAssets(p.assets)}; call settled${c.disputed ? " for the agreed part; " + usd(c.disputed) + " still disputed" : ""}`);
      return s;
    }

    case "agreeReturn": {
      const c = getCall(s, action.callId);
      if (c.kind !== "Return" || s.kind !== "IM") fail(`${c.id} is not an IM return call`);
      if (action.by !== c.to) fail(`Only ${name(c.to)} can agree to ${c.id}`);
      if (c.state !== "issued") fail(`${c.id} has already been answered`);
      const v = assetsValue(s, action.release);
      if (v > c.amount + 1e-6) fail(`Control contract: releasing ${usd(v)} exceeds the return amount ${usd(c.amount)}`);
      for (const [t, q] of action.release) {
        const held = s.pledges.filter((p) => p.state === "pledged" && p.token === t).reduce((a, p) => a + p.qty, 0);
        if (q > held) fail(`Control contract: only ${qty(held)} ${t} pledged`);
        let left = q;
        for (const p of s.pledges.filter((x) => x.state === "pledged" && x.token === t)) {
          const take = Math.min(left, p.qty);
          p.qty -= take;
          left -= take;
        }
        s.pledges = s.pledges.filter((p) => !(p.state === "pledged" && p.qty === 0));
        s.pledges.push({ token: t, qty: q, call: c.id, state: "returned" });
      }
      credit(s, c.from, action.release);
      c.state = "settled";
      c.agreed = c.amount;
      chain(s, action.by, `respond(${c.id}, agree) · returnPledge(${c.id}, ${fmtAssets(action.release)})`, `Return agreed and executed, signed by ${name(action.by)}; call settled`);
      msg(s, action.by, c.from, "MarginCallResponse", `${c.id} agreed`);
      return s;
    }

    case "settleByTransfer": {
      if (s.kind !== "VM") fail("Under the IM agreement collateral is pledged, not transferred");
      const c = getCall(s, action.callId);
      if (action.by !== c.to) fail(`Only ${name(c.to)} delivers against ${c.id}`);
      const p = getProposal(c, action.proposalId);
      if (p.state !== "accepted") fail(`${p.id} has not been accepted by ${name(c.from)}`);
      if (!(c.state === "agreed" || c.state === "partially agreed")) fail(`${c.id} is not in an agreed state`);
      debit(s, action.by, p.assets);
      credit(s, c.from, p.assets);
      s.held += assetsValue(s, p.assets);
      c.state = c.disputed ? "settled (agreed part)" : "settled";
      chain(s, action.by, `settleByTransfer(${c.id}, ${fmtAssets(p.assets)})`, `${fmtAssets(p.assets)} moved ${name(action.by)} → ${name(c.from)}; title passes; call settled`);
      return s;
    }

    case "agreeReturnTransfer": {
      if (s.kind !== "VM") fail("Not a VM agreement");
      const c = getCall(s, action.callId);
      if (c.kind !== "Return") fail(`${c.id} is not a return call`);
      if (action.by !== c.to) fail(`Only ${name(c.to)} can agree to ${c.id}`);
      if (c.state !== "issued") fail(`${c.id} has already been answered`);
      const v = assetsValue(s, action.assets);
      if (Math.abs(v - c.amount) > 1e-6) fail(`Transfer ${usd(v)} does not equal the return amount ${usd(c.amount)}`);
      debit(s, action.by, action.assets);
      credit(s, c.from, action.assets);
      s.held -= v;
      c.state = "settled";
      c.agreed = c.amount;
      chain(s, action.by, `respond(${c.id}, agree) · settleByTransfer(${c.id}, ${fmtAssets(action.assets)})`, `Equivalent credit support returned ${name(action.by)} → ${name(c.from)}; call settled`);
      msg(s, action.by, c.from, "MarginCallResponse", `${c.id} agreed`);
      return s;
    }

    case "transfer": {
      debit(s, action.by, [[action.token, action.qty]]);
      if (action.by === "B") s.reused += action.qty * s.feed[action.token];
      chain(s, action.by, `transfer(${action.to}, ${action.token} ${qty(action.qty)})`, `${name(action.by)} moved ${action.token} out of its wallet`);
      return s;
    }

    case "setMockPrice":
      if (action.by !== "M") fail("Only the market data operator edits market data");
      if (!(action.price > 0)) fail("Price must be positive");
      s.mock[action.token] = action.price;
      msg(s, "M", "M", "Market data", `Mock source: ${action.token} = ${action.price.toFixed(2)}`);
      return s;

    case "publishPrice":
      if (action.by !== "M") fail("Only the oracle publisher writes the feed");
      s.feed[action.token] = s.mock[action.token];
      chain(s, "M", `publishPrice(${action.token}, ${s.feed[action.token].toFixed(2)})`, "Oracle feed updated, signed by the oracle publisher");
      return s;

    case "publishDefault":
      if (action.by !== "M") fail("Only the oracle publisher writes the feed");
      if (!s.defaulted.includes(action.party)) s.defaulted.push(action.party);
      chain(s, "M", `publishDefault(${name(action.party)})`, `Oracle feed: ${name(action.party)} in default`);
      return s;

    case "enforce": {
      if (s.kind !== "IM") fail("Enforcement against pledged collateral applies to the IM agreement");
      const c = getCall(s, action.callId);
      if (action.by !== c.from || c.kind === "Return") fail(`Only the Secured Party ${name(c.from)} can enforce`);
      if (!s.defaulted.includes(c.to)) fail(`Control contract: the oracle feed shows no default for ${name(c.to)}`);
      const live = s.pledges.filter((p) => p.state === "pledged");
      if (!live.length) fail("Control contract: nothing is pledged");
      for (const p of live) p.state = "enforced";
      credit(s, action.by, live.map((p) => [p.token, p.qty] as Asset));
      chain(s, action.by, `enforce(${c.id})`, `Contract confirmed the default; ${fmtAssets(live.map((p) => [p.token, p.qty]))} moved to ${name(action.by)}`);
      return s;
    }
  }
}

/** Events added by the most recent action (for highlighting). */
export const freshEvents = (s: State): LedgerEvent[] => s.ev.filter((e) => e.step === s.step);
