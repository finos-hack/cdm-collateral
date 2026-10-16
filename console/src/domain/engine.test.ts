import { apply, EngineError, evaluateProposal, pledgedValue, type Action } from "./engine";
import { baseState, settledImState } from "../scenarios/scenarios";
import type { State } from "./types";

const run = (s: State, ...actions: Action[]) => actions.reduce((acc, a) => apply(acc, a), s);
const issue: Action = { type: "issueCall", by: "B", to: "A", kind: "IM", amount: 12_400_000, deadline: "2026-10-19", requirement: 12_400_000 };
const agree: Action = { type: "respond", by: "A", callId: "C-0001", response: "full", agreed: 12_400_000 };
const proposeUst: Action = { type: "propose", by: "A", callId: "C-0001", assets: [["tUST", 128_589]] };
const accept: Action = { type: "decideProposal", by: "B", callId: "C-0001", proposalId: "P-1", accept: true };

describe("margin call contract rules", () => {
  it("only the secured party issues an IM call", () => {
    expect(() => apply(baseState("IM"), { ...issue, by: "A", to: "B" } as Action)).toThrow(/Only the Secured Party/);
  });
  it("rejects a call below the minimum transfer amount", () => {
    expect(() => apply(baseState("IM"), { ...issue, amount: 400_000 } as Action)).toThrow(/minimum transfer amount/);
  });
  it("only the called party responds, once", () => {
    const s = run(baseState("IM"), issue);
    expect(() => apply(s, { ...agree, by: "B" } as Action)).toThrow(/Only BANK-A/);
    expect(() => apply(apply(s, agree), agree)).toThrow(/already been answered/);
  });
  it("records agreed and disputed amounts on a partial agreement", () => {
    const s = run(baseState("IM"), issue, { type: "respond", by: "A", callId: "C-0001", response: "partial", agreed: 11_900_000 });
    expect(s.calls[0]).toMatchObject({ state: "partially agreed", agreed: 11_900_000, disputed: 500_000 });
  });
  it("only the receiving party decides on a proposal", () => {
    const s = run(baseState("IM"), issue, agree, proposeUst);
    expect(() => apply(s, { ...accept, by: "A" } as Action)).toThrow(/Only BANK-B decides/);
  });
  it("writes one on-chain transaction and one off-chain message per call issue", () => {
    const s = run(baseState("IM"), issue);
    expect(s.ev.filter((e) => e.lane === "on")).toHaveLength(1);
    expect(s.ev.filter((e) => e.lane === "off")).toHaveLength(1);
    expect(s.block).toBe(1205);
  });
});

describe("collateral control contract rules (wp-adr-im-segregation)", () => {
  it("rejects a pledge before the proposal is accepted", () => {
    const s = run(baseState("IM"), issue, agree, proposeUst);
    expect(() => apply(s, { type: "pledge", by: "A", callId: "C-0001", proposalId: "P-1" })).toThrow(/has not been accepted/);
  });
  it("rejects a pledge that does not cover the agreed amount", () => {
    const s = run(baseState("IM"), issue, agree, { type: "propose", by: "A", callId: "C-0001", assets: [["tUST", 1_000]] }, accept);
    expect(() => apply(s, { type: "pledge", by: "A", callId: "C-0001", proposalId: "P-1" })).toThrow(/does not cover/);
  });
  it("moves tokens into the contract and settles the call", () => {
    const s = run(baseState("IM"), issue, agree, proposeUst, accept, { type: "pledge", by: "A", callId: "C-0001", proposalId: "P-1" });
    expect(s.wallet.A.tUST).toBe(400_000 - 128_589);
    expect(s.wallet.B.tUST).toBe(0);
    expect(s.calls[0].state).toBe("settled");
    expect(pledgedValue(s)).toBeGreaterThanOrEqual(12_400_000);
  });
  it("rejects enforcement without a default on the oracle feed", () => {
    expect(() => apply(settledImState(), { type: "enforce", by: "B", callId: "C-0001" })).toThrow(/no default/);
  });
  it("enforces after the default is published", () => {
    const s = run(settledImState(), { type: "publishDefault", by: "M", party: "A" }, { type: "enforce", by: "B", callId: "C-0001" });
    expect(s.wallet.B.tUST).toBe(128_589);
    expect(s.pledges.every((p) => p.state === "enforced")).toBe(true);
  });
  it("the secured party cannot move pledged tokens (segregation)", () => {
    expect(() => apply(settledImState(), { type: "transfer", by: "B", token: "tUST", qty: 1, to: "elsewhere" })).toThrow(/holds only 0/);
  });
  it("releases no more than the return amount", () => {
    const s = run(settledImState(), { type: "issueCall", by: "A", to: "B", kind: "Return", amount: 4_300_000, deadline: "2026-10-19" });
    expect(() => apply(s, { type: "agreeReturn", by: "B", callId: "C-0002", release: [["tUST", 50_000]] })).toThrow(/exceeds the return amount/);
  });
});

describe("proposal evaluation", () => {
  it("flags a breach of the concentration limit", () => {
    const s = run(baseState("IM"), issue, { type: "respond", by: "A", callId: "C-0001", response: "partial", agreed: 11_900_000 },
      { type: "propose", by: "A", callId: "C-0001", assets: [["tMMF", 12_395_834]] });
    const checks = evaluateProposal(s, s.calls[0], s.calls[0].proposals[0]);
    expect(checks.find((c) => /limit 50%/.test(c.text))?.ok).toBe(false);
    expect(checks.find((c) => /Value after haircuts/.test(c.text))?.ok).toBe(true);
  });
});

describe("title transfer (VM CSA)", () => {
  it("rejects a pledge under the VM CSA", () => {
    expect(() => apply(baseState("VM"), { type: "pledge", by: "A", callId: "C-0001", proposalId: "P-1" })).toThrow(EngineError);
  });
  it("lets the transferee reuse received cash", () => {
    const s = run(baseState("VM"), { type: "transfer", by: "B", token: "tUSD", qty: 1_000_000, to: "treasury" });
    expect(s.reused).toBe(1_000_000);
  });
});

describe("purity", () => {
  it("does not mutate the input state", () => {
    const s0 = baseState("IM");
    const copy = structuredClone(s0);
    apply(s0, issue);
    expect(s0).toEqual(copy);
  });
});
