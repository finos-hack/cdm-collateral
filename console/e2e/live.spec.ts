import { expect, test } from "@playwright/test";

// Live end-to-end test for flow-im-margin-call-pledge driven through the two wired party consoles (route #/live/A,
// #/live/B) against the running stack: collateral services (8001/8002) -> ledger gateways (8201/8202) -> Besu.
// Unlike the mock scenario specs, this requires the backend stack to be up (orchestrate.mjs / README). A unique
// call amount per run identifies this cycle's call among any left on the persistent chain by earlier runs.
const PRICE_TUST = 98.4;
const HAIRCUT = 0.98;

test("flow-im-margin-call-pledge: issue -> agree -> propose -> accept -> pledge, settled on-chain", async ({ page }) => {
  const amountUsd = 1_000_000 + (Date.now() % 90) * 100_000; // unique-ish, multiple of 100k, above the MTA
  const label = `USD ${amountUsd.toLocaleString("en-US")}`;
  const qty = Math.ceil(amountUsd / (PRICE_TUST * HAIRCUT) / 1000) * 1000 + 1000; // cover agreed amount after haircut

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Secured party (BANK-B) issues the IM call.
  await page.goto("/#/live/B");
  const issueCard = page.locator(".card", { hasText: "Issue initial-margin call" });
  await issueCard.getByRole("spinbutton").fill(String(amountUsd));
  await issueCard.getByRole("button", { name: /Issue IM call/ }).click();

  // 2. Pledgor (BANK-A) agrees in full.
  await page.goto("/#/live/A");
  const rowA = page.locator(".subcard", { hasText: label });
  await expect(rowA).toBeVisible({ timeout: 15_000 });
  await rowA.getByRole("button", { name: "Agree in full" }).click();

  // 3. Pledgor proposes tUST collateral.
  await expect(rowA.getByRole("button", { name: "Propose collateral" })).toBeVisible({ timeout: 15_000 });
  await rowA.getByRole("spinbutton").fill(String(qty));
  await rowA.getByRole("button", { name: "Propose collateral" }).click();
  await expect(rowA.getByText(/proposal \d+: proposed/)).toBeVisible({ timeout: 15_000 });

  // 4. Secured party accepts the proposal.
  await page.goto("/#/live/B");
  const rowB = page.locator(".subcard", { hasText: label });
  await expect(rowB.getByRole("button", { name: "Accept proposal" })).toBeVisible({ timeout: 15_000 });
  await rowB.getByRole("button", { name: "Accept proposal" }).click();

  // 5. Pledgor pledges the accepted collateral.
  await page.goto("/#/live/A");
  const rowA2 = page.locator(".subcard", { hasText: label });
  await expect(rowA2.getByRole("button", { name: "Pledge accepted collateral" })).toBeVisible({ timeout: 15_000 });
  await rowA2.getByRole("button", { name: "Pledge accepted collateral" }).click();

  // The call is now settled on-chain, shown in both consoles.
  await expect(rowA2.getByText("settled on-chain ✓")).toBeVisible({ timeout: 15_000 });
  await page.goto("/#/live/B");
  await expect(page.locator(".subcard", { hasText: label }).getByText("settled on-chain ✓")).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
