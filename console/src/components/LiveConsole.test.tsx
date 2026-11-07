// Unit tests for the live console's flow-return and flow-default-enforcement actions. The workflow service is replaced
// by a fetch stub that serves /context and /state and records every POST, so each test checks which actions a party
// is offered for a given on-chain call state and what the console sends to its own service.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveConsole } from "./LiveConsole";
import type { LiveCall, LiveParty, LiveRevaluation, LiveState } from "../domain/liveApi";

class StubEventSource {
  static listeners: (() => void)[] = [];
  addEventListener(_type: string, fn: () => void) { StubEventSource.listeners.push(fn); }
  removeEventListener() {}
  close() {}
}

const CONTEXT = {
  A: { party: "A", role: "Pledgor", node: "bank-a", address: "0xA", counterparty: "B", counterpartyAddress: "0xB" },
  B: { party: "B", role: "Secured Party", node: "bank-b", address: "0xB", counterparty: "A", counterpartyAddress: "0xA" },
};

function call(over: Partial<LiveCall>): LiveCall {
  return {
    callId: "0x1111111111111111111111111111111111111111111111111111111111111111",
    kind: "IM",
    from: "B",
    to: "A",
    amountUsd: "2000000",
    agreedUsd: "2000000",
    disputedUsd: "0",
    state: "issued",
    cdmHash: "0x00",
    proposals: [],
    messages: [],
    ...over,
  };
}

let posts: { path: string; body: unknown }[] = [];

const NO_SHORTFALL: LiveRevaluation = {
  requiredUsd: "0", valueUsd: "0", shortfallUsd: "0", topUpUsd: "0", mtaUsd: "500000", roundingUsd: "10000", tokens: [],
};

function serve(party: LiveParty, state: Omit<LiveState, "party" | "role">, reval: LiveRevaluation = NO_SHORTFALL, extra: Record<string, unknown> = {}) {
  posts = [];
  vi.stubGlobal("EventSource", StubEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, "");
      if (init?.method === "POST") {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        const reply = extra[`POST ${path}`] ?? { ok: true };
        return new Response(JSON.stringify(reply), { status: 200 });
      }
      if (path === "/revaluation") return new Response(JSON.stringify(reval), { status: 200 });
      if (path in extra) return new Response(JSON.stringify(extra[path]), { status: 200 });
      const body = path === "/context" ?{ ...CONTEXT[party], priceScale: "100000000", tokens: [], agreement: "IM CSA" } : { party, role: CONTEXT[party].role, ...state };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  render(<LiveConsole party={party} />);
}

const balances = (pledged: string) => [{ token: "tUST", free: "1000", pledged }];

afterEach(() => vi.unstubAllGlobals());

describe("flow-return", () => {
  it("the pledgor calls for a return of initial margin from its console", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("50000") });
    const card = (await screen.findByRole("heading", { name: "Call for a return" })).closest(".card") as HTMLElement;
    await user.clear(within(card).getByRole("spinbutton"));
    await user.type(within(card).getByRole("spinbutton"), "750000");
    await user.click(within(card).getByRole("button", { name: "Call return → B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/calls", body: { kind: "Return", toParty: "B", amountUsd: 750000, deadlineDays: 1 } }]));
  });

  it("the secured party is offered only full agreement on an issued return call", async () => {
    serve("B", { calls: [call({ kind: "Return", from: "A", to: "B", state: "issued" })], balances: balances("50000") });
    const row = (await screen.findByText(/Return · A → B/)).closest(".subcard") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Agree in full" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Dispute" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Agree part" })).toBeNull();
  });

  it("the secured party releases escrowed collateral on an agreed return call", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ kind: "Return", from: "A", to: "B", state: "agreed" })], balances: balances("50000") });
    const row = (await screen.findByText(/Return · A → B/)).closest(".subcard") as HTMLElement;
    await user.clear(within(row).getByRole("spinbutton"));
    await user.type(within(row).getByRole("spinbutton"), "7000");
    await user.click(within(row).getByRole("button", { name: "Release escrow" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { path: `/calls/${call({}).callId}/return`, body: { via: "release", assets: [{ token: "tUST", qty: 7000 }] } },
      ]),
    );
  });

  it("the pledgor is not offered the release on its own return call", async () => {
    serve("A", { calls: [call({ kind: "Return", from: "A", to: "B", state: "agreed" })], balances: balances("50000") });
    const row = (await screen.findByText(/Return · A → B/)).closest(".subcard") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Release escrow" })).toBeNull();
  });
});

describe("flow-default-enforcement", () => {
  it("the secured party declares the default and enforces on a settled IM call with collateral in escrow", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ state: "settled" })], balances: balances("50000"), defaults: { A: false, B: false } });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Declare default & enforce" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/enforce`, body: {} }]));
  });

  it("enforcement is not offered when nothing is pledged", async () => {
    serve("B", { calls: [call({ state: "settled" })], balances: balances("0") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("enforcement is not offered before the call is settled", async () => {
    serve("B", { calls: [call({ state: "agreed" })], balances: balances("50000") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("the pledgor is never offered enforcement", async () => {
    serve("A", { calls: [call({ state: "settled" })], balances: balances("50000") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).getByText("settled on-chain ✓")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("an enforced call shows the enforcement and no further action", async () => {
    serve("B", { calls: [call({ state: "settled", enforced: true, events: ["Enforced"] })], balances: balances("50000") });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    expect(within(row).getByText("enforced ✓")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Declare default & enforce" })).toBeNull();
  });

  it("each console shows the default recorded on the oracle feed", async () => {
    serve("A", { calls: [], balances: balances("0"), defaults: { A: true, B: false } });
    expect(await screen.findByRole("status")).toHaveTextContent("This party (A) in default on the oracle feed");
  });

  it("the secured party sees the counterparty's default", async () => {
    serve("B", { calls: [], balances: balances("0"), defaults: { A: true, B: false } });
    expect(await screen.findByRole("status")).toHaveTextContent("Counterparty A in default on the oracle feed");
  });
});

describe("flow-revaluation-top-up", () => {
  const SHORTFALL: LiveRevaluation = {
    requiredUsd: "8000000", valueUsd: "7216000", shortfallUsd: "784000", topUpUsd: "790000", mtaUsd: "500000", roundingUsd: "10000",
    tokens: [{ token: "tUST", pledged: "83000", price: "8900000000", haircutBps: 200, valueUsd: "7216000" }],
  };

  it("the secured party sees the shortfall and issues a top-up IM call for the rounded amount", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("83000") }, SHORTFALL);
    const card = await screen.findByTestId("revaluation");
    expect(within(card).getByTestId("shortfall")).toHaveTextContent("USD 784,000");
    expect(within(card).getByTestId("top-up")).toHaveTextContent("USD 790,000");
    await user.click(within(card).getByRole("button", { name: "Issue top-up IM call → A" }));
    await waitFor(() =>
      expect(posts).toEqual([{ path: "/calls", body: { kind: "IM", toParty: "A", amountUsd: 790000, deadlineDays: 1, purpose: "top-up" } }]),
    );
  });

  it("no top-up is offered below the minimum transfer amount", async () => {
    serve("B", { calls: [], balances: balances("83000") }, { ...SHORTFALL, shortfallUsd: "120000", topUpUsd: "0" });
    const card = await screen.findByTestId("revaluation");
    expect(within(card).getByTestId("shortfall")).toHaveTextContent("USD 120,000");
    expect(within(card).queryByRole("button", { name: /Issue top-up/ })).toBeNull();
  });

  it("the pledgor is not shown the revaluation", async () => {
    serve("A", { calls: [], balances: balances("83000") }, SHORTFALL);
    await screen.findByRole("heading", { name: "Call for a return" });
    expect(screen.queryByTestId("revaluation")).toBeNull();
  });
});

describe("flow-call-cancellation", () => {
  const rowOf = async () => (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;

  it("the calling party withdraws an unanswered call; the called party is not offered the withdrawal", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ state: "issued" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).queryByRole("button", { name: "Request cancellation" })).toBeNull();
    await user.type(within(row).getByLabelText("Cancellation reason"), "booked in error");
    await user.click(within(row).getByRole("button", { name: "Withdraw call" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/withdraw`, body: { reason: "booked in error" } }]));
  });

  it("the called party sees no withdrawal on an issued call", async () => {
    serve("A", { calls: [call({ state: "issued" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).queryByRole("button", { name: "Withdraw call" })).toBeNull();
  });

  it("either party requests cancellation of an answered call, wholly disputed ones included", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [call({ state: "disputed", agreedUsd: "0", disputedUsd: "2000000" })], balances: balances("0") });
    const row = await rowOf();
    await user.click(within(row).getByRole("button", { name: "Request cancellation" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/cancellation`, body: { reason: "" } }]));
  });

  it("while a request is pending the requester waits and the other party accepts or refuses; no other step is offered", async () => {
    const user = userEvent.setup();
    const pendingCall = call({ state: "agreed", cancellationRequestedBy: "A", proposals: [{ proposalId: 0, state: "accepted", assets: [{ token: "tUST", qty: "100" }] }] });
    serve("B", { calls: [pendingCall], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).getByText("cancellation requested by A")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Request cancellation" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Refuse cancellation" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${call({}).callId}/cancellation/decision`, body: { accept: false, reason: "" } }]));
  });

  it("the requester is not offered the decision or the pledge while its request is pending", async () => {
    serve("A", { calls: [call({ state: "agreed", cancellationRequestedBy: "A", proposals: [{ proposalId: 0, state: "accepted", assets: [{ token: "tUST", qty: "100" }] }] })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).queryByRole("button", { name: "Accept cancellation" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Pledge accepted collateral" })).toBeNull();
  });

  it("the calling party replaces a cancelled call with a corrected amount (task-csa-call-replacement)", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [call({ state: "cancelled" })], balances: balances("0") });
    const row = await rowOf();
    const amount = within(row).getByLabelText("Replacement amount (USD)");
    await user.clear(amount);
    await user.type(amount, "1800000");
    await user.click(within(row).getByRole("button", { name: "Issue replacement call" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/calls", body: { replacesCallId: call({}).callId, amountUsd: 1800000, deadlineDays: 1 } }]));
  });

  it("a replaced call shows its replacement and offers no second one; the replacement names the call it replaces", async () => {
    serve("B", { calls: [call({ state: "cancelled", replacedBy: "0xbeef000000000000000000000000000000000000000000000000000000000001" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).getByText(/replaced by/)).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Issue replacement call" })).toBeNull();
  });

  it("a cancelled call shows the cancellation and no further action", async () => {
    serve("A", { calls: [call({ state: "cancelled" })], balances: balances("0") });
    const row = await rowOf();
    expect(within(row).getByText("cancelled on-chain ✓")).toBeInTheDocument();
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("flow-settlement-netting", () => {
  const BAL = [{ token: "tUSD", free: "1000000", pledged: "0" }];
  const DEFAULTS = { A: false, B: false };
  const candidates = (payer: LiveParty | null) => ({
    "/netting/candidates": {
      movements: [
        { id: "0xaaaa000000000000000000000000000000000000000000000000000000000001", type: "DeliveryAmount", payer: "A", receiver: "B", amountUsd: "100000" },
        { id: "0xbbbb000000000000000000000000000000000000000000000000000000000002", type: "ReturnAmount", payer: "B", receiver: "A", amountUsd: "30000" },
        { id: "0xcccc000000000000000000000000000000000000000000000000000000000003", type: "InterestAmount", payer: "B", receiver: "A", amountUsd: "412" },
      ],
      netUsd: "69588",
      payer,
    },
    "/nettings": [],
  });

  it("the party owing the net sees the movements and the net, and settles them by one transfer", async () => {
    serve("A", { calls: [], balances: BAL, defaults: DEFAULTS }, NO_SHORTFALL, candidates("A"));
    const card = await screen.findByTestId("settlement-netting");
    expect(within(card).getByText("VM delivery")).toBeInTheDocument();
    expect(within(card).getByText("VM return")).toBeInTheDocument();
    expect(within(card).getByText("Interest Amount")).toBeInTheDocument();
    expect(within(card).getByTestId("netting-net")).toHaveTextContent("Net: A pays USD 69,588 in tUSD");
    await userEvent.click(within(card).getByRole("button", { name: "Settle netted" }));
    await waitFor(() => expect(posts).toContainEqual({ path: "/nettings", body: {} }));
  });

  it("the party owed the net is not offered the settlement", async () => {
    serve("B", { calls: [], balances: BAL, defaults: DEFAULTS }, NO_SHORTFALL, candidates("A"));
    const card = await screen.findByTestId("settlement-netting");
    expect(within(card).queryByRole("button", { name: "Settle netted" })).toBeNull();
    expect(within(card).getByText("A owes the net and settles.")).toBeInTheDocument();
  });

  it("the secured party may hold an Interest Amount for netting", async () => {
    serve("B", { calls: [], balances: [{ token: "tUSD", free: "0", pledged: "500000" }], defaults: DEFAULTS });
    const card = await screen.findByTestId("interest");
    await userEvent.click(within(card).getByRole("checkbox", { name: /Hold for settlement netting/ }));
    await userEvent.click(within(card).getByRole("button", { name: /State interest/ }));
    await waitFor(() => expect(posts.find((p) => p.path === "/interest")?.body).toMatchObject({ holdForNetting: true }));
  });

  it("a call settled in a netting names it", async () => {
    serve("A", { calls: [call({ kind: "VM", state: "settled", nettedIn: "0xdddd00000000000000000000000000000000000000000000000000000000eeee" })], balances: BAL, defaults: DEFAULTS });
    expect(await screen.findByText(/settled in netting/)).toBeInTheDocument();
  });
});

describe("flow-allocation", () => {
  const rowOf = async (label = /IM · B → A/) => (await screen.findByText(label)).closest(".subcard") as HTMLElement;
  const ID = call({}).callId;
  const SUGGESTED = {
    callId: ID, covers: true, valueUsd: "2000038", agreedUsd: "2000000", ranking: ["tUST", "tMMF", "tUSD"],
    assets: [{ token: "tUST", qty: 15_000 }, { token: "tMMF", qty: 526_356 }],
  };

  it("the called party fills the basket from the suggestion and proposes it", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [call({ state: "agreed" })], balances: balances("0") }, NO_SHORTFALL, { [`POST /calls/${ID}/allocation`]: SUGGESTED });
    const row = await rowOf();
    await user.click(within(row).getByRole("button", { name: "Suggest allocation" }));
    expect(await within(row).findByText(/suggested: USD 2,000,038 after haircuts/)).toBeInTheDocument();
    expect(within(row).getByText(/basket: tUST 15,000 \+ tMMF 526,356/)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Propose collateral (2)" }));
    await waitFor(() =>
      expect(posts).toEqual([
        { path: `/calls/${ID}/allocation`, body: {} },
        { path: `/calls/${ID}/proposal`, body: { assets: SUGGESTED.assets } },
      ]),
    );
  });

  it("says so when the holdings do not cover the agreed amount, and leaves the basket empty", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [call({ state: "agreed" })], balances: balances("0") }, NO_SHORTFALL, {
      [`POST /calls/${ID}/allocation`]: { ...SUGGESTED, covers: false, assets: [], valueUsd: "0" },
    });
    const row = await rowOf();
    await user.click(within(row).getByRole("button", { name: "Suggest allocation" }));
    expect(await within(row).findByText("holdings do not cover the agreed amount")).toBeInTheDocument();
    expect(within(row).queryByText(/basket:/)).toBeNull();
  });

  it("is offered to the called party on an agreed VM call, and not on a return call or to the calling party", async () => {
    serve("A", { calls: [call({ kind: "VM", state: "agreed" })], balances: balances("0") });
    expect(within(await rowOf(/VM · B → A/)).getByRole("button", { name: "Suggest allocation" })).toBeInTheDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve("A", { calls: [call({ kind: "Return", from: "A", to: "B", state: "agreed" })], balances: balances("0") });
    expect(within(await rowOf(/Return · A → B/)).queryByRole("button", { name: "Suggest allocation" })).toBeNull();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve("B", { calls: [call({ state: "agreed" })], balances: balances("0") });
    expect(within(await rowOf()).queryByRole("button", { name: "Suggest allocation" })).toBeNull();
  });
});

describe("flow-reconciliation", () => {
  const RUN = {
    reconciliationId: "0x9999999999999999999999999999999999999999999999999999999999999999",
    firstSnapshotId: "0x01", secondSnapshotId: "0x02", resultHash: "0x03",
    firstParty: "BANK-A", secondParty: "BANK-B", reconciled: false, matchedTrades: 1,
    breaks: [
      { uti: "56323", type: "MissingFromSecond", terms: [], firstValuationUsd: "75000", secondValuationUsd: null, differenceUsd: null },
      { uti: "DRTY123456", type: "ValuationDiffers", terms: [], firstValuationUsd: "300000", secondValuationUsd: "-260000", differenceUsd: "40000" },
    ],
    firstExposureUsd: "1625000", secondExposureUsd: "-1510000", exposureDifferenceUsd: "115000", toleranceUsd: "10000",
    onChain: { state: "agreed", firstPartyResult: "0x03", secondPartyResult: "0x03" },
  };
  const card = async () => (await screen.findByRole("heading", { name: "Reconciliation" })).closest(".card") as HTMLElement;

  it("either party reconciles the trade portfolios and sees the breaks and the on-chain agreement", async () => {
    const user = userEvent.setup();
    serve("A", { calls: [], balances: balances("0") }, NO_SHORTFALL, { "POST /reconciliation/portfolio": RUN, "/reconciliation/portfolio": [RUN] });
    await user.click(within(await card()).getByRole("button", { name: "Reconcile portfolios → B" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/reconciliation/portfolio", body: {} }]));
    const c = await card();
    expect(await within(c).findByTestId("reconciliation-status")).toHaveTextContent("2 breaks");
    expect(within(c).getByTestId("reconciliation-onchain")).toHaveTextContent("both results agree on-chain ✓");
    expect(within(c).getByTestId("break-DRTY123456")).toHaveTextContent("valuations differ");
    expect(within(c).getByTestId("break-DRTY123456")).toHaveTextContent("USD 40,000");
    expect(within(c).getByTestId("break-56323")).toHaveTextContent("missing at the second party");
    expect(within(c).getByTestId("exposure-difference")).toHaveTextContent("USD 115,000");
  });

  it("reconciles the party's records with the ledger", async () => {
    const user = userEvent.setup();
    serve("B", { calls: [], balances: balances("0") }, NO_SHORTFALL, {
      "POST /reconciliation/ledger": { party: "BANK-B", counterparty: "BANK-A", reconciled: true, checkedFacts: 9, calls: 3, breaks: [], escrow: { record: "escrow BANK-A to BANK-B", recorded: { tUST: 1200 }, ledger: { tUST: 1200 } } },
    });
    await user.click(within(await card()).getByRole("button", { name: "Reconcile with ledger" }));
    expect(await within(await card()).findByTestId("ledger-reconciliation")).toHaveTextContent("records match the ledger ✓");
    expect(within(await card()).getByTestId("ledger-reconciliation")).toHaveTextContent("3 calls, 9 facts checked");
    expect(within(await card()).getByTestId("ledger-escrow")).toHaveTextContent("escrow (BANK-A to BANK-B): tUST 1,200");
  });

  it("the called party disputes an issued call citing the latest reconciliation, offered only when it has breaks", async () => {
    const user = userEvent.setup();
    const ID = call({}).callId;
    serve("A", { calls: [call({ state: "issued" })], balances: balances("0") }, NO_SHORTFALL, { "/reconciliation/portfolio": [RUN] });
    const row = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    await user.click(await within(row).findByRole("button", { name: "Dispute citing reconciliation" }));
    await waitFor(() => expect(posts).toEqual([{ path: `/calls/${ID}/response`, body: { response: "dispute", reconciliationId: RUN.reconciliationId } }]));
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    serve("A", { calls: [call({ state: "issued" })], balances: balances("0") }, NO_SHORTFALL, { "/reconciliation/portfolio": [{ ...RUN, reconciled: true, breaks: [] }] });
    const row2 = (await screen.findByText(/IM · B → A/)).closest(".subcard") as HTMLElement;
    await within(row2).findByRole("button", { name: "Dispute" });
    expect(within(row2).queryByRole("button", { name: "Dispute citing reconciliation" })).toBeNull();
  });
});

describe("task-live-read-latency", () => {
  it("merges a burst of step events into one more refresh, and the pledgor skips the revaluation panel", async () => {
    StubEventSource.listeners = [];
    serve("A", { calls: [], balances: balances("0") });
    await screen.findByRole("heading", { name: "Call for a return" });
    await vi.waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    const gets = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]).replace(/^https?:\/\/[^/]+\/api\/v1/, ""));
    await vi.waitFor(() => expect(gets().filter((g) => g === "/agreement").length).toBe(1)); // the first refresh is done
    const before = gets().length;
    for (let i = 0; i < 5; i++) for (const fn of StubEventSource.listeners) fn();
    await vi.waitFor(() => expect(gets().filter((g) => g === "/agreement").length).toBe(3));
    await new Promise((r) => setTimeout(r, 50));
    const burst = gets().slice(before);
    expect(burst.filter((g) => g === "/state").length).toBe(2); // one pass in flight plus one merged pass, not five
    expect(burst).not.toContain("/revaluation");
  });
});
