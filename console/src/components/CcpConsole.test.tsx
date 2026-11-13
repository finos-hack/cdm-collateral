// Unit tests for the CCP card and BANK-C's console (task-ccp-membership). The workflow service is replaced by a fetch
// stub that serves /health and /ccp and records every POST.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CcpCard, CcpConsole } from "./CcpConsole";
import type { LiveCcp, LiveCcpClearing, LiveCcpDefaults, LiveCcpMargin, LiveCcpRulebook } from "../domain/liveApi";

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
let margin: LiveCcpMargin | null;
let defaults: LiveCcpDefaults | null;

beforeEach(() => {
  posts = [];
  served = { party: "C", bank: "BANK-C", ccp: true, canPublish: true, rulebook: null };
  margin = null;
  defaults = null;
  (globalThis as any).EventSource = StubEventSource;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/api\/v1/, "");
    if (init?.method === "POST") {
      posts.push(path);
      return new Response("{}", { status: 200 });
    }
    if (path === "/health") return new Response(JSON.stringify({ party: "C", role: "Central Counterparty", address: "0xC", ok: true }), { status: 200 });
    if (path === "/ccp") return new Response(JSON.stringify(served), { status: 200 });
    if (path === "/ccp/margin" && margin) return new Response(JSON.stringify(margin), { status: 200 });
    if (path === "/ccp/defaults" && defaults) return new Response(JSON.stringify(defaults), { status: 200 });
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

// Margin, default and porting (task-ccp-margin, task-ccp-default, task-ccp-porting).
const EFFECTIVE: LiveCcpRulebook = { ...RULEBOOK, state: "Effective" };
const ROUND = "0x" + "aa".repeat(32);

it("lets the CCP issue the day's margin calls and admit BANK-T", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  margin = {
    businessDate: "2026-11-13", ccp: true, canIssue: true, rounds: [],
    preview: [{ party: "A", vm: 1200, im: 4920, net: 6120 }, { party: "B", vm: -1200, im: 4920, net: 3720 }],
  };
  defaults = { businessDate: "2026-11-13", members: [{ party: "A", inDefault: false, canDeclare: true }], defaults: [] };
  render(<CcpCard party="C" ccp={{ party: "C", bank: "BANK-C", ccp: true, canPublish: false, rulebook: { ...EFFECTIVE, canAdmit: ["T"] } }} busy={false} run={run} />);
  expect((await screen.findByTestId("ccp-margin-preview")).textContent).toContain("BANK-A VM 1,200 IM 4,920 net 6,120");
  await userEvent.click(screen.getByText("Issue today's margin calls"));
  await userEvent.click(screen.getByText("Admit BANK-T as a member"));
  await waitFor(() => expect(posts).toEqual(["/ccp/margin", "/ccp/members"]));
  expect(screen.getByText("Declare the default of BANK-A and close out")).toBeTruthy();
});

it("shows a member its checked statement and lets it pay its net", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  margin = {
    businessDate: "2026-11-13", ccp: false, canIssue: false,
    rounds: [{
      roundId: ROUND, businessDate: "2026-11-13", state: "issued", canCancel: false,
      members: [{ party: "A", vm: 1200, im: 4920, net: 6120, paid: false }, { party: "B", vm: -1200, im: 4920, net: 3720, paid: false }],
      repos: [{ repoId: CLEARING.repoId, vm: 1200 }],
      mine: { vm: 1200, im: 4920, net: 6120, calls: ["VM", "NonRegIM"], verified: true, problem: null, paid: false, canPay: true },
    }],
  };
  render(<CcpCard party="A" ccp={{ party: "A", bank: "BANK-A", ccp: false, canPublish: false, rulebook: EFFECTIVE }} busy={false} run={run} />);
  const mine = await screen.findByTestId("ccp-round-mine");
  expect(mine.textContent).toContain("net 6,120");
  expect(mine.textContent).toContain("CDM calls VM, NonRegIM");
  expect(mine.textContent).toContain("statement checked");
  await userEvent.click(screen.getByText("Pay my margin"));
  await waitFor(() => expect(posts).toEqual([`/ccp/margin/${ROUND}/pay`]));
});

it("shows a round that settled before this member checked it, without its VM and IM", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  margin = {
    businessDate: "2026-11-13", ccp: false, canIssue: false,
    rounds: [{
      roundId: ROUND, businessDate: "2026-11-13", state: "settled", canCancel: false,
      members: [{ party: "A", vm: 41, im: -5000, net: -4959, paid: false }, { party: "B", vm: -41, im: -5000, net: -5041, paid: false }],
      repos: [{ repoId: CLEARING.repoId, vm: 41 }],
      mine: { net: -4959, problem: "the round is settled; this service did not check it" },
    }],
  };
  render(<CcpCard party="A" ccp={{ party: "A", bank: "BANK-A", ccp: false, canPublish: false, rulebook: EFFECTIVE }} busy={false} run={run} />);
  const mine = await screen.findByTestId("ccp-round-mine");
  expect(mine.textContent).toContain("my statement: net -4,959");
  expect(mine.textContent).not.toContain("VM");
  expect((await screen.findByTestId("ccp-round-problem")).textContent).toBe("the round is settled; this service did not check it");
});

it("shows a closed-out default with its waterfall and lets a survivor that owes pay", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  const hash = "0x" + "bb".repeat(32);
  defaults = {
    businessDate: "2026-11-13", members: [{ party: "B", inDefault: false, canDeclare: false }],
    defaults: [{
      closeOutHash: hash, defaulter: "A", loss: -3000, fromInitialMargin: 0, fromDefaulterFund: 0, fromCapital: 0, fromMembersFund: 0,
      returned: 508000, dueOutstanding: 3000, due: [{ party: "B", amount: 3000 }], mineDue: 3000, closeOutDate: "2026-11-13",
      transactions: [{ repoId: "0x01", survivor: "BANK-B", price: "110", repurchasePrice: 100086, defaultMarketValue: 103086, variationMarginPaid: 0, residual: -3000, survivorAmount: -3000 }],
      verified: true, problem: null, canPayDue: true,
    }],
  };
  render(<CcpCard party="B" ccp={{ party: "B", bank: "BANK-B", ccp: false, canPublish: false, rulebook: EFFECTIVE }} busy={false} run={run} />);
  const d = await screen.findByTestId("ccp-default-A");
  expect(d.textContent).toContain("loss -3,000 tUSD");
  expect(d.textContent).toContain("close-out checked");
  expect(screen.getByTestId("ccp-default-survivors").textContent).toBe("BANK-B owes 3,000");
  await userEvent.click(screen.getByText("Pay the 3,000 tUSD I owe on the close-out"));
  await waitFor(() => expect(posts).toEqual([`/ccp/defaults/${hash}/pay`]));
});

it("lets a member port its leg, the receiving member accept and the CCP approve", async () => {
  const run = async (fn: () => Promise<unknown>) => { await fn(); };
  const purchased = { ...CLEARING, state: "purchased", canAffirm: false, phase: "repurchase" as const, vmBalance: 1200 };
  render(<CcpCard party="A" ccp={{ party: "A", bank: "BANK-A", ccp: false, canPublish: false, rulebook: EFFECTIVE }}
    clearings={[{ ...purchased, role: "seller", canPortTo: ["T"] }]} busy={false} run={run} />);
  expect(screen.getByText(/variation margin paid 1,200 tUSD by BANK-A/)).toBeTruthy();
  await userEvent.click(screen.getByText("Port my leg to BANK-T"));
  cleanup();
  const porting = { from: "A", to: "T", payment: 2500, state: "requested", portingHash: "0x" + "cc".repeat(32), verified: true, problem: null };
  render(<CcpCard party="T" ccp={{ party: "T", bank: "BANK-T", ccp: false, canPublish: false, rulebook: EFFECTIVE }}
    clearings={[{ ...purchased, role: "", porting, canAcceptPorting: true, canRefusePorting: true }]} busy={false} run={run} />);
  expect(screen.getByTestId("ccp-porting").textContent).toContain("porting BANK-A → BANK-T · payment 2,500 tUSD");
  expect(screen.getByTestId("ccp-porting").textContent).toContain("porting checked");
  await userEvent.click(screen.getByText("Accept the porting"));
  cleanup();
  render(<CcpCard party="C" ccp={{ party: "C", bank: "BANK-C", ccp: true, canPublish: false, rulebook: EFFECTIVE }}
    clearings={[{ ...purchased, role: "ccp", porting: { ...porting, state: "accepted" }, canApprovePorting: true }]} busy={false} run={run} />);
  await userEvent.click(screen.getByText("Approve the porting"));
  const id = CLEARING.repoId;
  await waitFor(() => expect(posts).toEqual([`/ccp/clearings/${id}/porting`, `/ccp/clearings/${id}/porting/accept`, `/ccp/clearings/${id}/porting/approve`]));
});
