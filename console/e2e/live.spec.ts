import { expect, test } from "@playwright/test";

// Live end-to-end test for flow-im-margin-call-pledge driven through the two wired party consoles (route #/live/A,
// #/live/B) against the running stack: collateral services (8001/8002) -> ledger gateways (8201/8202) -> Besu.
// Unlike the mock scenario specs, this requires the backend stack to be up (orchestrate.mjs / README). A unique
// call amount per run identifies this cycle's call among any left on the persistent chain by earlier runs.
//
// The stack is not started by Playwright's webServer, so these tests are skipped when the collateral service is
// unreachable (e.g. CI, which runs only the mock scenario specs). Start the stack with orchestrate.mjs to run them.
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
async function waitForSettledOnChain(kind: "IM" | "VM", amountUsd: number) {
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
