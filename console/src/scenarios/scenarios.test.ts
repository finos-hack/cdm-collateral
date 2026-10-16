import { capInfo, ROWS } from "../domain/coverage";
import { pledgedValue } from "../domain/engine";
import { SCENARIOS, scenarioById } from "./scenarios";
import { stateAt } from "./run";

describe("every scenario runs to completion through the engine", () => {
  for (const sc of SCENARIOS) {
    it(sc.id, () => {
      const s = stateAt(sc, sc.steps.length);
      expect(s.step).toBe(sc.steps.length);
      for (const st of sc.steps) for (const c of st.caps) expect(() => capInfo(sc.kind, c)).not.toThrow();
    });
  }
});

describe("scenario outcomes", () => {
  it("im-call ends with the call settled and covered", () => {
    const s = stateAt(scenarioById("im-call")!, 6);
    expect(s.calls[0].state).toBe("settled");
    expect(pledgedValue(s)).toBeGreaterThanOrEqual(s.req);
  });
  it("im-dispute leaves the disputed amount open", () => {
    const s = stateAt(scenarioById("im-dispute")!, 8);
    expect(s.calls[0]).toMatchObject({ state: "settled (agreed part)", disputed: 500_000 });
    expect(s.calls[0].proposals.map((p) => p.state)).toEqual(["rejected", "accepted"]);
  });
  it("im-reval restores coverage after the top-up", () => {
    const sc = scenarioById("im-reval")!;
    expect(pledgedValue(stateAt(sc, 3))).toBeLessThan(12_400_000);
    expect(pledgedValue(stateAt(sc, sc.steps.length))).toBeGreaterThanOrEqual(12_400_000);
  });
  it("im-return keeps the remainder covered", () => {
    const s = stateAt(scenarioById("im-return")!, 3);
    expect(s.wallet.A.tUST).toBe(400_000 - 128_589 + 44_591);
    expect(pledgedValue(s)).toBeGreaterThanOrEqual(8_100_000);
  });
  it("im-default moves the collateral to the secured party", () => {
    expect(stateAt(scenarioById("im-default")!, 4).wallet.B.tUST).toBe(128_589);
  });
  it("vm-call settles by title transfer and allows reuse", () => {
    const s = stateAt(scenarioById("vm-call")!, 6);
    expect(s.held).toBe(8_240_000);
    expect(s.reused).toBe(3_240_000);
  });
  it("vm-return brings the balance down to the exposure", () => {
    expect(stateAt(scenarioById("vm-return")!, 3).held).toBe(6_000_000);
  });
});

describe("grid", () => {
  it("every available cell points to a scenario and every capability exists", () => {
    for (const r of ROWS) for (const c of r.cells) {
      if (c[0] === "go") expect(scenarioById(c[1])).toBeDefined();
      if (c[0] === "go" || c[0] === "plan") for (const id of c[2]) expect(() => capInfo(r.fam, id)).not.toThrow();
    }
  });
});
