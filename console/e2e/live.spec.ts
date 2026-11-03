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
async function pledgeThroughServices(amountUsd: number, qty: number): Promise<string> {
  const { callId } = await call<{ callId: string }>(`${SERVICE.B}/calls`, "POST", { kind: "IM", toParty: "A", amountUsd, deadlineDays: 1 });
  await call(`${SERVICE.A}/calls/${callId}/response`, "POST", { response: "full" });
  const { proposalId } = await call<{ proposalId: number }>(`${SERVICE.A}/calls/${callId}/proposal`, "POST", { assets: [{ token: "tUST", qty }] });
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
  type Fold = { converged: boolean; totalSteps: number; stateHash: string };
  let a: Fold | undefined, b: Fold | undefined;
  await expect
    .poll(async () => {
      a = await call<Fold>(`${SERVICE.A}/calls/${callId}/cdm-state`);
      b = await call<Fold>(`${SERVICE.B}/calls/${callId}/cdm-state`);
      return a.converged && b.converged && a.totalSteps === b.totalSteps && a.stateHash === b.stateHash;
    }, { timeout: 60_000 })
    .toBe(true);
  expect(a!.stateHash).toMatch(/^0x[0-9a-f]{64}$/i);
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
