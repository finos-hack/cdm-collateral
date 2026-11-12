// Unit tests for the CCP card and BANK-C's console (task-ccp-membership). The workflow service is replaced by a fetch
// stub that serves /health and /ccp and records every POST.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CcpCard, CcpConsole } from "./CcpConsole";
import type { LiveCcp, LiveCcpClearing, LiveCcpRulebook } from "../domain/liveApi";

class StubEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

const RULEBOOK: LiveCcpRulebook = {
  rulebookHash: "0x" + "44".repeat(32),
  state: "Published",
  capital: 250000,
  fund: 500000,
  verified: true,
  problem: null,
  members: [
    { party: "A", bank: "BANK-A", share: 500000, paid: true },
    { party: "B", bank: "BANK-B", share: 500000, paid: false },
  ],
  rulebook: {
    ccp: "BANK-C", role: "ClearingOrganization", initialMarginRate: "0.05", variationMarginPeriodDays: 1, defaultFund: 1000000,
    ccpCapital: 250000, baseCurrency: "USD", effectiveDate: "2026-11-12",
    members: [{ name: "BANK-A", share: 500000, agreement: "CCP rulebook" }, { name: "BANK-B", share: 500000, agreement: "CCP rulebook" }],
  },
  canJoin: true,
  canLeave: false,
};

let posts: string[] = [];
let served: LiveCcp;

beforeEach(() => {
  posts = [];
  served = { party: "C", bank: "BANK-C", ccp: true, canPublish: true, rulebook: null };
  (globalThis as any).EventSource = StubEventSource;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api\/v1/, "");
    if (init?.method === "POST") {
      posts.push(path);
      return new Response("{}", { status: 200 });
    }
    if (path === "/health") return new Response(JSON.stringify({ party: "C", role: "Central Counterparty", address: "0xC", ok: true }), { status: 200 });
    if (path === "/ccp") return new Response(JSON.stringify(served), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
});
afterEach(cleanup);

it("lets the CCP publish its rulebook when it has none", async () => {
  render(<CcpConsole />);
  await screen.findByText("CCP rulebook (CCP)");
  expect(screen.getByText(/BANK-C · Central Counterparty/)).toBeTruthy();
  await userEvent.click(screen.getByText("Publish the rulebook and pay the capital"));
  await waitFor(() => expect(posts).toEqual(["/ccp/rulebook"]));
});

it("shows the rulebook, the fund and each member's payment, and lets an unpaid member join", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  render(<CcpCard party="B" ccp={{ party: "B", bank: "BANK-B", ccp: false, canPublish: false, rulebook: RULEBOOK }} busy={false} run={run} />);
  expect(screen.getByText("CCP membership")).toBeTruthy();
  expect(screen.getByTestId("ccp-state").textContent).toBe("Published");
  expect(screen.getByTestId("ccp-terms").textContent).toContain("initial margin 5.00%");
  expect(screen.getByTestId("ccp-fund").textContent).toContain("default fund paid in 500,000 tUSD of 1,000,000");
  expect(screen.getByTestId("ccp-member-A").textContent).toContain("yes");
  expect(screen.getByTestId("ccp-member-B").textContent).toContain("no");
  expect(screen.queryByText(/Leave and get the share back/)).toBeNull();
  await userEvent.click(screen.getByText("Affirm the rulebook and pay the share"));
  await waitFor(() => expect(posts).toEqual(["/ccp/join"]));
});

it("lets a paid member leave and shows a rulebook that does not check", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  const r = { ...RULEBOOK, state: "Effective", verified: false, problem: "the rulebook names other members", canJoin: false, canLeave: true };
  render(<CcpCard party="A" ccp={{ party: "A", bank: "BANK-A", ccp: false, canPublish: false, rulebook: r }} busy={false} run={run} />);
  expect(screen.getByTestId("ccp-problem").textContent).toBe("the rulebook names other members");
  expect(screen.queryByText(/Affirm the rulebook/)).toBeNull();
  await userEvent.click(screen.getByText("Leave and get the share back"));
  await waitFor(() => expect(posts).toEqual(["/ccp/leave"]));
});

const CLEARING: LiveCcpClearing = {
  repoId: "0x" + "77".repeat(32),
  state: "submitted",
  role: "buyer",
  seller: "A",
  buyer: "B",
  ccp: "C",
  security: "tUST",
  quantity: 1020,
  purchasePrice: 98400,
  repurchasePrice: 98486,
  novationHash: "0x" + "88".repeat(32),
  sellerInstructed: false,
  buyerInstructed: false,
  verified: true,
  problem: null,
  legs: [{ tradeId: "x-SC", seller: "BANK-A", buyer: "BANK-C" }, { tradeId: "x-CB", seller: "BANK-C", buyer: "BANK-B" }],
  repurchaseDate: "2026-11-19",
  repurchaseDue: false,
  cleared: true,
  canAffirm: true,
  canAccept: false,
  canRefuse: false,
  canInstruct: false,
  phase: "purchase",
};

it("lets the seller submit an affirmed repo and the buyer affirm the submission, with both legs shown", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  const effective = { ...RULEBOOK, state: "Effective" };
  render(<CcpCard party="A" ccp={{ party: "A", bank: "BANK-A", ccp: false, canPublish: false, rulebook: effective }}
    clearable={[{ repoId: "0x" + "99".repeat(32), security: "tUST", purchasePrice: "98400" }]} busy={false} run={run} />);
  await userEvent.click(screen.getByText("Submit to BANK-C for clearing"));
  await waitFor(() => expect(posts).toEqual(["/ccp/clearings"]));
  cleanup();
  render(<CcpCard party="B" ccp={{ party: "B", bank: "BANK-B", ccp: false, canPublish: false, rulebook: effective }} clearings={[CLEARING]} busy={false} run={run} />);
  const row = screen.getByTestId(`ccp-clearing-${CLEARING.repoId}`);
  expect(row.textContent).toContain("novation checked");
  expect(screen.getByTestId("ccp-clearing-legs").textContent).toContain("BANK-A → BANK-C, BANK-C → BANK-B");
  expect(screen.getByTestId("ccp-clearing-legs").textContent).toContain("CDM cleared trade: yes");
  await userEvent.click(screen.getByText("Affirm the submission"));
  await waitFor(() => expect(posts).toEqual(["/ccp/clearings", `/ccp/clearings/${CLEARING.repoId}/affirm`]));
});

it("lets the CCP accept and a member instruct its leg", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  const effective = { ...RULEBOOK, state: "Effective" };
  render(<CcpCard party="C" ccp={{ party: "C", bank: "BANK-C", ccp: true, canPublish: false, rulebook: effective }}
    clearings={[{ ...CLEARING, state: "affirmed", role: "ccp", canAffirm: false, canAccept: true, canRefuse: true }]} busy={false} run={run} />);
  await userEvent.click(screen.getByText("Accept for clearing"));
  cleanup();
  render(<CcpCard party="A" ccp={{ party: "A", bank: "BANK-A", ccp: false, canPublish: false, rulebook: effective }}
    clearings={[{ ...CLEARING, state: "cleared", role: "seller", canAffirm: false, canInstruct: true, buyerInstructed: true }]} busy={false} run={run} />);
  expect(screen.getByText(/BANK-B instructed/)).toBeTruthy();
  await userEvent.click(screen.getByText("Instruct the purchase of my leg"));
  await waitFor(() => expect(posts).toEqual([`/ccp/clearings/${CLEARING.repoId}/accept`, `/ccp/clearings/${CLEARING.repoId}/instruct`]));
});
