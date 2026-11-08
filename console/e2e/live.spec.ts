import { expect, test } from "@playwright/test";

// Live end-to-end tests for every CALM flow, driven through the party consoles (#/live/A, #/live/B) and the market
// operator console (#/live/operator) against the running stack: collateral services (8001/8002), oracle service
// (8100) -> ledger gateways (8201/8202/8200) -> Besu. Unlike the mock scenario specs, these need the backend stack up
// (scripts/live-e2e.sh up). A unique call amount per run identifies this cycle's call among any left on the
// persistent chain by earlier runs.
//
// The stack is not started by Playwright's webServer, so these tests are skipped when the collateral service is
// unreachable (console.yml, which runs only the mock scenario specs). e2e-live-stack.yml brings the stack up and runs
// them through scripts/live-e2e.sh check with E2E_REQUIRE_STACK=1 (wp-adr-ci-runs-live-specs).
const PRICE_TUST = 98.4;
const HAIRCUT = 0.98;

// Live flow timing. Each lifecycle step is an on-chain write (a 2 s QBFT block) followed by SSE propagation
// (Besu ws -> gateway -> service -> console), and a full flow chains about six of them. The Playwright config
// default (timeout: 30_000) is below that total, so the live specs set their own per-test and per-step budgets.
const TEST_TIMEOUT = 180_000; // whole live flow
const STEP_TIMEOUT = 30_000; // one step's UI window

// The service state at /api/v1/state is the authoritative settlement record (folded from on-chain call state via the
// gateway). Wait on it before the console "settled on-chain ✓" assertion, so SSE propagation lag to an already-open
// page does not fail the test after the backend has settled. Checks both parties' services (8001 pledgor, 8002
// secured party); the call is matched by kind and amount, which identify this run's call on the persistent chain.
async function waitForSettledOnChain(kind: "IM" | "VM" | "Return", amountUsd: number) {
  for (const port of [8001, 8002]) {
    await expect
      .poll(
        async () => {
          const res = await fetch(`http://localhost:${port}/api/v1/state`).catch(() => null);
          if (!res || !res.ok) return null;
          const body = (await res.json()) as { calls?: Array<{ kind: string; amountUsd: string; state: string }> };
          const call = (body.calls ?? []).find((c) => c.kind === kind && c.amountUsd === String(amountUsd));
          return call?.state ?? null;
        },
        { timeout: 120_000, intervals: [1_000, 1_000, 2_000] },
      )
      .toBe("settled");
  }
}

// --- helpers for the flow-return and flow-default-enforcement specs ---

const SERVICE = { A: "http://localhost:8001/api/v1", B: "http://localhost:8002/api/v1" } as const;
const GATEWAY = { A: "http://localhost:8201/ledger/v1", B: "http://localhost:8202/ledger/v1" } as const;
const ZERO_HASH = "0x" + "0".repeat(64);
// tUST value after haircut per unit in USD (98.4 at a 2% haircut), the on-chain check in CollateralControl.
const TUST_VALUE = PRICE_TUST * HAIRCUT;

async function call<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

// The console shows a call by its shortened id; this locates exactly one call's row.
const shortId = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

/**
 * Setup for the return and enforcement specs: an IM call settled into escrow, driven through the same service API the
 * consoles call (the UI path of this flow is covered by the flow-im-margin-call-pledge spec). Returns the callId.
 */
async function pledgeThroughServices(amountUsd: number, qty: number, token = "tUST"): Promise<string> {
  const { callId } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await call(`${SERVICE.A}/calls/${callId}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token, qty }] });
  await call(`${SERVICE.B}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
  await call(`${SERVICE.A}/calls/${callId}/pledge`, "POST", { proposalId });
  return callId;
}

interface Parties {
  a: string;
  b: string;
  tokens: Record<string, string>; // symbol -> token address
}

async function parties(): Promise<Parties> {
  const ctx = await call<{ address: string; counterpartyAddress: string; tokens: { symbol: string; address: string }[] }>(`${SERVICE.A}/context`);
  return { a: ctx.address, b: ctx.counterpartyAddress, tokens: Object.fromEntries(ctx.tokens.map((t) => [t.symbol, t.address])) };
}

// On-chain reads through a party's own gateway (relationship harness-to-gateway). Amounts are decimal strings.
const balanceOf = async (gw: string, token: string, owner: string) => BigInt(await call<string>(`${gw}/balance?token=${token}&owner=${owner}`));
const pledgedOf = async (gw: string, token: string, p: Parties) =>
  BigInt(await call<string>(`${gw}/pledged?token=${token}&pledgor=${p.a}&securedParty=${p.b}`));

// The CDM MarginCallState each party folds from the chain and the payload store; both must converge on the same hash.
// "converged" is per party: every step its own node shows has been folded. A node a block behind can report converged
// on fewer steps, so poll until both parties fold the same number of steps to the same hash.
async function expectConvergedCdmState(callId: string) {
  // G25: each folded step also has a ledger anchor built from the chain events; both parties build the same anchors
  // (anchorHash) and every step's anchor is Complete (nw-ledger-anchor-redesign).
  type Fold = {
    converged: boolean; totalSteps: number; stateHash: string;
    anchored?: boolean; anchorHash?: string; anchors?: { identifier: string; status: string }[]; anchorError?: string;
  };
  let a: Fold | undefined, b: Fold | undefined;
  await expect
    .poll(async () => {
      a = await call<Fold>(`${SERVICE.A}/calls/${callId}/cdm-state`);
      b = await call<Fold>(`${SERVICE.B}/calls/${callId}/cdm-state`);
      return a.converged && b.converged && a.totalSteps === b.totalSteps && a.stateHash === b.stateHash
        && !!a.anchored && !!b.anchored && a.anchorHash === b.anchorHash;
    }, { timeout: 60_000 })
    .toBe(true);
  expect(a!.stateHash).toMatch(/^0x[0-9a-f]{64}$/i);
  expect(a!.anchorError).toBeUndefined();
  expect(a!.anchors!.length).toBe(a!.totalSteps);
  expect(a!.anchors!.every((s) => s.status === "Complete")).toBe(true);
}

let stackUp = false;
test.beforeAll(async () => {
  stackUp = await fetch("http://localhost:8001/api/v1/context")
    .then((r) => r.ok)
    .catch(() => false);
});
test.beforeEach(() => {
  // In CI (e2e-live-stack.yml) the stack is brought up before this runs, so a down stack is a bring-up failure, not
  // a reason to skip. E2E_REQUIRE_STACK turns the skip into a hard failure so the job cannot pass silently without
  // running the live flow (task-ci-live-e2e-stack).
  if (!stackUp && process.env.E2E_REQUIRE_STACK) {
    throw new Error(
      "E2E_REQUIRE_STACK is set but the collateral service is unreachable at http://localhost:8001 — the backend stack did not come up",
    );
  }
  test.skip(!stackUp, "backend stack not running — start it with orchestrate.mjs to run the live e2e flows");
});

test("flow-im-margin-call-pledge: issue -> agree -> propose -> accept -> pledge, settled on-chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const amountUsd = 1_000_000 + (Date.now() % 9000) * 1_000; // unique-ish per run (9000 buckets, multiple of 1k) so the label does not match a leftover call on the persistent chain; above the MTA
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const qty = Math.ceil(amountUsd / (PRICE_TUST * HAIRCUT) / 1000) * 1000 + 1000; // cover agreed amount after haircut

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Secured party (BANK-B) issues the IM call.
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue IM call/ }).click();

  // 2. Pledgor (BANK-A) agrees in full.
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Agree in full" }).click();

  // 3. Pledgor proposes tUST collateral.
  await expect(rowA.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("spinbutton").fill(String(qty));
  await rowA.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });

  // 4. Secured party accepts the proposal.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();

  // 5. Pledgor pledges the accepted collateral.
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA2.getByRole("button", { name: "Pledge accepted collateral" }).click();

  // The call is now settled on-chain. Wait on each party's service state before asserting the console SSE update.
  await waitForSettledOnChain("IM", amountUsd);
  await expect(rowA2.getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/B");
  await expect(page.locator(".subcard", { hasText: label }).getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

test("flow-vm-margin-call-transfer: issue VM -> agree -> propose -> accept -> transfer title, settled on-chain", async ({ page }) => {
  // tUSD is priced 1.00 with no haircut, so whole units map one-to-one to USD; VM settlement passes title directly.
  test.setTimeout(TEST_TIMEOUT);
  const amountUsd = 1_000_000 + (Date.now() % 9000) * 1_000; // unique-ish per run (9000 buckets, multiple of 1k); see the IM flow
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const qty = amountUsd; // tUSD at 1.00

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Secured party (BANK-B) issues a VM call (title transfer).
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await issueCard.getByRole("combobox").selectOption("VM");
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue VM call/ }).click();

  // 2. Pledgor (BANK-A) agrees and proposes tUSD.
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Agree in full" }).click();
  await expect(rowA.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("combobox").selectOption("tUSD");
  await rowA.getByRole("spinbutton").fill(String(qty));
  await rowA.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });

  // 3. Secured party accepts.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();

  // 4. Pledgor transfers title (VM settlement, no escrow).
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Transfer title" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA2.getByRole("button", { name: "Transfer title" }).click();

  // The call is now settled on-chain. Wait on each party's service state before asserting the console SSE update.
  await waitForSettledOnChain("VM", amountUsd);
  await expect(rowA2.getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/B");
  await expect(page.locator(".subcard", { hasText: label }).getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

test("flow-return: pledgor calls a return -> secured party agrees -> releases escrow, settled on-chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens["tUST"];
  // Return amount below the IM call range of the other specs (all >= USD 1,000,000), so the label does not collide, and
  // small, because each run leaves part of the pledged tUST in escrow on the persistent chain.
  const returnUsd = 50_000 + (Date.now() % 9000) * 10;
  const label = `USD ${returnUsd.toLocaleString("en-US")}`;
  const releaseQty = Math.floor(returnUsd / TUST_VALUE) - 1; // value after haircut must not exceed the agreed return
  const pledgeUsd = 2 * returnUsd;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: initial margin in escrow from A (pledgor) with B (secured party).
  await pledgeThroughServices(pledgeUsd, pledgeQty);
  const freeBefore = await balanceOf(GATEWAY.A, tUST, p.a);
  const pledgedBefore = await pledgedOf(GATEWAY.B, tUST, p);
  expect(pledgedBefore >= BigInt(releaseQty)).toBe(true);

  // 1-5. Pledgor (BANK-A) calls for the return in its console; the call is recorded on-chain with the pledgor key.
  await page.goto("/#/live/A");
  const returnCard = page.locator(".card", { hasText: "Call for a return" });
  await returnCard.getByRole("spinbutton").fill(String(returnUsd));
  await returnCard.getByRole("button", { name: "Call return → B" }).click();
  await expect(page.locator(".subcard", { hasText: label })).toBeVisible({ timeout: STEP_TIMEOUT });
  const stateA = await call<{ calls: { callId: string; kind: string; amountUsd: string; from: string; to: string }[] }>(`${SERVICE.A}/state`);
  const returnCall = stateA.calls.find((c) => c.kind === "Return" && c.amountUsd === String(returnUsd) && c.from === "A");
  expect(returnCall, "the return call is on-chain").toBeTruthy();
  const callId = returnCall!.callId;
  expect(returnCall!.to).toBe("B");

  // 6-8. Secured party (BANK-B) sees the return call and agrees it in full.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: shortId(callId) });
  await expect(rowB.getByRole("button", { name: "Agree in full" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Agree in full" }).click();

  // 9-13. Secured party releases the escrowed tUST; the control contract checks the agreed amount and transfers it back.
  await expect(rowB.getByRole("button", { name: "Release escrow" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("combobox").selectOption("tUST");
  await rowB.getByRole("spinbutton").fill(String(releaseQty));
  await rowB.getByRole("button", { name: "Release escrow" }).click();

  // 14. Both services see the call settled; both consoles show it.
  await waitForSettledOnChain("Return", returnUsd);
  await expect(rowB.getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await expect(page.locator(".subcard", { hasText: shortId(callId) }).getByText("settled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // On-chain state through each party's gateway: the return call is settled with its settle cdmHash anchored, and the
  // released tUST moved from escrow back to the pledgor.
  const onChain = await call<{ kind: number; state: number; agreed: string; settleCdmHash: string }>(`${GATEWAY.A}/calls/${callId}`);
  expect(onChain.kind).toBe(2); // Return
  expect(onChain.state).toBe(5); // Settled
  expect(BigInt(onChain.agreed)).toBe(BigInt(returnUsd) * 100_000_000n);
  expect(onChain.settleCdmHash).not.toBe(ZERO_HASH);
  expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(freeBefore + BigInt(releaseQty));
  expect(await pledgedOf(GATEWAY.B, tUST, p)).toBe(pledgedBefore - BigInt(releaseQty));

  // Each service folded the issue, respond and settle steps into the same MarginCallState.
  await expectConvergedCdmState(callId);

  expect(errors).toEqual([]);
});

test("flow-default-enforcement: secured party declares default -> oracle feed -> enforce, escrow seized on-chain", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  // Small, because enforcement moves the pledged tUST to the secured party for good on the persistent chain. The row is
  // found by callId, so the amount needs no unique label.
  const pledgeUsd = 100_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: initial margin in escrow from A (pledgor) with B (secured party).
  const callId = await pledgeThroughServices(pledgeUsd, pledgeQty);
  await waitForSettledOnChain("IM", pledgeUsd);

  // Enforcement seizes everything A has in escrow with B, including collateral left by earlier runs.
  const symbols = Object.keys(p.tokens);
  const pledgedBefore: Record<string, bigint> = {};
  const securedFreeBefore: Record<string, bigint> = {};
  for (const sym of symbols) {
    pledgedBefore[sym] = await pledgedOf(GATEWAY.B, p.tokens[sym], p);
    securedFreeBefore[sym] = await balanceOf(GATEWAY.B, p.tokens[sym], p.b);
  }
  expect(pledgedBefore["tUST"] >= BigInt(pledgeQty)).toBe(true);

  // 1-7. Secured party (BANK-B) declares the default and enforces in its console: the service forwards the notice to
  // the oracle service, which publishes it through the operator's gateway; then B's gateway submits enforce().
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: shortId(callId) });
  await expect(rowB.getByRole("button", { name: "Declare default & enforce" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Declare default & enforce" }).click();

  // 8. Each service records the enforcement from its gateway's event stream; the pledgor's service sees the default.
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => (await call<{ calls: { callId: string; enforced?: boolean }[] }>(`${svc}/state`)).calls.find((c) => c.callId === callId)?.enforced, {
        timeout: 60_000,
      })
      .toBe(true);
  }
  await expect(rowB.getByText("enforced ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(page.getByRole("status")).toContainText("Counterparty A in default on the oracle feed", { timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await expect(page.locator(".subcard", { hasText: shortId(callId) }).getByText("enforced ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(page.getByRole("status")).toContainText("This party (A) in default on the oracle feed", { timeout: STEP_TIMEOUT });

  // On-chain state through each party's gateway: A is in default on the oracle feed, nothing is left in escrow, and the
  // secured party holds what was pledged.
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    expect((await call<{ inDefault: boolean }>(`${gw}/defaults/${p.a}`)).inDefault).toBe(true);
  }
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.b}`)).inDefault).toBe(false);
  for (const sym of symbols) {
    expect(await pledgedOf(GATEWAY.A, p.tokens[sym], p)).toBe(0n);
    expect(await balanceOf(GATEWAY.B, p.tokens[sym], p.b)).toBe(securedFreeBefore[sym] + pledgedBefore[sym]);
  }

  expect(errors).toEqual([]);
});

// --- flow-oracle-update ---
// The oracle service (8100) holds mock market data and publishes prices to the oracle feed through the market
// operator's gateway (8200), the only one holding the publisher key. Each party reads the feed from its own node.
const ORACLE = "http://localhost:8100/oracle/v1";
const GATEWAY_MKT = "http://localhost:8200/ledger/v1";
// tMMF is used by no other live spec, so changing its price cannot move another spec's valuation; the test restores
// the original price at the end either way.
const ORACLE_TOKEN = "tMMF";

test("flow-oracle-update: operator edits a price -> oracle publishes via the mkt gateway -> both parties read it on-chain", async () => {
  test.setTimeout(TEST_TIMEOUT);
  type MarketToken = { symbol: string; token: string; price: string | null; priceUsd: string | null; rating: string | null };
  const market = await call<{ priceScale: string; tokens: MarketToken[] }>(`${ORACLE}/market-data`);
  const entry = market.tokens.find((t) => t.symbol === ORACLE_TOKEN);
  expect(entry, `${ORACLE_TOKEN} in the oracle's market data`).toBeTruthy();
  const token = entry!.token;
  const onChain = async (gw: string) => (await call<{ price: string | null }>(`${gw}/prices/${token}`)).price;

  // The mock data starts from the feed: the oracle's price and every party's on-chain read agree.
  const original = await onChain(GATEWAY.A);
  expect(original).not.toBeNull();
  expect(await onChain(GATEWAY.B)).toBe(original);
  expect(entry!.price).toBe(original);

  // A new price that differs from the current one on every run (0.95 or 0.96 USD).
  const scale = BigInt(market.priceScale);
  const newUsd = BigInt(original!) === (95n * scale) / 100n ? "0.96" : "0.95";
  const newScaled = ((BigInt(newUsd.replace(".", "")) * scale) / 100n).toString();

  try {
    // 1-3. The operator's edit is published through the mkt gateway with the publisher key and mined.
    const edit = await call<{ price: string; tx: { txHash: string; block: string } }>(`${ORACLE}/market-data/${ORACLE_TOKEN}`, "PUT", { price: newUsd });
    expect(edit.price).toBe(newScaled);
    expect(edit.tx.txHash).toMatch(/^0x[0-9a-f]{64}$/i);

    // Every party's gateway reads the new price from its own Besu node.
    for (const gw of [GATEWAY.A, GATEWAY.B, GATEWAY_MKT]) {
      await expect.poll(() => onChain(gw), { timeout: 30_000 }).toBe(newScaled);
    }

    // A party's gateway does not hold the publisher key, so it refuses a feed write.
    const refused = await fetch(`${GATEWAY.A}/oracle/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, price: original }),
    });
    expect(refused.ok).toBe(false);
    expect(await onChain(GATEWAY.A)).toBe(newScaled);

    // Republishing on request writes the oracle's current price again.
    const republished = await call<{ published: { symbol: string; price: string }[] }>(`${ORACLE}/prices/publish`, "POST", { symbol: ORACLE_TOKEN });
    expect(republished.published).toEqual([expect.objectContaining({ symbol: ORACLE_TOKEN, price: newScaled })]);
  } finally {
    const scaledToUsd = (s: string) => (Number(BigInt(s)) / Number(scale)).toString();
    await call(`${ORACLE}/market-data/${ORACLE_TOKEN}`, "PUT", { price: scaledToUsd(original!) });
  }
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    await expect.poll(() => onChain(gw), { timeout: 30_000 }).toBe(original);
  }
});

// --- flow-revaluation-top-up ---
// The operator lowers the tUST price in the operator console (#/live/operator); the oracle publishes it to the feed. The
// secured party's console revalues the pledged IM at the feed prices after haircuts and offers a top-up IM call for the
// shortfall (minimum transfer amount USD 500,000, rounded up to USD 10,000). The top-up is settled like any IM call and
// does not add to the requirement (wp-adr-revaluation-outstanding-im-from-calls). The tUST price is restored at the
// end because the other specs value tUST at 98.4.
type Revaluation = { requiredUsd: string; valueUsd: string; shortfallUsd: string; topUpUsd: string; topUpCalls: number };

test("flow-revaluation-top-up: operator lowers a price -> secured party revalues -> top-up IM call settled, shortfall closed", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const usd = (n: number | string) => `USD ${Number(n).toLocaleString("en-US")}`;
  const lowered = Math.round(PRICE_TUST * 0.9 * 100) / 100; // 88.56: a 10% drop
  const imUsd = 8_000_000 + (Date.now() % 9000) * 10; // after the drop the shortfall is about USD 0.8m, above the MTA
  const imQty = Math.ceil(imUsd / TUST_VALUE) + 100;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const before = await call<Revaluation>(`${SERVICE.B}/revaluation`);
  await pledgeThroughServices(imUsd, imQty);
  await waitForSettledOnChain("IM", imUsd);
  await expect.poll(async () => Number((await call<Revaluation>(`${SERVICE.B}/revaluation`)).requiredUsd), { timeout: 30_000 })
    .toBe(Number(before.requiredUsd) + imUsd);

  try {
    // 1-4. The market operator lowers the tUST price in the operator console; the oracle publishes it to the feed.
    await page.goto("/#/live/operator");
    await page.getByLabel("New price tUST").fill(String(lowered));
    await page.getByRole("button", { name: "Publish tUST" }).click();
    await expect(page.getByRole("status")).toContainText(`tUST published at USD ${lowered}`, { timeout: STEP_TIMEOUT });

    // 5. The secured party's service revalues at the new feed price and its console shows the shortfall and top-up.
    let reval = before;
    await expect
      .poll(async () => Number((reval = await call<Revaluation>(`${SERVICE.B}/revaluation`)).topUpUsd), { timeout: 30_000 })
      .toBeGreaterThan(0);
    const topUpUsd = Number(reval.topUpUsd);
    expect(topUpUsd % 10_000).toBe(0);
    expect(topUpUsd).toBeGreaterThanOrEqual(Number(reval.shortfallUsd));

    await page.goto("/#/live/B");
    const card = page.getByTestId("revaluation");
    await expect(card.getByTestId("top-up")).toHaveText(usd(topUpUsd), { timeout: STEP_TIMEOUT });

    // 6. The secured party issues the top-up IM call from the revaluation panel.
    await card.getByRole("button", { name: "Issue top-up IM call → A" }).click();
    let topUpCall: string | undefined;
    await expect
      .poll(async () => {
        const { calls } = await call<{ calls: { callId: string; kind: string; amountUsd: string; state: string }[] }>(`${SERVICE.A}/state`);
        topUpCall = calls.find((c) => c.kind === "IM" && c.amountUsd === String(topUpUsd) && c.state === "issued")?.callId;
        return topUpCall ?? null;
      }, { timeout: 30_000 })
      .not.toBeNull();

    // 7. The top-up settles like an IM call, with tUST valued at the lowered feed price (the on-chain pledge check).
    const topUpQty = Math.ceil(topUpUsd / (lowered * HAIRCUT)) + 100;
    await call(`${SERVICE.A}/calls/${topUpCall}/response`, "POST", { response: "full" });
    const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${topUpCall}/proposal`, "POST", { assets: [{ token: "tUST", qty: topUpQty }] });
    await call(`${SERVICE.B}/calls/${topUpCall}/decision`, "POST", { proposalId, accept: true });
    await call(`${SERVICE.A}/calls/${topUpCall}/pledge`, "POST", { proposalId });
    await waitForSettledOnChain("IM", topUpUsd);

    // The shortfall is closed and the requirement is unchanged: the top-up restored value, it was not new IM.
    await expect.poll(async () => (reval = await call<Revaluation>(`${SERVICE.B}/revaluation`)).shortfallUsd, { timeout: 30_000 }).toBe("0");
    expect(Number(reval.requiredUsd)).toBe(Number(before.requiredUsd) + imUsd);
    expect(reval.topUpCalls).toBe(before.topUpCalls + 1);
    await expect(card.getByTestId("shortfall")).toHaveText("USD 0", { timeout: STEP_TIMEOUT });
    await expect(card.getByRole("button", { name: /Issue top-up/ })).toHaveCount(0);
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
  }
  const p = await parties();
  for (const gw of [GATEWAY.A, GATEWAY.B]) {
    await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${p.tokens["tUST"]}`)).price, { timeout: 30_000 })
      .toBe(String(BigInt(Math.round(PRICE_TUST * 100)) * 1_000_000n));
  }

  expect(errors).toEqual([]);
});

// --- flow-close-out-netting ---
// After the pledgor's default the secured party closes out (ISDA 2002 MA Section 6(e), cdm-ext CloseOutNetting, G15):
// its service builds the CDM CloseOutStatement from the Close-out Amount entered in the console, and the control
// contract applies the pledged collateral to the Early Termination Amount and returns the surplus to the pledgor. Both
// services fetch the statement by its on-chain hash and check it. Like enforcement, this empties A's escrow with B.
type CloseOut = {
  closeOutId: string; owedUsd: string; appliedUsd: string; cdmHash: string; verified?: boolean; error?: string;
  closeOutAmountUsd?: string; earlyTerminationAmountUsd?: string; collateralHeldUsd?: string; collateralAppliedUsd?: string; amountPayableUsd?: string;
};

test("flow-close-out-netting: secured party closes out -> collateral applied to the Early Termination Amount, surplus returned", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const pledgeUsd = 200_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;
  const closeOutUsd = Math.floor(pledgeUsd / 2); // below the collateral held, so a surplus goes back to A

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: initial margin in escrow from A (pledgor) with B (secured party).
  await pledgeThroughServices(pledgeUsd, pledgeQty);
  await waitForSettledOnChain("IM", pledgeUsd);
  const symbols = Object.keys(p.tokens);
  const pledgedBefore: Record<string, bigint> = {};
  const aFreeBefore: Record<string, bigint> = {};
  const bFreeBefore: Record<string, bigint> = {};
  for (const sym of symbols) {
    pledgedBefore[sym] = await pledgedOf(GATEWAY.B, p.tokens[sym], p);
    aFreeBefore[sym] = await balanceOf(GATEWAY.A, p.tokens[sym], p.a);
    bFreeBefore[sym] = await balanceOf(GATEWAY.B, p.tokens[sym], p.b);
  }
  const known = new Set((await call<CloseOut[]>(`${SERVICE.B}/close-outs`)).map((o) => o.closeOutId));

  // 1-7. Secured party (BANK-B) enters the Close-out Amount and closes out in its console.
  await page.goto("/#/live/B");
  const card = page.getByTestId("close-out");
  await card.getByLabel("Close-out Amount (USD)").fill(String(closeOutUsd));
  await card.getByRole("button", { name: "Declare default & close out A" }).click();

  // 8. Both services list the close-out with the same checked statement.
  let mine: CloseOut | undefined;
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => {
        mine = (await call<CloseOut[]>(`${svc}/close-outs`)).find((o) => !known.has(o.closeOutId));
        return mine?.verified ?? null;
      }, { timeout: 60_000 })
      .toBe(true);
  }
  const fromB = (await call<CloseOut[]>(`${SERVICE.B}/close-outs`)).find((o) => o.closeOutId === mine!.closeOutId)!;
  expect(mine!.cdmHash).toBe(fromB.cdmHash);
  expect(mine!.closeOutAmountUsd).toBe(String(closeOutUsd));
  expect(mine!.earlyTerminationAmountUsd).toBe(String(closeOutUsd));
  expect(mine!.collateralAppliedUsd).toBe(String(closeOutUsd)); // the collateral held exceeds the amount owed
  const held = Number(mine!.collateralHeldUsd);
  expect(held).toBeGreaterThanOrEqual(Math.floor(pledgeQty * TUST_VALUE) - 1);
  expect(Number(mine!.amountPayableUsd)).toBe(closeOutUsd - held); // negative: owed back to A
  // On-chain the contract applied whole units: at least the amount owed, less than one more unit of collateral.
  expect(mine!.owedUsd).toBe(String(closeOutUsd));
  expect(Number(mine!.appliedUsd)).toBeGreaterThanOrEqual(closeOutUsd);
  expect(Number(mine!.appliedUsd) - closeOutUsd).toBeLessThan(PRICE_TUST);

  // On-chain state: A is in default, nothing is left in escrow, and each pledged unit went to B (applied) or back to A.
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.B}/defaults/${p.a}`)).inDefault).toBe(true);
  for (const sym of symbols) {
    expect(await pledgedOf(GATEWAY.A, p.tokens[sym], p)).toBe(0n);
    const toB = (await balanceOf(GATEWAY.B, p.tokens[sym], p.b)) - bFreeBefore[sym];
    const toA = (await balanceOf(GATEWAY.A, p.tokens[sym], p.a)) - aFreeBefore[sym];
    expect(toB + toA).toBe(pledgedBefore[sym]);
  }

  // Both consoles show the verified statement.
  const row = page.getByTestId(`close-out-${mine!.closeOutId}`);
  await expect(row.getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/A");
  await expect(page.getByTestId(`close-out-${mine!.closeOutId}`).getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

// --- flow-substitution ---
// The pledgor asks to substitute part of its pledged tUST with tUSD (ISDA CSA Paragraph 4(d), cdm-ext
// Create_CollateralSubstitution, G16); the secured party consents (the agreement elects consent, Paragraph 13 (f)(ii));
// the pledgor settles and the control contract moves the substitute into escrow and the tUST back in one transaction.
// Each service folds the three CDM steps with the same portfolio and reaches the same state.
type Substitution = {
  substitutionId: string; state: string;
  cdm: { status: string; qualifiers?: string[]; stateHash?: string; converged: boolean; totalSteps: number; error?: string };
};

test("flow-substitution: pledgor requests -> secured party consents -> pledgor settles, substitute in escrow and CDM folded", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens["tUST"];
  const tUSD = p.tokens["tUSD"];
  const pledgeUsd = 100_000 + (Date.now() % 9000) * 10;
  const pledgeQty = Math.ceil(pledgeUsd / TUST_VALUE) + 100;
  const originalQty = 500; // tUST back to A
  const substituteQty = Math.ceil(originalQty * TUST_VALUE) + 10; // tUSD at 1.00, no haircut: worth more than the tUST

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await pledgeThroughServices(pledgeUsd, pledgeQty);
  await waitForSettledOnChain("IM", pledgeUsd);
  const pledgedUstBefore = await pledgedOf(GATEWAY.A, tUST, p);
  const pledgedUsdBefore = await pledgedOf(GATEWAY.A, tUSD, p);
  const freeUstBefore = await balanceOf(GATEWAY.A, tUST, p.a);
  const freeUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
  const known = new Set((await call<Substitution[]>(`${SERVICE.A}/substitutions`)).map((s) => s.substitutionId));

  // 1-4. Pledgor (BANK-A) requests the substitution in its console.
  await page.goto("/#/live/A");
  const req = page.getByTestId("substitution-request");
  await req.getByLabel("Original token").selectOption("tUST");
  await req.getByLabel("Original quantity").fill(String(originalQty));
  await req.getByLabel("Substitute token").selectOption("tUSD");
  await req.getByLabel("Substitute quantity").fill(String(substituteQty));
  await req.getByRole("button", { name: "Request substitution → B" }).click();
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await call<Substitution[]>(`${SERVICE.A}/substitutions`)).find((s) => !known.has(s.substitutionId))?.substitutionId) ?? null, { timeout: 30_000 })
    .not.toBeNull();

  // 5-8. Secured party (BANK-B) consents.
  await page.goto("/#/live/B");
  const rowB = page.getByTestId(`substitution-${id}`);
  await expect(rowB.getByRole("button", { name: "Consent" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Consent" }).click();

  // 9-12. Pledgor settles: the substitute goes into escrow and the tUST comes back.
  await page.goto("/#/live/A");
  const rowA = page.getByTestId(`substitution-${id}`);
  await expect(rowA.getByRole("button", { name: "Settle substitution" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Settle substitution" }).click();
  await expect(rowA.getByText("substituted on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // 13. Both services fold the request, consent and settlement to the same CDM state.
  let a: Substitution | undefined, b: Substitution | undefined;
  await expect
    .poll(async () => {
      a = (await call<Substitution[]>(`${SERVICE.A}/substitutions`)).find((s) => s.substitutionId === id);
      b = (await call<Substitution[]>(`${SERVICE.B}/substitutions`)).find((s) => s.substitutionId === id);
      return !!a?.cdm.converged && !!b?.cdm.converged && a.cdm.totalSteps === 3 && a.cdm.stateHash === b.cdm.stateHash;
    }, { timeout: 60_000 })
    .toBe(true);
  expect(a!.state).toBe("settled");
  expect(a!.cdm.error).toBeUndefined();
  expect(a!.cdm.status.toLowerCase()).toBe("settled");
  expect(a!.cdm.qualifiers).toEqual(["SubstitutionRequested", "SubstitutionConsented", "CollateralSubstituted"]);
  expect(a!.cdm.stateHash).toMatch(/^0x[0-9a-f]{64}$/i);

  // On-chain state through each party's gateway.
  expect(await pledgedOf(GATEWAY.B, tUST, p)).toBe(pledgedUstBefore - BigInt(originalQty));
  expect(await pledgedOf(GATEWAY.B, tUSD, p)).toBe(pledgedUsdBefore + BigInt(substituteQty));
  expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(freeUstBefore + BigInt(originalQty));
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(freeUsdBefore - BigInt(substituteQty));

  await page.goto("/#/live/B");
  await expect(page.getByTestId(`substitution-${id}`).getByText("substituted on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

// --- flow-interest-on-cash ---
// The secured party states the interest it owes on the pledgor's cash collateral for one Interest Period (cdm-ext
// Create_CollateralInterestStatement, G17): every day of the period has the tUSD now in escrow and the one observed rate
// entered in the console (interim reduction, task-sme-interest-daily-balances). The control contract pays a positive
// amount from B to A in the same transaction; both services fetch the statement by its on-chain hash and recompute it.
type Interest = {
  interestId: string; amountUsd: string; state: string; cdmHash: string; verified?: boolean; error?: string;
  days?: number; balanceUsd?: string; ratePct?: string; interestAmountUsd?: string; transferAmountUsd?: string;
};

test("flow-interest-on-cash: secured party states interest on cash collateral -> paid to the pledgor on-chain, statement verified", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUSD = p.tokens["tUSD"];
  const cashUsd = 100_000 + (Date.now() % 9000) * 10;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: cash initial margin (tUSD, no haircut) in escrow from A (pledgor) with B (secured party).
  await pledgeThroughServices(cashUsd, cashUsd, "tUSD");
  await waitForSettledOnChain("IM", cashUsd);
  const cash = Number(await pledgedOf(GATEWAY.B, tUSD, p)); // all tUSD A has in escrow with B, earlier runs included
  const expected = Math.round((cash * 0.043 * 30) / 360); // 4.30%, 30 days, ACT/360, whole USD
  const aFreeBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
  const bFreeBefore = await balanceOf(GATEWAY.B, tUSD, p.b);
  const known = new Set((await call<Interest[]>(`${SERVICE.B}/interest`)).map((i) => i.interestId));

  // 1-7. Secured party (BANK-B) enters the period and the observed rate and states the interest in its console.
  await page.goto("/#/live/B");
  const card = page.getByTestId("interest");
  await card.getByLabel("Period start").fill("2026-11-01");
  await card.getByLabel("Period end").fill("2026-12-01");
  await card.getByLabel("Observed rate (%)").fill("4.3");
  await expect(card.getByRole("button", { name: "State interest → A" })).toBeEnabled({ timeout: STEP_TIMEOUT });
  await card.getByRole("button", { name: "State interest → A" }).click();

  // 8-9. Both services list the statement, paid, with the same checked document.
  let mine: Interest | undefined;
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => {
        mine = (await call<Interest[]>(`${svc}/interest`)).find((i) => !known.has(i.interestId));
        return mine?.verified && mine.state === "settled" ? true : (mine?.error ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
  }
  const fromB = (await call<Interest[]>(`${SERVICE.B}/interest`)).find((i) => i.interestId === mine!.interestId)!;
  expect(mine!.cdmHash).toBe(fromB.cdmHash);
  expect(mine!.days).toBe(30);
  expect(mine!.balanceUsd).toBe(String(cash));
  expect(mine!.ratePct).toBe("4.3");
  expect(mine!.interestAmountUsd).toBe(String(expected));
  expect(mine!.amountUsd).toBe(String(expected));

  // On-chain: the Interest Amount moved from B to A; the cash collateral in escrow is unchanged.
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aFreeBefore + BigInt(expected));
  expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bFreeBefore - BigInt(expected));
  expect(Number(await pledgedOf(GATEWAY.A, tUSD, p))).toBe(cash);

  // Both consoles show the statement as paid and verified.
  for (const who of ["B", "A"] as const) {
    await page.goto(`/#/live/${who}`);
    const row = page.getByTestId(`interest-${mine!.interestId}`);
    await expect(row.getByText("paid on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(row.getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  }
  expect(errors).toEqual([]);
});

// Settlement netting (task-csa-settlement-netting): the scope is the project owner's choice of 2026-11-06 (agreed VM
// calls, VM returns and held Interest Amounts between the two parties on one day); the rules are assumptions awaiting
// task-sme-settlement-netting-rules.
test("flow-settlement-netting: VM call, VM return and held interest due the same day -> the party owing the net settles them by one tUSD transfer, statement verified", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Movement = { id: string; type: string; payer: string; receiver: string; amountUsd: string };
  type Netting = { nettingId: string; settledBy: string; amountUsd: string; cdmHash: string; verified?: boolean; error?: string; movements?: Movement[] };
  type Fold = { status: string };
  const p = await parties();
  const tUSD = p.tokens["tUSD"];

  // Setup: cash collateral in escrow for the Interest Amount (the interest spec leaves some; a run of this spec alone
  // pledges it).
  if (Number(await pledgedOf(GATEWAY.B, tUSD, p)) === 0) {
    await pledgeThroughServices(100_000, 100_000, "tUSD");
    await waitForSettledOnChain("IM", 100_000);
  }
  const vmUsd = 200_000 + (Date.now() % 9000) * 10;
  const returnUsd = 50_000 + (Date.now() % 900) * 10;

  // 1. B calls VM from A; A agrees and proposes tUSD; B accepts. Not settled: it waits for the netting.
  const { callId: vm } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "VM", toParty: "A", amountUsd: vmUsd, deadlineDays: 1 });
  await call(`${SERVICE.A}/calls/${vm}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${vm}/proposal`, "POST", { assets: [{ token: "tUSD", qty: vmUsd }] });
  await call(`${SERVICE.B}/calls/${vm}/decision`, "POST", { proposalId, accept: true });

  // 2. A calls a VM return from B; B agrees.
  const { callId: ret } = await call<{ callId: string }>(`${SERVICE.A}/calls`, "POST", { kind: "Return", toParty: "B", amountUsd: returnUsd, deadlineDays: 1 });
  await call(`${SERVICE.B}/calls/${ret}/response`, "POST", { response: "full" });

  // 3. B states the month's interest in its console and holds it for netting: stated on-chain, nothing paid.
  const known = new Set((await call<Interest[]>(`${SERVICE.B}/interest`)).map((i) => i.interestId));
  await page.goto("/#/live/B");
  const interestCard = page.getByTestId("interest");
  await interestCard.getByLabel("Period start").fill("2026-11-01");
  await interestCard.getByLabel("Period end").fill("2026-12-01");
  await interestCard.getByLabel("Observed rate (%)").fill("4.3");
  await interestCard.getByRole("checkbox", { name: /Hold for settlement netting/ }).check();
  await expect(interestCard.getByRole("button", { name: "State interest → A" })).toBeEnabled({ timeout: STEP_TIMEOUT });
  await interestCard.getByRole("button", { name: "State interest → A" }).click();
  let held: Interest | undefined;
  await expect
    .poll(async () => {
      held = (await call<Interest[]>(`${SERVICE.B}/interest`)).find((i) => !known.has(i.interestId));
      return held?.verified && held.state === "stated" ? true : (held?.error ?? held?.state ?? null);
    }, { timeout: 60_000 })
    .toBe(true);
  const interestUsd = Number(held!.amountUsd);
  expect(interestUsd).toBeGreaterThan(0);

  // 4. A's service lists the three movements and A owes the net.
  let cand: { movements: Movement[]; netUsd: string; payer: string | null } | undefined;
  await expect
    .poll(async () => {
      cand = await call(`${SERVICE.A}/netting/candidates`);
      return [vm, ret, held!.interestId].every((id) => cand!.movements.some((m) => m.id === id));
    }, { timeout: 60_000 })
    .toBe(true);
  const byId = (id: string) => cand!.movements.find((m) => m.id === id)!;
  expect(byId(vm)).toMatchObject({ type: "DeliveryAmount", payer: "A", receiver: "B", amountUsd: String(vmUsd) });
  expect(byId(ret)).toMatchObject({ type: "ReturnAmount", payer: "B", receiver: "A", amountUsd: String(returnUsd) });
  expect(byId(held!.interestId)).toMatchObject({ type: "InterestAmount", payer: "B", receiver: "A", amountUsd: String(interestUsd) });
  expect(cand!.payer).toBe("A");
  const net = Number(cand!.netUsd); // every movement that can net now, earlier runs' leftovers included
  const aFree = await balanceOf(GATEWAY.A, tUSD, p.a);
  const bFree = await balanceOf(GATEWAY.B, tUSD, p.b);
  const knownNettings = new Set((await call<Netting[]>(`${SERVICE.A}/nettings`)).map((n) => n.nettingId));

  // 5. A settles them in its console by one transfer of tUSD.
  await page.goto("/#/live/A");
  const card = page.getByTestId("settlement-netting");
  await expect(card.getByTestId("netting-net")).toHaveText(`Net: A pays USD ${net.toLocaleString("en-US")} in tUSD`, { timeout: STEP_TIMEOUT });
  await card.getByRole("button", { name: "Settle netted" }).click();

  // 6. Both services list the netting with the same verified CDM statement; the net moved once, A to B.
  let mine: Netting | undefined;
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        mine = (await call<Netting[]>(`${svc}/nettings`)).find((n) => !knownNettings.has(n.nettingId));
        return mine?.verified ? true : (mine?.error ?? null);
      }, { timeout: 60_000 })
      .toBe(true);
  }
  const fromA = (await call<Netting[]>(`${SERVICE.A}/nettings`)).find((n) => n.nettingId === mine!.nettingId)!;
  expect(mine!.cdmHash).toBe(fromA.cdmHash);
  expect(mine!.settledBy).toBe("A");
  expect(mine!.amountUsd).toBe(String(net));
  expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aFree - BigInt(net));
  expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bFree + BigInt(net));

  // On-chain: both calls settled in the netting, the Interest Amount settled.
  for (const id of [vm, ret]) {
    const c = await call<{ state: number; nettedIn: string }>(`${GATEWAY.A}/calls/${id}`);
    expect(c.state).toBe(5);
    expect(c.nettedIn).toBe(mine!.nettingId);
  }
  expect((await call<Interest[]>(`${SERVICE.A}/interest`)).find((i) => i.interestId === held!.interestId)?.state).toBe("settled");

  // Both services fold each call's SettleCall step (naming the netting) to Settled.
  for (const id of [vm, ret]) {
    await expectConvergedCdmState(id);
    for (const svc of [SERVICE.A, SERVICE.B]) expect((await call<Fold>(`${svc}/calls/${id}/cdm-state`)).status).toMatch(/^settled$/i);
  }

  // Both consoles show the netting as verified and nothing left to net from it.
  for (const who of ["A", "B"] as const) {
    await page.goto(`/#/live/${who}`);
    await expect(page.getByTestId(`netting-${mine!.nettingId}`).getByText("statement verified ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  }
  expect(errors).toEqual([]);
});

// Margin call cancellation (task-csa-call-cancellation). The rules are the project owner's assumptions of 2026-11-06,
// to be confirmed in task-sme-call-cancellation-rules.
test("flow-call-cancellation: secured party withdraws an unanswered call; requests cancellation of an agreed call -> pledgor accepts, proposal void, nothing moved", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Fold = { status: string; converged: boolean };
  const folded = async (callId: string) => {
    await expectConvergedCdmState(callId);
    for (const svc of [SERVICE.A, SERVICE.B]) expect((await call<Fold>(`${svc}/calls/${callId}/cdm-state`)).status).toMatch(/^cancelled$/i);
  };

  // 1-4. Withdrawal: B issues an IM call and withdraws it in its console before A answers.
  const amountUsd = 300_000 + (Date.now() % 9000) * 10;
  const { callId: w } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await page.goto("/#/live/B");
  const rowW = page.locator(".subcard", { hasText: shortId(w) });
  await expect(rowW.getByRole("button", { name: "Withdraw call" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowW.getByLabel("Cancellation reason").fill("booked in error");
  await rowW.getByRole("button", { name: "Withdraw call" }).click();
  await expect(rowW.getByText("cancelled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  expect((await call<{ state: number }>(`${GATEWAY.A}/calls/${w}`)).state).toBe(7);
  await folded(w);

  // 5-10. Request and acceptance: an agreed IM call with an accepted proposal, set up through the services.
  const amount2 = amountUsd + 5;
  const qty = Math.ceil(amount2 / TUST_VALUE);
  const { callId: c } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd: amount2, deadlineDays: 1 });
  await call(`${SERVICE.A}/calls/${c}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${c}/proposal`, "POST", { assets: [{ token: "tUST", qty }] });
  await call(`${SERVICE.B}/calls/${c}/decision`, "POST", { proposalId, accept: true });
  const tUST = p.tokens["tUST"];
  const freeBefore = await balanceOf(GATEWAY.A, tUST, p.a);
  const pledgedBefore = await pledgedOf(GATEWAY.A, tUST, p);

  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: shortId(c) });
  await expect(rowB.getByRole("button", { name: "Request cancellation" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByLabel("Cancellation reason").fill("superseded by a corrected call");
  await rowB.getByRole("button", { name: "Request cancellation" }).click();
  await expect(rowB.getByText("cancellation requested by B")).toBeVisible({ timeout: STEP_TIMEOUT });

  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: shortId(c) });
  await expect(rowA.getByRole("button", { name: "Accept cancellation" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowA.getByRole("button", { name: "Pledge accepted collateral" })).toHaveCount(0);
  await rowA.getByRole("button", { name: "Accept cancellation" }).click();
  await expect(rowA.getByText("cancelled on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // On-chain: the call is cancelled, its proposal void, and no collateral moved.
  const onChain = await call<{ state: number; cancellationRequestedBy: string }>(`${GATEWAY.B}/calls/${c}`);
  expect(onChain.state).toBe(7);
  expect(onChain.cancellationRequestedBy).toBe("0x0000000000000000000000000000000000000000");
  expect(await call<number>(`${GATEWAY.B}/calls/${c}/proposals/${proposalId}/state`)).toBe(4);
  expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(freeBefore);
  expect(await pledgedOf(GATEWAY.A, tUST, p)).toBe(pledgedBefore);
  await folded(c);
  expect(errors).toEqual([]);
});

// Replacement of a cancelled call (task-csa-call-replacement): the corrected call names the call it replaces, on-chain
// and in its CDM IssueCall step. The details are assumptions awaiting task-sme-call-cancellation-rules (question 5).
test("flow-call-replacement: secured party withdraws a call -> issues a corrected call that replaces it, linked on-chain and in CDM", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Fold = { status: string; converged: boolean };
  type Row = { callId: string; state: string; replaces: string | null; replacedBy: string | null };

  // 1-2. Setup through the services: B issues an IM call to A and withdraws it.
  const amountUsd = 400_000 + (Date.now() % 9000) * 10;
  const { callId: old } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await call(`${SERVICE.B}/calls/${old}/withdraw`, "POST", { reason: "amount booked in error" });

  // 3-4. B issues the corrected call from the cancelled call's row in its console.
  const corrected = amountUsd - 50_000;
  await page.goto("/#/live/B");
  const rowOld = page.locator(".subcard", { hasText: shortId(old) });
  await expect(rowOld.getByRole("button", { name: "Issue replacement call" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowOld.getByLabel("Replacement amount (USD)").fill(String(corrected));
  await rowOld.getByRole("button", { name: "Issue replacement call" }).click();
  await expect(rowOld.getByText(/replaced by/)).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowOld.getByRole("button", { name: "Issue replacement call" })).toHaveCount(0);

  // 5. On-chain: the link both ways, the new call issued for the corrected amount to the same party.
  const linked = await call<{ replacementOf: string }>(`${GATEWAY.A}/calls/${old}`);
  const repl = linked.replacementOf;
  expect(repl).not.toBe("0x" + "0".repeat(64));
  const onChain = await call<{ state: number; replaces: string; kind: number; amount: string }>(`${GATEWAY.A}/calls/${repl}`);
  expect(onChain.state).toBe(1);
  expect(onChain.replaces).toBe(old);
  expect(onChain.kind).toBe(0);

  // 6. Both consoles' services show the link, and A sees the corrected call to answer.
  for (const svc of [SERVICE.A, SERVICE.B]) {
    const link = async () => {
      const rows = (await call<{ calls: Row[] }>(`${svc}/state`)).calls;
      return [rows.find((r) => r.callId === repl)?.replaces, rows.find((r) => r.callId === old)?.replacedBy];
    };
    await expect.poll(link, { timeout: 60_000 }).toEqual([old, repl]);
  }
  await page.goto("/#/live/A");
  const rowNew = page.locator(".subcard", { hasText: shortId(repl) });
  await expect(rowNew.getByText(/replaces/)).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(rowNew.getByRole("button", { name: "Agree in full" })).toBeVisible({ timeout: STEP_TIMEOUT });

  // 7. Both services fold the replacement's CDM IssueCall step, which names the cancelled call (ReplacementAllowed held).
  await expectConvergedCdmState(repl);
  for (const svc of [SERVICE.A, SERVICE.B]) expect((await call<Fold>(`${svc}/calls/${repl}/cdm-state`)).status).toMatch(/^issued$/i);

  // 8. A second replacement of the same call is refused.
  await expect(call(`${SERVICE.B}/calls`, "POST", { replacesCallId: old, amountUsd: corrected, deadlineDays: 1 })).rejects.toThrow(/replacement/);

  // Cleanup: withdraw the replacement so later specs see no open call from this one.
  await call(`${SERVICE.B}/calls/${repl}/withdraw`, "POST", { reason: "spec cleanup" });
  expect(errors).toEqual([]);
});

interface Agreement {
  mtaUsd: string;
  roundingUsd: string;
  haircuts: { token: string; eligible: boolean; haircutBps: number; onChainHaircutBps: number | null; matches: boolean }[];
  agreementHash: string;
  onChainAgreementHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; mine: boolean; state: string; mtaUsd: string | null }[];
}

// Last: the amendment changes the pair's terms, and the spec restores them (MTA 500,000, tMMF 4%) so a rerun of the
// other specs sees the baseline terms.
test("flow-agreement-amendment: secured party proposes new MTA and tMMF haircut -> pledgor consents -> terms applied on-chain and in both services", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Setup: refuse an amendment a failed earlier run left pending.
  const start = await call<Agreement>(`${SERVICE.B}/agreement`);
  const left = start.amendments.find((m) => m.state === "proposed");
  if (left) await call(`${left.proposer === "B" ? SERVICE.A : SERVICE.B}/amendments/${left.amendmentId}/decision`, "POST", { consent: false });
  const known = new Set(start.amendments.map((m) => m.amendmentId));
  const mta = start.mtaUsd === "400000" ? 450_000 : 400_000;
  const bps = start.haircuts.find((h) => h.token === "tMMF")!.haircutBps === 1000 ? 1200 : 1000;

  // 1-4. Secured party (BANK-B) proposes a new MTA and a tMMF haircut in its console.
  await page.goto("/#/live/B");
  const card = page.getByTestId("agreement");
  await expect(card.getByText("terms verified against the chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await card.getByLabel("New MTA (USD)").fill(String(mta));
  await card.getByLabel("Amended token").selectOption("tMMF");
  await card.getByLabel("Haircut (bps)").fill(String(bps));
  await expect(card.getByRole("button", { name: "Propose amendment → A" })).toBeEnabled({ timeout: STEP_TIMEOUT });
  await card.getByRole("button", { name: "Propose amendment → A" }).click();

  let id = "";
  await expect
    .poll(async () => {
      const m = (await call<Agreement>(`${SERVICE.A}/agreement`)).amendments.find((x) => !known.has(x.amendmentId));
      id = m?.amendmentId ?? "";
      return m?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("proposed");

  // 5-7. Pledgor (BANK-A) checks the CDM amendment and consents in its console.
  await page.goto("/#/live/A");
  const row = page.getByTestId(`amendment-${id}`);
  await expect(row.getByRole("button", { name: "Consent" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await row.getByRole("button", { name: "Consent" }).click();
  await expect(row.getByText("agreed on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // 8. Both services fold the amendment to the same terms, matching the chain.
  const folded: Agreement[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const a = await call<Agreement>(`${svc}/agreement`);
        return a.verified && a.mtaUsd === String(mta) ? true : (a.problem ?? a.mtaUsd);
      }, { timeout: 60_000 })
      .toBe(true);
    folded.push(await call<Agreement>(`${svc}/agreement`));
  }
  expect(folded[0].agreementHash).toBe(folded[1].agreementHash);
  expect(folded[0].agreementHash).not.toBe(start.agreementHash);
  for (const a of folded) expect(a.haircuts.find((h) => h.token === "tMMF")).toMatchObject({ haircutBps: bps, onChainHaircutBps: bps, matches: true });
  const onChain = await call<{ agreementHash: string; pendingAmendment: string; eligibility: { token: string; eligible: boolean; haircutBps: number }[] }>(
    `${GATEWAY.A}/pair-terms?pledgor=${p.a}&securedParty=${p.b}`);
  expect(onChain.agreementHash).toBe(folded[0].agreementHash);
  expect(onChain.pendingAmendment).toBe(ZERO_HASH);
  expect(onChain.eligibility.find((e) => e.token.toLowerCase() === p.tokens["tMMF"].toLowerCase())).toMatchObject({ eligible: true, haircutBps: bps });
  const reval = await call<{ mtaUsd: string }>(`${SERVICE.B}/revaluation`);
  expect(reval.mtaUsd).toBe(String(mta));

  // Restore the baseline terms through the services: A proposes, B consents (either party may propose).
  const { amendmentId } = await call<{ amendmentId: string }>(`${SERVICE.A}/amendments`, "POST", {
    mtaUsd: 500_000, haircuts: [{ token: "tMMF", eligible: true, haircutBps: 400 }] });
  await expect
    .poll(async () => (await call<Agreement>(`${SERVICE.B}/agreement`)).amendments.find((m) => m.amendmentId === amendmentId)?.state ?? null, { timeout: 60_000 })
    .toBe("proposed");
  await call(`${SERVICE.B}/amendments/${amendmentId}/decision`, "POST", { consent: true });
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const a = await call<Agreement>(`${svc}/agreement`);
        return a.verified && a.mtaUsd === "500000" && a.haircuts.find((h) => h.token === "tMMF")!.onChainHaircutBps === 400;
      }, { timeout: 60_000 })
      .toBe(true);
  }
  expect(errors).toEqual([]);
});

test("flow-allocation: pledgor asks for a suggested basket on an agreed IM call -> proposes it -> secured party accepts -> pledged as suggested", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  // wp-adr-allocation-scope: eligible tokens in ranking order (registry order by default), the last one rounded up to
  // whole units; nothing is recorded until the pledgor proposes.
  type Allocation = {
    covers: boolean; assets: { token: string; qty: number }[]; valueUsd: string; agreedUsd: string; ranking: string[];
    inventory: { token: string; rank: number; held: string; eligible: boolean; haircutBps: number; price: string }[];
  };
  // Small enough that part of the pledgor's tUST covers it: the chain is persistent and the other flows need the
  // pledgor's tUSD and tUST, so this flow must not drain them (multi-asset fills are covered by AllocationTest).
  const amountUsd = 1_000_000 + (Date.now() % 9000) * 100;
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const p = await parties();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1-2. Secured party issues the IM call; the pledgor agrees in full.
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue IM call/ }).click();
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Agree in full" }).click();

  // 3. The pledgor asks for a suggestion; the console fills the basket.
  await expect(rowA.getByRole("button", { name: "Suggest allocation" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Suggest allocation" }).click();
  await expect(rowA.getByText(/suggested: USD [\d,.]+ after haircuts/)).toBeVisible({ timeout: STEP_TIMEOUT });

  // The same suggestion through the service API: it covers the agreed amount, in ranking order, every asset but the
  // last at its full holding, and overshoots by less than one unit of the last asset after its haircut.
  const st = await call<{ calls: { callId: string; amountUsd: string }[] }>(`${SERVICE.A}/state`);
  const callId = st.calls.find((c) => c.amountUsd === String(amountUsd))!.callId;
  const alloc = await call<Allocation>(`${SERVICE.A}/calls/${callId}/allocation`, "POST", {});
  expect(alloc.covers).toBe(true);
  expect(alloc.ranking).toEqual(Object.keys(p.tokens));
  await expect(rowA.getByText(`basket: ${alloc.assets.map((a) => `${a.token} ${a.qty.toLocaleString("en-US")}`).join(" + ")}`)).toBeVisible();
  const inv = Object.fromEntries(alloc.inventory.map((i) => [i.token, i]));
  const ranks = alloc.assets.map((a) => inv[a.token].rank);
  expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
  alloc.assets.forEach((a, i) => {
    expect(inv[a.token].eligible).toBe(true);
    if (i < alloc.assets.length - 1) expect(String(a.qty)).toBe(inv[a.token].held);
    else expect(a.qty).toBeLessThanOrEqual(Number(inv[a.token].held));
  });
  const last = inv[alloc.assets[alloc.assets.length - 1].token];
  const lastUnitValue = (Number(last.price) / 1e8) * (1 - last.haircutBps / 10_000);
  expect(alloc.assets).toEqual([{ token: "tUST", qty: Math.ceil(amountUsd / lastUnitValue) }]);
  expect(Number(alloc.valueUsd)).toBeGreaterThanOrEqual(amountUsd);
  expect(Number(alloc.valueUsd) - amountUsd).toBeLessThan(lastUnitValue);
  // A ranking from the body goes first; the calling party is not offered an allocation.
  const reranked = await call<Allocation>(`${SERVICE.A}/calls/${callId}/allocation`, "POST", { ranking: ["tMMF"] });
  expect(reranked.ranking[0]).toBe("tMMF");
  if (inv.tMMF.eligible && Number(inv.tMMF.held) > 0) expect(reranked.assets[0].token).toBe("tMMF");
  await expect(call(`${SERVICE.B}/calls/${callId}/allocation`, "POST", {})).rejects.toThrow(/only the called party/);

  // 4-6. The pledgor proposes the suggested basket; the secured party accepts; the pledgor pledges it.
  const before = Object.fromEntries(await Promise.all(alloc.assets.map(async (a) => [a.token, await pledgedOf(GATEWAY.A, p.tokens[a.token], p)] as const)));
  await rowA.getByRole("button", { name: `Propose collateral (${alloc.assets.length})` }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA2.getByRole("button", { name: "Pledge accepted collateral" }).click();
  await waitForSettledOnChain("IM", amountUsd);
  for (const a of alloc.assets) {
    expect(await pledgedOf(GATEWAY.A, p.tokens[a.token], p) - before[a.token]).toBe(BigInt(a.qty));
  }
  await expectConvergedCdmState(callId);
  expect(errors).toEqual([]);
});


test("flow-reconciliation: pledgor reconciles trade portfolios with the secured party -> hashes agree on-chain -> disputes a call citing the breaks; both parties' records match the ledger", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  type Run = {
    reconciliationId: string; firstSnapshotId: string; secondSnapshotId: string; resultHash: string;
    firstParty: string; secondParty: string; reconciled: boolean; matchedTrades: number;
    breaks: { uti: string; type: string; differenceUsd: string | null }[];
    firstExposureUsd: string; secondExposureUsd: string; exposureDifferenceUsd: string;
    onChain: { state: string; firstPartyResult: string; secondPartyResult: string };
  };
  const p = await parties();
  const before = (await call<Run[]>(`${SERVICE.A}/reconciliation/portfolio`))[0]?.reconciliationId;

  // 1. The pledgor (BANK-A) reconciles its trades with BANK-B's from its console: the snapshots go service to service,
  //    each party commits its snapshot hash and its result hash on-chain.
  await page.goto("/#/live/A");
  const card = page.getByTestId("reconciliation");
  await card.getByRole("button", { name: "Reconcile portfolios → B" }).click();
  let a: Run | undefined;
  await expect
    .poll(async () => {
      a = (await call<Run[]>(`${SERVICE.A}/reconciliation/portfolio`))[0];
      return a?.reconciliationId;
    }, { timeout: 60_000 })
    .not.toBe(before);
  const shown = card.getByTestId(`reconciliation-${a!.reconciliationId}`);
  await expect(shown.getByTestId("reconciliation-status")).toHaveText("2 breaks", { timeout: STEP_TIMEOUT });
  await expect(shown.getByTestId("reconciliation-onchain")).toHaveText("both results agree on-chain ✓");
  await expect(shown.getByTestId("break-DRTY123456")).toContainText("valuations differ");
  await expect(shown.getByTestId("break-DRTY123456")).toContainText("USD 40,000");
  await expect(shown.getByTestId("break-56323")).toContainText("missing at the second party");
  await expect(shown.getByTestId("exposure-difference")).toHaveText("USD 115,000");

  // 2. Both services hold the same CDM result for the run; the chain holds both snapshots and the matching result hashes.
  a = (await call<Run[]>(`${SERVICE.A}/reconciliation/portfolio`))[0];
  const b = (await call<Run[]>(`${SERVICE.B}/reconciliation/portfolio`))[0];
  expect(b.reconciliationId).toBe(a.reconciliationId);
  expect(b.resultHash).toBe(a.resultHash);
  expect([a.firstParty, a.secondParty, a.matchedTrades, a.reconciled]).toEqual(["BANK-A", "BANK-B", 1, false]);
  expect(a.breaks.map((x) => `${x.uti}:${x.type}:${x.differenceUsd}`)).toEqual(["56323:MissingFromSecond:null", "DRTY123456:ValuationDiffers:40000"]);
  expect([a.firstExposureUsd, a.secondExposureUsd, a.exposureDifferenceUsd]).toEqual(["1625000", "-1510000", "115000"]);
  const run = await call<{ state: string; firstPartyResult: string; secondPartyResult: string; breakCount: number }>(`${GATEWAY.B}/reconciliation/runs/${a.reconciliationId}`);
  expect(run).toMatchObject({ state: "agreed", firstPartyResult: a.resultHash, secondPartyResult: a.resultHash, breakCount: 2 });
  const first = await call<{ party: string; counterparty: string; snapshotHash: string }>(`${GATEWAY.A}/reconciliation/snapshots/${a.firstSnapshotId}`);
  const second = await call<{ party: string; counterparty: string; snapshotHash: string }>(`${GATEWAY.A}/reconciliation/snapshots/${a.secondSnapshotId}`);
  expect([first.party.toLowerCase(), first.counterparty.toLowerCase()]).toEqual([p.a.toLowerCase(), p.b.toLowerCase()]);
  expect([second.party.toLowerCase(), second.counterparty.toLowerCase()]).toEqual([p.b.toLowerCase(), p.a.toLowerCase()]);
  expect(first.snapshotHash).not.toBe(ZERO_HASH);
  await page.goto("/#/live/B");
  await expect(page.getByTestId(`reconciliation-${a.reconciliationId}`)).toBeVisible({ timeout: STEP_TIMEOUT });

  // 3. BANK-B issues an IM call; BANK-A disputes it from its console citing the reconciliation, and records a CDM Dispute
  //    whose reason names the run and its breaks. Nothing is delivered.
  const amountUsd = 600_000 + (Date.now() % 9000) * 10;
  const { callId } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await page.goto("/#/live/A");
  const row = page.locator(".subcard", { hasText: shortId(callId) });
  await row.getByRole("button", { name: "Dispute citing reconciliation" }).click({ timeout: STEP_TIMEOUT });
  await expect(row.getByText("disputed", { exact: true })).toBeVisible({ timeout: STEP_TIMEOUT });
  // The console shows "disputed" once the response is mined; the service records the Dispute right after.
  type Row = { callId: string; state: string; disputedUsd: string; messages: { msgType: string; cdmJson: string }[] };
  let disputed: Row | undefined;
  await expect
    .poll(async () => {
      disputed = (await call<{ calls: Row[] }>(`${SERVICE.A}/state`)).calls.find((c) => c.callId === callId);
      return disputed?.messages.map((m) => m.msgType) ?? [];
    }, { timeout: STEP_TIMEOUT })
    .toContain("Dispute");
  expect([disputed!.state, disputed!.disputedUsd]).toEqual(["disputed", String(amountUsd)]);
  const dispute = JSON.parse(disputed!.messages.find((m) => m.msgType === "Dispute")!.cdmJson);
  expect(dispute.reason).toBe(`Portfolio reconciliation ${a.reconciliationId}: 2 breaks; 56323 MissingFromSecond; DRTY123456 ValuationDiffers; exposure difference USD 115000`);

  // 4. Each party's stored CDM records of the pair's calls match the contract (status, called and agreed amounts), and
  //    the escrow its settled records build matches the control contract's, token by token.
  type Escrow = { record: string; recorded: Record<string, number>; ledger: Record<string, number> };
  const escrows: Escrow[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    let last: { breaks: unknown[]; escrow: Escrow } | undefined;
    await expect
      .poll(async () => {
        const r = await call<{ reconciled: boolean; calls: number; checkedFacts: number; breaks: unknown[]; escrow: Escrow }>(`${svc}/reconciliation/ledger`, "POST", {});
        last = r;
        return r.reconciled && r.calls > 0 && r.checkedFacts >= 2 * r.calls;
      }, { timeout: 60_000, message: `ledger reconciliation at ${svc}` })
      .toBe(true);
    expect(last!.breaks).toEqual([]);
    expect(last!.escrow.recorded).toEqual(last!.escrow.ledger);
    escrows.push(last!.escrow);
  }
  expect(escrows[0]).toEqual(escrows[1]); // both parties' records give the same escrow
  expect(escrows[0].record).toBe("escrow BANK-A to BANK-B");
  await page.getByTestId("reconciliation").getByRole("button", { name: "Reconcile with ledger" }).click();
  await expect(page.getByTestId("ledger-reconciliation")).toContainText("records match the ledger ✓", { timeout: STEP_TIMEOUT });

  expect(errors).toEqual([]);
});

// --- two-way initial margin (task-two-way-initial-margin, wp-adr-two-way-im) ---
// Each party pledges initial margin to the other on the same day, in different amounts; the legs are not netted. A
// defaults: B enforces against A's leg and takes its own leg back from the control contract (the pledgor's reclaim on
// the secured party's default). B posts tUSD cash, the asset it holds from the test-balance top-up.
test("flow-two-way-im-default: A and B each post IM to the other -> A defaults -> B enforces A's leg and reclaims its own", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const symbols = Object.keys(p.tokens);
  const legOf = async (token: string, pledgor: string, securedParty: string) =>
    BigInt(await call<string>(`${GATEWAY.B}/pledged?token=${token}&pledgor=${pledgor}&securedParty=${securedParty}`));
  // Small and unique per run: enforcement and reclaim empty both legs for good on the persistent chain.
  const aLegUsd = 100_000 + (Date.now() % 9000) * 10;
  const bLegUsd = 60_000 + (Date.now() % 9000) * 10; // a different amount on the other leg
  const aQty = Math.ceil(aLegUsd / TUST_VALUE) + 100;
  const bQty = bLegUsd + 1_000; // tUSD at 1.00, no haircut
  const bLabel = `USD ${bLegUsd.toLocaleString("en-US")}`;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // A's leg: B calls, A pledges tUST (through the services; the UI path is the flow-im-margin-call-pledge spec).
  const aCallId = await pledgeThroughServices(aLegUsd, aQty);
  await waitForSettledOnChain("IM", aLegUsd);

  // B's leg, through the consoles: A selects the leg B pledges on, where A is the secured party, and calls B.
  await page.goto("/#/live/A");
  await page.getByRole("button", { name: /B pledges to A/ }).click();
  const issueCard = page.locator(".card", { hasText: "Issue margin call" });
  await expect(issueCard).toBeVisible({ timeout: STEP_TIMEOUT }); // shown to the secured party of the selected leg
  await issueCard.getByRole("spinbutton").fill(String(bLegUsd));
  await issueCard.getByRole("button", { name: "Issue IM call → B" }).click();

  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: bLabel }).filter({ hasText: "A → B" });
  await expect(rowB.getByRole("button", { name: "Agree in full" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Agree in full" }).click();
  await expect(rowB.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("combobox").selectOption("tUSD");
  await rowB.getByRole("spinbutton").fill(String(bQty));
  await rowB.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowB.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: STEP_TIMEOUT });

  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: bLabel }).filter({ hasText: "A → B" });
  await expect(rowA.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowA.getByRole("button", { name: "Accept proposal" }).click();

  await page.goto("/#/live/B");
  await expect(rowB.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await rowB.getByRole("button", { name: "Pledge accepted collateral" }).click();
  await waitForSettledOnChain("IM", bLegUsd);

  // Both legs are in escrow, apart: each service shows the other leg too.
  expect(await legOf(p.tokens["tUST"], p.a, p.b) >= BigInt(aQty)).toBe(true);
  expect(await legOf(p.tokens["tUSD"], p.b, p.a) >= BigInt(bQty)).toBe(true);
  const st = await call<{ balances: { token: string; pledgedByLeg: Record<string, string> }[] }>(`${SERVICE.A}/state`);
  expect(BigInt(st.balances.find((b) => b.token === "tUSD")!.pledgedByLeg.B) >= BigInt(bQty)).toBe(true);
  // The CDM call headers name the leg's pledgor: B on the call A issued.
  const issued = await call<{ calls: { callId: string; amountUsd: string; leg: string; from: string }[] }>(`${SERVICE.B}/state`);
  expect(issued.calls.find((c) => c.amountUsd === String(bLegUsd) && c.from === "A")?.leg).toBe("B");

  const freeBefore: Record<string, bigint> = {};
  const legsBefore: Record<string, bigint> = {};
  for (const sym of symbols) {
    freeBefore[sym] = await balanceOf(GATEWAY.B, p.tokens[sym], p.b);
    legsBefore[sym] = (await legOf(p.tokens[sym], p.a, p.b)) + (await legOf(p.tokens[sym], p.b, p.a));
  }

  // A defaults. B, the secured party on A's leg, declares the default and enforces against A's leg.
  await page.goto("/#/live/B");
  const enforceRow = page.locator(".subcard", { hasText: shortId(aCallId) });
  await expect(enforceRow.getByRole("button", { name: "Declare default & enforce" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await enforceRow.getByRole("button", { name: "Declare default & enforce" }).click();
  await expect(enforceRow.getByText("enforced ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // B, the pledgor on its own leg, takes its IM back: the feed records its secured party (A) in default.
  await page.getByRole("button", { name: /B pledges to A/ }).click();
  const reclaimCard = page.getByTestId("reclaim");
  await expect(reclaimCard).toBeVisible({ timeout: STEP_TIMEOUT });
  await reclaimCard.getByRole("button", { name: "Reclaim my IM from A" }).click();
  await expect(reclaimCard).toBeHidden({ timeout: STEP_TIMEOUT });

  // On-chain: both legs are empty, and B holds what was in either leg (A's leg seized, B's own returned).
  for (const sym of symbols) {
    expect(await legOf(p.tokens[sym], p.a, p.b)).toBe(0n);
    expect(await legOf(p.tokens[sym], p.b, p.a)).toBe(0n);
    expect(await balanceOf(GATEWAY.B, p.tokens[sym], p.b)).toBe(freeBefore[sym] + legsBefore[sym]);
  }

  // Each party's records match the chain on both legs: two escrow records, nothing left in either.
  type Escrow = { record: string; pledgor: string; recorded: Record<string, number>; ledger: Record<string, number> };
  for (const svc of [SERVICE.B, SERVICE.A]) {
    await expect
      .poll(async () => {
        const r = await call<{ reconciled: boolean; breaks: unknown[]; escrows: Escrow[] }>(`${svc}/reconciliation/ledger`, "POST", {});
        return r.escrows.map((e) => [e.pledgor, Object.keys(e.recorded).length, Object.keys(e.ledger).length]).sort();
      }, { timeout: 60_000 })
      .toEqual([["A", 0, 0], ["B", 0, 0]]);
  }

  expect(errors).toEqual([]);
});

type GmraTerms = {
  elections: { mtaUsd: { A: string; B: string }; defaultMarginRatio: string };
  termsHash: string;
  onChainTermsHash: string;
  verified: boolean;
  problem: string | null;
  pendingAmendment: string | null;
  amendments: { amendmentId: string; proposer: "A" | "B"; state: string; changed?: string[] }[];
};

test("flow-repo-gmra-terms: both parties hold the same GMRA terms -> A proposes a new MTA for B -> B consents -> terms hash moves on-chain, both services fold it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();

  // Setup: refuse a GMRA amendment a failed earlier run left pending; both parties start on the same terms.
  const start = await call<GmraTerms>(`${SERVICE.B}/gmra/terms`);
  const left = start.amendments.find((m) => m.state === "proposed");
  if (left) await call(`${left.proposer === "A" ? SERVICE.B : SERVICE.A}/gmra/amendments/${left.amendmentId}/decision`, "POST", { consent: false });
  const before = [await call<GmraTerms>(`${SERVICE.A}/gmra/terms`), await call<GmraTerms>(`${SERVICE.B}/gmra/terms`)];
  for (const t of before) expect(t.verified, t.problem ?? "").toBe(true);
  expect(before[0].termsHash).toBe(before[1].termsHash);
  expect(before[0].elections).toEqual(before[1].elections);
  const baselineMta = before[0].elections.mtaUsd.B;
  const known = new Set(before[0].amendments.map((m) => m.amendmentId));
  const mta = baselineMta === "400000" ? 450_000 : 400_000;

  // A proposes a new minimum transfer amount for B in its console.
  await page.goto("/#/live/A");
  const card = page.getByTestId("gmra-terms");
  await expect(card.getByText("GMRA terms verified against the chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });
  await card.getByLabel("GMRA MTA party").selectOption("B");
  await card.getByLabel("New GMRA MTA (USD)").fill(String(mta));
  await card.getByRole("button", { name: "Propose GMRA amendment → B" }).click();

  let id = "";
  await expect
    .poll(async () => {
      const m = (await call<GmraTerms>(`${SERVICE.B}/gmra/terms`)).amendments.find((x) => !known.has(x.amendmentId));
      id = m?.amendmentId ?? "";
      return m?.state ?? null;
    }, { timeout: 60_000 })
    .toBe("proposed");

  // B checks the CDM GmraTermsAmendment and consents in its console.
  await page.goto("/#/live/B");
  const row = page.getByTestId(`gmra-amendment-${id}`);
  await expect(row.getByText("MinimumTransferAmount")).toBeVisible({ timeout: STEP_TIMEOUT });
  await row.getByRole("button", { name: "Consent to GMRA amendment" }).click();
  await expect(row.getByText("agreed on-chain ✓")).toBeVisible({ timeout: STEP_TIMEOUT });

  // Both services fold the amendment to the same terms, matching the on-chain terms hash.
  const folded: GmraTerms[] = [];
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const t = await call<GmraTerms>(`${svc}/gmra/terms`);
        return t.verified && t.elections.mtaUsd.B === String(mta) ? true : (t.problem ?? t.elections.mtaUsd.B);
      }, { timeout: 60_000 })
      .toBe(true);
    folded.push(await call<GmraTerms>(`${svc}/gmra/terms`));
  }
  expect(folded[0].termsHash).toBe(folded[1].termsHash);
  expect(folded[0].termsHash).not.toBe(before[0].termsHash);
  const onChain = await call<{ termsHash: string; pendingAmendment: string }>(`${GATEWAY.A}/master-terms?kind=GMRA&a=${p.a}&b=${p.b}`);
  expect(onChain).toEqual({ termsHash: folded[0].termsHash, pendingAmendment: ZERO_HASH });
  // The CSA chain between the parties did not move.
  const csa = await call<{ agreementHash: string }>(`${GATEWAY.A}/pair-terms?pledgor=${p.a}&securedParty=${p.b}`);
  expect(csa.agreementHash).toBe((await call<{ agreementHash: string }>(`${SERVICE.A}/agreement`)).agreementHash);

  // Restore the baseline MTA through the services: B proposes, A consents.
  const { amendmentId } = await call<{ amendmentId: string }>(`${SERVICE.B}/gmra/amendments`, "POST", { party: "B", mtaUsd: Number(baselineMta) });
  await expect
    .poll(async () => (await call<GmraTerms>(`${SERVICE.A}/gmra/terms`)).amendments.find((m) => m.amendmentId === amendmentId)?.state ?? null, { timeout: 60_000 })
    .toBe("proposed");
  await call(`${SERVICE.A}/gmra/amendments/${amendmentId}/decision`, "POST", { consent: true });
  for (const svc of [SERVICE.A, SERVICE.B]) {
    await expect
      .poll(async () => {
        const t = await call<GmraTerms>(`${svc}/gmra/terms`);
        return t.verified && t.elections.mtaUsd.B === baselineMta;
      }, { timeout: 60_000 })
      .toBe(true);
  }
});

type Repo = {
  repoId: string; role: "seller" | "buyer"; state: string; security: string; quantity: string; purchasePrice: string;
  repurchasePrice: string; tradeHash: string; verified: boolean; problem: string | null; instructedByMe: boolean;
  purchaseDate?: string; repurchaseDate?: string; tradeStateHash?: string;
};
type RepoTrade = { tradeHash: string; tradeStateHash: string; closedTradeStateHash?: string; closedState?: string };

test("flow-repo-purchase-repurchase: A books a repo selling tUST to B -> B affirms -> purchase settles DvP -> business date to the Repurchase Date -> repurchase settles DvP", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  // Setup: both business dates on today (a failed earlier run may have moved them).
  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const known = new Set((await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.map((r) => r.repoId));
  const bal = async () => ({
    aUST: await balanceOf(GATEWAY.A, tUST, p.a), bUST: await balanceOf(GATEWAY.A, tUST, p.b),
    aUSD: await balanceOf(GATEWAY.A, tUSD, p.a), bUSD: await balanceOf(GATEWAY.A, tUSD, p.b),
  });
  const before = await bal();
  const repoOf = async (svc: string, id: string) => (await call<{ repos: Repo[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);

  try {
    // A books the repo in its console: 1,000,000 tUSD at 4.5% for 7 days, the GMRA's default Margin Ratio.
    await page.goto("/#/live/A");
    const cardA = page.getByTestId("repos");
    await expect(cardA.getByTestId("business-date")).toContainText(today, { timeout: STEP_TIMEOUT });
    await cardA.getByLabel("Repo security").selectOption("tUST");
    await cardA.getByLabel("Purchase Price (tUSD)").fill("1000000");
    await cardA.getByLabel("Repo rate (% p.a.)").fill("4.5");
    await cardA.getByLabel("Term (days)").fill("7");
    await cardA.getByRole("button", { name: "Book repo: sell to B" }).click();

    // B's service finds the booked trade in the payload store, rebuilds it with CDM and checks the on-chain amounts.
    let repo: Repo | undefined;
    await expect
      .poll(async () => {
        repo = (await call<{ repos: Repo[] }>(`${SERVICE.B}/repos`)).repos.find((r) => !known.has(r.repoId));
        return repo ? (repo.verified ? repo.state : repo.problem) : null;
      }, { timeout: 60_000 })
      .toBe("booked");
    const id = repo!.repoId;
    const qty = BigInt(repo!.quantity), pp = BigInt(repo!.purchasePrice), rp = BigInt(repo!.repurchasePrice);
    // 1,000,000 x 1.02 / 98.4 rounded up; 1,000,000 x 4.5% x 7 / 360 = 875.
    expect(qty).toBe(BigInt(Math.ceil((1_000_000 * 1.02) / PRICE_TUST)));
    expect(pp).toBe(1_000_000n);
    expect(rp - pp).toBe(875n);

    // B affirms in its console.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${id}`);
    await rowB.getByRole("button", { name: "Affirm repo" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`repo-state-${id}`)).toContainText("affirmed ✓", { timeout: STEP_TIMEOUT });

    // The purchase: B instructs first; nothing moves until A's instruction, which moves both legs.
    await rowB.getByRole("button", { name: "Settle purchase" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowB).toContainText("purchase instructed, awaiting A", { timeout: STEP_TIMEOUT });
    expect(await bal()).toEqual(before);
    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${id}`);
    await rowA.getByRole("button", { name: "Settle purchase" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`repo-state-${id}`)).toContainText("purchased ✓", { timeout: STEP_TIMEOUT });
    expect(await bal()).toEqual({ aUST: before.aUST - qty, bUST: before.bUST + qty, aUSD: before.aUSD + pp, bUSD: before.bUSD - pp });

    // Before the Repurchase Date the console offers no repurchase; the operator moves both business dates to it.
    const due = (await repoOf(SERVICE.A, id))!.repurchaseDate!;
    await expect(rowA).toContainText(`repurchase from ${due}`);
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });

    // The repurchase: A instructs, then B; the second instruction reverses both legs at the Repurchase Price.
    await page.reload();
    await page.getByTestId(`repo-${id}`).getByRole("button", { name: "Settle repurchase" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repoOf(SERVICE.A, id))?.instructedByMe, { timeout: 60_000 }).toBe(true);
    await page.goto("/#/live/B");
    await page.getByTestId(`repo-${id}`).getByRole("button", { name: "Settle repurchase" }).click({ timeout: STEP_TIMEOUT });
    await expect(page.getByTestId(`repo-state-${id}`)).toContainText("repurchased ✓", { timeout: STEP_TIMEOUT });
    expect(await bal()).toEqual({ aUST: before.aUST, bUST: before.bUST, aUSD: before.aUSD - (rp - pp), bUSD: before.bUSD + (rp - pp) });

    // Both services hold the same TradeState, booked under the on-chain trade hash, and the same closed trade from
    // CDM's Repurchase event, anchored on-chain.
    const trades = [await call<RepoTrade>(`${SERVICE.A}/repos/${id}/trade`), await call<RepoTrade>(`${SERVICE.B}/repos/${id}/trade`)];
    const onChain = await call<{ tradeHash: string; purchaseHash: string; repurchaseHash: string; state: string }>(`${GATEWAY.B}/repos/${id}`);
    expect(onChain.state).toBe("repurchased");
    expect(trades[0].tradeHash).toBe(onChain.tradeHash);
    expect(trades[1].tradeHash).toBe(onChain.tradeHash);
    expect(trades[0].tradeStateHash).toBe(trades[1].tradeStateHash);
    expect(trades[0].closedTradeStateHash).toBe(trades[1].closedTradeStateHash);
    expect(trades[0].closedState).toBe("Terminated");
    expect(onChain.purchaseHash).not.toBe(ZERO_HASH);
    expect(onChain.repurchaseHash).not.toBe(ZERO_HASH);
  } finally {
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  }
});

// --- flow-repo-margin-maintenance ---
// Margin on the pair's Net Exposure under the GMRA (wp-adr-repo-margin-maintenance): B, the buyer of a repo, calls margin
// when the securities fall; A settles one call in cash and one in securities by title transfer. B pays interest on the
// Cash Margin. After the repurchase the exposure reverses and A calls the margin back, so the spec leaves no margin held.
type RepoMargin = {
  exposures: { repoId: string; role: string; exposureUsd: string }[]; netMarginHeldUsd: string; cashMarginHeldUsd: string;
  netExposureUsd: string; minimumTransferAmountUsd: string; callableUsd: string; callOpen: boolean;
  interest: { interestId: string; amountUsd: string; verified: boolean; payer?: string; error?: string }[];
};

test("flow-repo-margin-maintenance: the securities fall -> the buyer calls Net Exposure -> settled in cash, then in securities -> interest on Cash Margin -> repurchase -> the seller calls the margin back", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  const margin = (svc: string) => call<RepoMargin>(`${svc}/repo-margin`);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const setPrice = async (price: number) => {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(price) });
    await feedIs(price);
  };
  // The called party responds and delivers by title transfer; the caller accepts the proposal.
  const settle = async (caller: string, called: string, callId: string, assets: { token: string; qty: number }[]) => {
    await call(`${called}/calls/${callId}/response`, "POST", { response: "full" });
    const { proposalId } = await call<{ proposalId: number }>(`${called}/calls/${callId}/proposal`, "POST", { assets });
    await call(`${caller}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
    await call(`${called}/calls/${callId}/transfer`, "POST", { proposalId });
  };
  const settled = async (svc: string, callId: string) =>
    expect.poll(async () => (await call<{ calls: { callId: string; state: string }[] }>(`${svc}/state`)).calls.find((c) => c.callId === callId)?.state, { timeout: 60_000 }).toBe("settled");
  const noCallOpen = async () => {
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await margin(svc)).callOpen, { timeout: 30_000 }).toBe(false);
  };

  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  const start = await margin(SERVICE.B);
  expect(start.exposures).toEqual([]);
  expect(Number(start.netMarginHeldUsd)).toBe(0);

  // Setup through the services (the UI path is flow-repo-purchase-repurchase): A sells tUST to B for 3,000,000 tUSD.
  const purchasePrice = 3_000_000;
  const qty = Math.ceil((purchasePrice * 1.02) / PRICE_TUST);
  const { repoId } = await call<{ repoId: string }>(`${SERVICE.A}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
  await call(`${SERVICE.B}/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await call<{ repos: { repoId: string; state: string }[] }>(`${SERVICE.A}/repos`)).repos.find((r) => r.repoId === repoId)?.state, { timeout: 30_000 }).toBe("affirmed");
  await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await expect.poll(async () => (await call<{ repos: { repoId: string; state: string }[] }>(`${SERVICE.B}/repos`)).repos.find((r) => r.repoId === repoId)?.state, { timeout: 30_000 }).toBe("purchased");

  let repurchased = false;
  try {
    // At the booking price the securities cover the Margin Ratio, so the buyer has nothing to call.
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe("0");

    // The price falls 10: B's Transaction Exposure is 3,060,000 - qty x 88.4, A's the opposite.
    const firstPrice = 88.4;
    await setPrice(firstPrice);
    const firstExposure = 3_060_000 - qty * firstPrice;
    const firstCall = Math.floor(firstExposure);
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(firstCall));
    expect(Number((await margin(SERVICE.B)).exposures[0].exposureUsd)).toBeCloseTo(firstExposure, 2);
    expect(Number((await margin(SERVICE.A)).exposures[0].exposureUsd)).toBeCloseTo(-firstExposure, 2);
    expect((await margin(SERVICE.A)).callableUsd).toBe("0");

    // B calls in its console; a second call is refused while the first is open.
    await page.goto("/#/live/B");
    const card = page.getByTestId("repo-margin");
    await card.getByRole("button", { name: `Call margin from A: USD ${firstCall}` }).click({ timeout: STEP_TIMEOUT });
    let callId: string | undefined;
    await expect.poll(async () => {
      callId = (await call<{ calls: { callId: string; kind: string; amountUsd: string; state: string }[] }>(`${SERVICE.A}/state`)).calls
        .find((c) => c.kind === "VM" && c.amountUsd === String(firstCall) && c.state === "issued")?.callId;
      return callId ?? null;
    }, { timeout: 30_000 }).not.toBeNull();
    await expect(call(`${SERVICE.B}/repo-margin/calls`, "POST", {})).rejects.toThrow("still open");

    // An under-covering proposal is refused off-chain, then A delivers the amount in cash.
    await call(`${SERVICE.A}/calls/${callId}/response`, "POST", { response: "full" });
    await expect(call(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: firstCall - 1 }] })).rejects.toThrow("does not cover");
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUSD", qty: firstCall }] });
    await call(`${SERVICE.B}/calls/${callId}/decision`, "POST", { proposalId, accept: true });
    await call(`${SERVICE.A}/calls/${callId}/transfer`, "POST", { proposalId });
    await settled(SERVICE.B, callId!);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsdBefore - BigInt(firstCall));
    await noCallOpen();
    expect((await margin(SERVICE.B)).cashMarginHeldUsd).toBe(String(firstCall));
    expect((await margin(SERVICE.A)).cashMarginHeldUsd).toBe(String(-firstCall));

    // The price falls again: the second call is the exposure less the margin held, delivered in tUST at the feed price.
    const secondPrice = 78.4;
    await setPrice(secondPrice);
    const secondCall = Math.floor(3_060_000 - qty * secondPrice - firstCall);
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(secondCall));
    const second = await call<{ callId: string; amountUsd: number }>(`${SERVICE.B}/repo-margin/calls`, "POST", {});
    expect(second.amountUsd).toBe(secondCall);
    const marginQty = Math.ceil(secondCall / secondPrice);
    await settle(SERVICE.B, SERVICE.A, second.callId, [{ token: "tUST", qty: marginQty }]);
    await settled(SERVICE.B, second.callId);
    await noCallOpen();
    expect((await margin(SERVICE.B)).callableUsd).toBe("0");

    // B holds the Cash Margin and pays interest on it for 7 days at a rate entered by hand; the on-chain amount verifies.
    const aBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    const interest = Math.round((firstCall * 0.044 * 7) / 360);
    const paid = await call<{ interestId: string; amountUsd: number }>(`${SERVICE.B}/repo-margin/interest`, "POST", { periodStart: today, periodEnd: new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA"), observedRatePct: "4.4" });
    expect(paid.amountUsd).toBe(interest);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aBefore + BigInt(interest));
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await margin(svc)).interest.find((i) => i.interestId === paid.interestId)?.verified, { timeout: 60_000 }).toBe(true);
    }
    expect((await call<{ interestId: string }[]>(`${SERVICE.A}/interest`)).some((i) => i.interestId === paid.interestId)).toBe(false);

    // The repurchase ends the exposure; B then holds margin it no longer needs, so A calls it back.
    await setPrice(PRICE_TUST);
    const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await margin(SERVICE.A)).exposures.length, { timeout: 30_000 }).toBe(0);
    repurchased = true;
    const heldValue = firstCall + marginQty * PRICE_TUST;
    await expect.poll(async () => (await margin(SERVICE.A)).callableUsd, { timeout: 30_000 }).toBe(String(Math.floor(heldValue)));
    const back = await call<{ callId: string }>(`${SERVICE.A}/repo-margin/calls`, "POST", {});
    await settle(SERVICE.A, SERVICE.B, back.callId, [{ token: "tUSD", qty: firstCall }, { token: "tUST", qty: marginQty }]);
    await settled(SERVICE.A, back.callId);
    await noCallOpen();
    expect(Number((await margin(SERVICE.A)).netMarginHeldUsd)).toBe(0);
    expect((await margin(SERVICE.A)).cashMarginHeldUsd).toBe("0");
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
    expect(repurchased).toBe(true);
  }
});

// --- flow-repo-reprice ---
// A reprice instead of a margin call (wp-adr-repo-reprice): the securities fall, B offers to reprice in its console, A
// agrees in its console. A pays B the difference, the securities stay with B, the exposure is gone, and the repurchase uses
// the new amounts.
test("flow-repo-reprice: the securities fall -> the buyer offers a reprice -> the seller agrees and pays the difference -> no exposure remains -> repurchase at the new price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  type MarginView = RepoMargin & { repriceOffered: number; repriceToAgree: number };
  type RepoRow = { repoId: string; state: string; purchasePrice: string; repurchasePrice: string; quantity: string; verified: boolean; problem: string | null; purchaseDate: string; tradeHash: string };
  const margin = (svc: string) => call<MarginView>(`${svc}/repo-margin`);
  const repo = async (svc: string, id: string) => (await call<{ repos: RepoRow[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };

  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const purchasePrice = 3_000_000;
  const qty = Math.ceil((purchasePrice * 1.02) / PRICE_TUST);
  const { repoId, tradeHash } = await call<{ repoId: string; tradeHash: string }>(`${SERVICE.A}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
  await call(`${SERVICE.B}/repos/${repoId}/affirm`, "POST", {});
  await expect.poll(async () => (await repo(SERVICE.A, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
  await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
  await expect.poll(async () => (await repo(SERVICE.B, repoId))?.state, { timeout: 30_000 }).toBe("purchased");

  let repurchased = false;
  try {
    const fallen = 88.4;
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(fallen) });
    await feedIs(fallen);
    const firstCall = Math.floor(3_060_000 - qty * fallen);
    await expect.poll(async () => (await margin(SERVICE.B)).callableUsd, { timeout: 30_000 }).toBe(String(firstCall));
    // The market value over the Margin Ratio; nothing has accrued on the Purchase Date, so A pays the whole difference.
    const newPurchasePrice = Math.round((qty * fallen) / 1.02);
    const difference = purchasePrice - newPurchasePrice;
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b), bUst = await balanceOf(GATEWAY.B, tUST, p.b);

    await page.goto("/#/live/B");
    const cardB = page.getByTestId("repo-margin");
    await cardB.getByRole("button", { name: "Reprice open repos with A" }).click({ timeout: STEP_TIMEOUT });
    await expect(cardB.getByTestId("repo-reprice-offered")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await margin(SERVICE.A)).repriceToAgree, { timeout: 30_000 }).toBe(1);
    // A margin call and a second offer are refused while the reprice is pending; nothing has moved yet.
    await expect(call(`${SERVICE.B}/repo-margin/calls`, "POST", {})).rejects.toThrow("still pending");
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    await page.goto("/#/live/A");
    const cardA = page.getByTestId("repo-margin");
    await cardA.getByRole("button", { name: "Agree reprice with B: 1 repo(s)" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, repoId))?.purchasePrice, { timeout: 30_000 }).toBe(String(newPurchasePrice));

    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - BigInt(difference));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + BigInt(difference));
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst);
    // 4.5% on the new Purchase Price for the 7 days from the reprice date to the Repurchase Date.
    const newRepurchasePrice = Math.round(newPurchasePrice + (newPurchasePrice * 0.045 * 7) / 360);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await repo(svc, repoId))?.verified, { timeout: 30_000 }).toBe(true);
      const r = (await repo(svc, repoId))!;
      expect(r.repurchasePrice).toBe(String(newRepurchasePrice));
      expect(r.quantity).toBe(String(qty));
      expect(r.tradeHash).not.toBe(tradeHash);
      const m = await margin(svc);
      expect(m.repriceOffered + m.repriceToAgree).toBe(0);
      expect(m.callableUsd).toBe("0");
      expect(Math.abs(Number(m.netExposureUsd))).toBeLessThan(2);
    }

    // The repurchase moves the securities back for the new Repurchase Price.
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
    const aBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await repo(SERVICE.A, repoId))?.state, { timeout: 30_000 }).toBe("repurchased");
    repurchased = true;
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aBefore - BigInt(newRepurchasePrice));
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
    expect(repurchased).toBe(true);
  }
});

// Every open repo in both directions: A sells to B once and B sells to A twice. When the securities fall each seller pays
// its buyer, so B, the proposer, pays twice: its one allowance must cover both payments, which settle only when A agrees.
test("flow-repo-reprice: every open repo in both directions is repriced -> the proposer's two payments and the agreeing party's one settle -> the Net Exposure is gone", async () => {
  test.setTimeout(TEST_TIMEOUT * 3);
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  type RepoRow = { repoId: string; state: string; purchasePrice: string; verified: boolean };
  type MarginView = RepoMargin & { repriceOffered: number; repriceToAgree: number };
  const margin = (svc: string) => call<MarginView>(`${svc}/repo-margin`);
  const repo = async (svc: string, id: string) => (await call<{ repos: RepoRow[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);
  const feedIs = async (price: number) => {
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const open = async (seller: string, buyer: string, purchasePrice: number) => {
    const { repoId } = await call<{ repoId: string }>(`${seller}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("booked");
    await call(`${buyer}/repos/${repoId}/affirm`, "POST", {});
    await expect.poll(async () => (await repo(seller, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
    await call(`${buyer}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await call(`${seller}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("purchased");
    return { repoId, seller, buyer, purchasePrice, qty: Math.ceil((purchasePrice * 1.02) / PRICE_TUST) };
  };

  for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const repos = [await open(SERVICE.A, SERVICE.B, 5_000_000), await open(SERVICE.B, SERVICE.A, 1_000_000), await open(SERVICE.B, SERVICE.A, 500_000)];

  let repurchased = 0;
  try {
    const fallen = 88.4;
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(fallen) });
    await feedIs(fallen);
    await expect.poll(async () => Number((await margin(SERVICE.B)).callableUsd), { timeout: 30_000 }).toBeGreaterThan(0);
    const next = repos.map((r) => Math.round((r.qty * fallen) / 1.02));
    const differences = repos.map((r, i) => r.purchasePrice - next[i]);
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    await call(`${SERVICE.B}/repo-margin/reprice`, "POST", {});
    await expect.poll(async () => (await margin(SERVICE.A)).repriceToAgree, { timeout: 30_000 }).toBe(3);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd);
    const { repos: agreed } = await call<{ repos: unknown[] }>(`${SERVICE.A}/repo-margin/reprice/agree`, "POST", {});
    expect(agreed.length).toBe(3);

    for (const [i, r] of repos.entries()) {
      for (const svc of [SERVICE.A, SERVICE.B]) {
        await expect.poll(async () => (await repo(svc, r.repoId))?.purchasePrice, { timeout: 30_000 }).toBe(String(next[i]));
        await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      }
    }
    const net = BigInt(differences[1] + differences[2] - differences[0]);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + net);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - net);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await margin(svc)).repriceOffered + (await margin(svc)).repriceToAgree, { timeout: 30_000 }).toBe(0);
      const m = await margin(svc);
      expect(m.callableUsd).toBe("0");
      expect(Math.abs(Number(m.netExposureUsd))).toBeLessThan(4);
    }
  } finally {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(PRICE_TUST) });
    await feedIs(PRICE_TUST);
    const due = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA");
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: due });
    // The repos B sold come back first: on a fresh deployment B holds only the tUST it bought and has delivered part of it.
    for (const r of [...repos].reverse()) {
      await call(`${r.seller}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await call(`${r.buyer}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await expect.poll(async () => (await repo(r.seller, r.repoId))?.state, { timeout: 30_000 }).toBe("repurchased");
      repurchased++;
    }
    for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: today });
    expect(repurchased).toBe(3);
  }
});

// --- flow-repo-adjustment ---
// An adjustment instead of a margin call (wp-adr-repo-adjustment): two days into the repo the securities fall, B offers an
// adjustment in its console and A agrees in its console. A delivers more securities and pays the accrued Price Differential.
const repoAdjustFixture = async () => {
  const p = await parties();
  const tUST = p.tokens.tUST, tUSD = p.tokens.tUSD;
  const today = new Date().toLocaleDateString("en-CA");
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA");
  type MarginView = RepoMargin & { adjustOffered: number; adjustToAgree: number };
  type RepoRow = { repoId: string; state: string; purchasePrice: string; repurchasePrice: string; quantity: string; verified: boolean };
  const margin = (svc: string) => call<MarginView>(`${svc}/repo-margin`);
  const repo = async (svc: string, id: string) => (await call<{ repos: RepoRow[] }>(`${svc}/repos`)).repos.find((r) => r.repoId === id);
  const setDate = async (d: string) => { for (const svc of [SERVICE.A, SERVICE.B]) await call(`${svc}/business-date`, "POST", { businessDate: d }); };
  const setPrice = async (price: number) => {
    await call(`${ORACLE}/market-data/tUST`, "PUT", { price: String(price) });
    for (const gw of [GATEWAY.A, GATEWAY.B]) {
      await expect.poll(async () => (await call<{ price: string | null }>(`${gw}/prices/${tUST}`)).price, { timeout: 30_000 })
        .toBe(String(BigInt(Math.round(price * 100)) * 1_000_000n));
    }
  };
  const open = async (seller: string, buyer: string, purchasePrice: number) => {
    const { repoId } = await call<{ repoId: string }>(`${seller}/repos`, "POST", { security: "tUST", purchasePrice, ratePercent: "4.5", termDays: 7, marginRatio: null });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("booked");
    await call(`${buyer}/repos/${repoId}/affirm`, "POST", {});
    await expect.poll(async () => (await repo(seller, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
    await call(`${buyer}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await call(`${seller}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await expect.poll(async () => (await repo(buyer, repoId))?.state, { timeout: 30_000 }).toBe("purchased");
    return { repoId, seller, buyer, purchasePrice, qty: Math.ceil((purchasePrice * 1.02) / PRICE_TUST) };
  };
  const close = async (repos: { repoId: string; seller: string; buyer: string }[]) => {
    await setPrice(PRICE_TUST);
    await setDate(inDays(7));
    let done = 0;
    // The repos B sold come back first: on a fresh deployment B holds only the tUST it bought and has delivered part of it.
    for (const r of [...repos].reverse()) {
      await call(`${r.seller}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await call(`${r.buyer}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
      await expect.poll(async () => (await repo(r.seller, r.repoId))?.state, { timeout: 30_000 }).toBe("repurchased");
      done++;
    }
    await setDate(today);
    return done;
  };
  return { p, tUST, tUSD, today, inDays, margin, repo, setDate, setPrice, open, close };
};

test("flow-repo-adjustment: the securities fall -> the buyer offers an adjustment -> the seller agrees, delivers more securities and pays the accrued amount -> no exposure remains -> repurchase of the new quantity", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, margin, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const r = await open(SERVICE.A, SERVICE.B, 3_000_000);
  let done = 0;
  try {
    await setDate(inDays(2));
    const fallen = 88.4;
    await setPrice(fallen);
    await expect.poll(async () => Number((await margin(SERVICE.B)).callableUsd), { timeout: 30_000 }).toBeGreaterThan(0);
    const newQty = Math.ceil(3_060_000 / fallen);
    const accrued = Math.round((3_000_000 * 0.045 * 2) / 360);
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b), bUst = await balanceOf(GATEWAY.B, tUST, p.b), aUst = await balanceOf(GATEWAY.A, tUST, p.a);

    await page.goto("/#/live/B");
    const cardB = page.getByTestId("repo-margin");
    await cardB.getByRole("button", { name: "Adjust open repos with A" }).click({ timeout: STEP_TIMEOUT });
    await expect(cardB.getByTestId("repo-adjust-offered")).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await margin(SERVICE.A)).adjustToAgree, { timeout: 30_000 }).toBe(1);
    await expect(call(`${SERVICE.B}/repo-margin/calls`, "POST", {})).rejects.toThrow("still pending");
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst);

    await page.goto("/#/live/A");
    const cardA = page.getByTestId("repo-margin");
    await cardA.getByRole("button", { name: "Agree adjustment with B: 1 repo(s)" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, r.repoId))?.quantity, { timeout: 30_000 }).toBe(String(newQty));

    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst + BigInt(newQty - r.qty));
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst - BigInt(newQty - r.qty));
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - BigInt(accrued));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + BigInt(accrued));
    // 4.5% on the unchanged Purchase Price for the 5 days from the adjustment date to the Repurchase Date.
    const newRepurchasePrice = Math.round(3_000_000 + (3_000_000 * 0.045 * 5) / 360);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      const row = (await repo(svc, r.repoId))!;
      expect(row.purchasePrice).toBe("3000000");
      expect(row.repurchasePrice).toBe(String(newRepurchasePrice));
      const m = await margin(svc);
      expect(m.adjustOffered + m.adjustToAgree).toBe(0);
      expect(m.callableUsd).toBe("0");
      expect(Math.abs(Number(m.netExposureUsd))).toBeLessThan(fallen);
    }
  } finally {
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    done = await close([r]);
    const paid = aUsdBefore - await balanceOf(GATEWAY.A, tUSD, p.a);
    expect(paid).toBe(BigInt(Math.round(3_000_000 + (3_000_000 * 0.045 * 5) / 360)));
    expect(done).toBe(1);
  }
});

// Every open repo in both directions: B, the proposer, delivers securities on two repos, so its one allowance must cover both.
test("flow-repo-adjustment: every open repo in both directions is adjusted -> the proposer's two deliveries and the agreeing party's one settle -> the Net Exposure is gone", async () => {
  test.setTimeout(TEST_TIMEOUT * 3);
  const { p, tUST, tUSD, today, inDays, margin, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  expect((await margin(SERVICE.B)).exposures).toEqual([]);
  const repos = [await open(SERVICE.A, SERVICE.B, 5_000_000), await open(SERVICE.B, SERVICE.A, 1_000_000), await open(SERVICE.B, SERVICE.A, 500_000)];
  let done = 0;
  try {
    await setDate(inDays(2));
    const fallen = 88.4;
    await setPrice(fallen);
    await expect.poll(async () => Number((await margin(SERVICE.B)).callableUsd), { timeout: 30_000 }).toBeGreaterThan(0);
    const next = repos.map((r) => Math.ceil((r.purchasePrice * 1.02) / fallen));
    const delta = repos.map((r, i) => next[i] - r.qty);
    const accrued = repos.map((r) => Math.round((r.purchasePrice * 0.045 * 2) / 360));
    const aUst = await balanceOf(GATEWAY.A, tUST, p.a), aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repo-margin/adjust`, "POST", {});
    await expect.poll(async () => (await margin(SERVICE.A)).adjustToAgree, { timeout: 30_000 }).toBe(3);
    const { repos: settled } = await call<{ repos: unknown[] }>(`${SERVICE.A}/repo-margin/adjust/agree`, "POST", {});
    expect(settled.length).toBe(3);
    for (const [i, r] of repos.entries()) {
      for (const svc of [SERVICE.A, SERVICE.B]) {
        await expect.poll(async () => (await repo(svc, r.repoId))?.quantity, { timeout: 30_000 }).toBe(String(next[i]));
        await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      }
    }
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst + BigInt(delta[1] + delta[2] - delta[0]));
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + BigInt(accrued[1] + accrued[2] - accrued[0]));
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => { const m = await margin(svc); return m.adjustOffered + m.adjustToAgree; }, { timeout: 30_000 }).toBe(0);
      expect((await margin(svc)).callableUsd).toBe("0");
    }
  } finally {
    done = await close(repos);
    expect(done).toBe(3);
  }
});

// --- flow-repo-substitution ---
// The Seller replaces the securities of one purchased repo (wp-adr-repo-substitution): A asks to substitute tMMF for tUST in
// its console and B agrees in its console. Both securities move in one transaction and no cash moves.
const scaledPrice = async (token: string) => BigInt((await call<{ price: string }>(`${GATEWAY.A}/prices/${token}`)).price);
const substituteQuantity = (qty: number, price: bigint, substitutePrice: bigint) => {
  const value = BigInt(qty) * price;
  return Number(value / substitutePrice + (value % substitutePrice === 0n ? 0n : 1n));
};

test("flow-repo-substitution: the seller requests tMMF for tUST -> the buyer agrees -> both securities move and no cash -> the seller repurchases the tMMF at the original price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  const tMMF = p.tokens.tMMF;
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const expectedRepurchase = (await repo(SERVICE.A, r.repoId))!.repurchasePrice;
  let done = 0;
  try {
    await setDate(inDays(2));
    const newQty = substituteQuantity(r.qty, await scaledPrice(tUST), await scaledPrice(tMMF));
    const aUst = await balanceOf(GATEWAY.A, tUST, p.a), bUst = await balanceOf(GATEWAY.B, tUST, p.b), aMmf = await balanceOf(GATEWAY.A, tMMF, p.a), bMmf = await balanceOf(GATEWAY.B, tMMF, p.b), aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByRole("button", { name: "Substitute tMMF" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-substitution-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(call(`${SERVICE.A}/repo-margin/calls`, "POST", {})).rejects.toThrow();
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByRole("button", { name: `Agree substitution by ${newQty.toLocaleString("en-US")} tMMF` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, r.repoId))?.quantity, { timeout: 30_000 }).toBe(String(newQty));

    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst + BigInt(r.qty));
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst - BigInt(r.qty));
    expect(await balanceOf(GATEWAY.A, tMMF, p.a)).toBe(aMmf - BigInt(newQty));
    expect(await balanceOf(GATEWAY.B, tMMF, p.b)).toBe(bMmf + BigInt(newQty));
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
      const row = (await repo(svc, r.repoId))! as unknown as { security: string; purchasePrice: string; repurchasePrice: string };
      expect(row.security).toBe("tMMF");
      expect(row.purchasePrice).toBe("1000000");
      expect(row.repurchasePrice).toBe(expectedRepurchase);
    }
  } finally {
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a), aMmfBefore = await balanceOf(GATEWAY.A, tMMF, p.a);
    done = await close([r]);
    expect(aUsdBefore - await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(BigInt(expectedRepurchase));
    expect(await balanceOf(GATEWAY.A, tMMF, p.a)).toBeGreaterThan(aMmfBefore);
    expect(done).toBe(1);
  }
});

test("flow-repo-substitution: the buyer refuses -> nothing moves and the repo is unchanged -> a request at other feed prices is not agreed", async () => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 500_000);
  let done = 0;
  try {
    await setDate(inDays(1));
    const aUst = await balanceOf(GATEWAY.A, tUST, p.a), bUst = await balanceOf(GATEWAY.B, tUST, p.b);
    await call(`${SERVICE.A}/repos/${r.repoId}/substitute`, "POST", { security: "tMMF" });
    await expect.poll(async () => ((await repo(SERVICE.B, r.repoId)) as unknown as { substitutionPending?: string }).substitutionPending, { timeout: 30_000 }).toBe("toDecide");
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/substitute`, "POST", { security: "tMMF" })).rejects.toThrow("only the Seller");
    await call(`${SERVICE.B}/repos/${r.repoId}/substitute/refuse`, "POST", {});
    await expect.poll(async () => ((await repo(SERVICE.A, r.repoId)) as unknown as { substitutionPending?: string }).substitutionPending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aUst);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bUst);
    expect((await repo(SERVICE.A, r.repoId))!.quantity).toBe(String(r.qty));

    // The Buyer's service rebuilds the event from the feed: after the price moves, the earlier request is not the one it builds.
    await call(`${SERVICE.A}/repos/${r.repoId}/substitute`, "POST", { security: "tMMF" });
    await expect.poll(async () => ((await repo(SERVICE.B, r.repoId)) as unknown as { substitutionPending?: string }).substitutionPending, { timeout: 30_000 }).toBe("toDecide");
    await setPrice(PRICE_TUST - 3);
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/substitute/agree`, "POST", {})).rejects.toThrow("is not the one this service builds");
    await call(`${SERVICE.B}/repos/${r.repoId}/substitute/refuse`, "POST", {});
  } finally {
    done = await close([r]);
    expect(done).toBe(1);
  }
});

// --- flow-repo-income ---
// Interim interest and manufactured income (wp-adr-repo-income). The Seller pays accrued interest and the Repurchase Price
// falls; the Buyer enters income on the securities and the Seller agrees.
type PaymentRow = { interimPending?: string; incomePending?: string; repurchasePrice: string; quantity: string; verified: boolean };

test("flow-repo-income: the seller pays accrued interest -> the buyer agrees -> the Repurchase Price falls by it -> the seller repurchases at the lower price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const fullRepurchase = Number((await repo(SERVICE.A, r.repoId))!.repurchasePrice);
  const accrued = Math.round((1_000_000 * 0.045 * 2) / 360);
  let done = 0;
  try {
    await setDate(inDays(2));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByRole("button", { name: "Pay accrued interest" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-payment-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByRole("button", { name: `Agree interim interest USD ${accrued}` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await repo(SERVICE.A, r.repoId))?.repurchasePrice, { timeout: 30_000 }).toBe(String(fullRepurchase - accrued));

    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - BigInt(accrued));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + BigInt(accrued));
    for (const svc of [SERVICE.A, SERVICE.B]) await expect.poll(async () => (await repo(svc, r.repoId))?.verified, { timeout: 30_000 }).toBe(true);
    // Nothing further has accrued on the same day.
    await expect(call(`${SERVICE.A}/repos/${r.repoId}/interim-interest`, "POST", {})).rejects.toThrow("no Price Differential");
  } finally {
    const aUsdBefore = await balanceOf(GATEWAY.A, tUSD, p.a);
    done = await close([r]);
    expect(aUsdBefore - await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(BigInt(fullRepurchase - accrued));
    expect(done).toBe(1);
  }
});

test("flow-repo-income: the buyer enters income -> the seller agrees and is paid -> a second payment of the same document fails -> a refused payment moves nothing", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const pending = async (svc: string) => (await repo(svc, r.repoId)) as unknown as PaymentRow;
  const repurchase = (await repo(SERVICE.A, r.repoId))!.repurchasePrice;
  const amount = Math.round(r.qty * 1.25);
  let done = 0;
  try {
    await setDate(inDays(2));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByLabel("Income per unit").fill("1.25");
    await rowB.getByLabel("Income date").fill(inDays(2));
    await rowB.getByRole("button", { name: "Pay income" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowB.getByTestId(`repo-payment-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByRole("button", { name: `Agree income USD ${amount}` }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => balanceOf(GATEWAY.A, tUSD, p.a), { timeout: 30_000 }).toBe(aUsd + BigInt(amount));
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - BigInt(amount));
    expect((await repo(SERVICE.A, r.repoId))!.repurchasePrice).toBe(repurchase);
    await expect.poll(async () => (await pending(SERVICE.A)).incomePending, { timeout: 30_000 }).toBeUndefined();

    // The same document cannot be paid twice.
    const income = { incomePerUnit: "1.25", incomeDate: inDays(2) };
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/income`, "POST", income)).rejects.toThrow();

    // The income date must be within the term.
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/income`, "POST", { incomePerUnit: "1", incomeDate: inDays(30) })).rejects.toThrow("outside");

    // A refusal moves nothing and clears the request.
    const aAfter = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repos/${r.repoId}/income`, "POST", { incomePerUnit: "2", incomeDate: inDays(3) });
    await expect.poll(async () => (await pending(SERVICE.A)).incomePending, { timeout: 30_000 }).toBe("toDecide");
    await expect(call(`${SERVICE.A}/repo-margin/calls`, "POST", {})).rejects.toThrow();
    await call(`${SERVICE.A}/repos/${r.repoId}/income/refuse`, "POST", {});
    await expect.poll(async () => (await pending(SERVICE.B)).incomePending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aAfter);
  } finally {
    done = await close([r]);
    expect(done).toBe(1);
  }
});
