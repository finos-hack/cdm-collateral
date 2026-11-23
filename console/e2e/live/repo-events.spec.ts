import { expect, test } from "@playwright/test";
import {
  PRICE_TUST,
  TEST_TIMEOUT,
  STEP_TIMEOUT,
  SERVICE,
  GATEWAY,
  call,
  shortId,
  balanceOf,
  ORACLE,
  repoAdjustFixture,
  PaymentRow,
  RollRow,
  PairOffRow,
  BsbRow,
  CloseOutStatementView,
  RepoDefaultView,
  otherTransactions,
  liveStackGate,
} from "./harness";

// Live specs of the repo-events module (task-live-suite-modules); shared helpers are in ./harness.ts. Each module runs on its
// own stack in e2e-live-stack.yml, so the specs of one file run in order on one chain.
liveStackGate();

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

test("flow-repo-roll: the seller proposes a roll on the Repurchase Date -> the buyer agrees -> the seller pays the interest, the securities stay -> the repo repurchases on the new date at the new rate", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const row = async (svc: string) => (await repo(svc, r.repoId)) as unknown as RollRow;
  const settleRepurchase = async () => {
    const cur = await row(SERVICE.A);
    if (cur.state === "repurchased") return;
    await setDate(cur.repurchaseDate);
    await call(`${SERVICE.A}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${r.repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await row(SERVICE.A)).state, { timeout: 30_000 }).toBe("repurchased");
  };
  try {
    await setDate(inDays(7));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    const aSec = await balanceOf(GATEWAY.A, tUST, p.a), bSec = await balanceOf(GATEWAY.B, tUST, p.b);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r.repoId}`);
    await rowA.getByLabel("New Repurchase Date").fill(inDays(14));
    await rowA.getByLabel("Roll rate (%)").fill("5");
    await rowA.getByRole("button", { name: "Roll repo" }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-roll-${r.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${r.repoId}`);
    await rowB.getByRole("button", { name: `Agree roll to ${inDays(14)} at 5%` }).click({ timeout: STEP_TIMEOUT });
    // 1,000,000 x 5% x 7 / 360 = 972.22
    await expect.poll(async () => (await row(SERVICE.A)).repurchasePrice, { timeout: 30_000 }).toBe("1000972");

    // 1,000,000 x 4.5% x 7 / 360 = 875
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - 875n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + 875n);
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aSec);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bSec);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      await expect.poll(async () => (await row(svc)).verified, { timeout: 30_000 }).toBe(true);
      expect((await row(svc)).repurchaseDate).toBe(inDays(14));
      expect((await row(svc)).rollPending).toBeUndefined();
    }

    const before = await balanceOf(GATEWAY.A, tUSD, p.a);
    await settleRepurchase();
    expect(before - await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(1_000_972n);
  } finally {
    await settleRepurchase();
    await setDate(today);
  }
});

test("flow-repo-roll: a roll needs the Repurchase Date -> the buyer proposes -> the seller refuses and nothing moves -> the repo repurchases at the original price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const row = async (svc: string) => (await repo(svc, r.repoId)) as unknown as RollRow;
  const roll = { newRepurchaseDate: inDays(14), ratePercent: "4.5" };
  let done = 0;
  try {
    await setDate(inDays(2));
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/roll`, "POST", roll)).rejects.toThrow("only on its Repurchase Date");

    await setDate(inDays(7));
    await expect(call(`${SERVICE.B}/repos/${r.repoId}/roll`, "POST", { ...roll, newRepurchaseDate: inDays(7) })).rejects.toThrow("not after");
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repos/${r.repoId}/roll`, "POST", roll);
    await expect.poll(async () => (await row(SERVICE.A)).rollPending, { timeout: 30_000 }).toBe("toDecide");
    await expect(call(`${SERVICE.A}/repos/${r.repoId}/roll`, "POST", roll)).rejects.toThrow("agree or refuse");

    await page.goto("/#/live/A");
    await page.getByTestId(`repo-${r.repoId}`).getByRole("button", { name: "Refuse roll" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await row(SERVICE.B)).rollPending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    expect((await row(SERVICE.A)).repurchasePrice).toBe("1000875");
  } finally {
    done = await close([r]);
    expect(done).toBe(1);
  }
});

test("flow-repo-pair-off: A sells to B and B sells the same securities back -> on the Repurchase Date A proposes the pair-off -> B agrees -> both repos close, no securities move, A pays only the net", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000); // 4.5%: Repurchase Price 1,000,875
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4"); // 4%: Repurchase Price 1,000,778
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as PairOffRow;
  let paired = false;
  try {
    await setDate(inDays(7));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    const aSec = await balanceOf(GATEWAY.A, tUST, p.a), bSec = await balanceOf(GATEWAY.B, tUST, p.b);

    await page.goto("/#/live/A");
    const rowA = page.getByTestId(`repo-${r1.repoId}`);
    await rowA.getByRole("button", { name: `Pair off with ${shortId(r2.repoId)}` }).click({ timeout: STEP_TIMEOUT });
    await expect(rowA.getByTestId(`repo-pairoff-${r1.repoId}`)).toBeVisible({ timeout: STEP_TIMEOUT });
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    await expect.poll(async () => (await row(SERVICE.B, r2.repoId)).pairOffPending, { timeout: 30_000 }).toBe("toDecide");
    expect((await row(SERVICE.B, r2.repoId)).pairOffNet).toBe("97");

    await page.goto("/#/live/B");
    await page.getByTestId(`repo-${r2.repoId}`).getByRole("button", { name: /^Agree pair-off with .*, receive/ }).click({ timeout: STEP_TIMEOUT });
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await row(SERVICE.A, id)).state, { timeout: 30_000 }).toBe("repurchased");
    paired = true;

    // 1,000,875 - 1,000,778 = 97 from A (the Seller of the repo with the higher Repurchase Price) to B.
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - 97n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + 97n);
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aSec);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bSec);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      const one = await row(svc, r1.repoId), two = await row(svc, r2.repoId);
      expect(one.verified && two.verified).toBe(true);
      expect(one.repurchaseHash).toBe(two.repurchaseHash);
      expect(one.pairOffPending).toBeUndefined();
      // Each service rebuilds the anchored pair-off from the trades it holds and reports the closed trade.
      for (const id of [r1.repoId, r2.repoId])
        expect((await call<{ closedState: string }>(`${svc}/repos/${id}/trade`)).closedState).toBe("Terminated");
    }
  } finally {
    if (!paired) await close([r1, r2]);
    await setDate(today);
  }
});

test("flow-repo-pair-off: only on the common Repurchase Date -> B proposes -> A refuses and nothing moves -> both repos repurchase normally", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setPrice(PRICE_TUST);
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000);
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4");
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as PairOffRow;
  let done = 0;
  try {
    await setDate(inDays(2));
    await expect(call(`${SERVICE.B}/repos/${r2.repoId}/pair-off`, "POST", { otherRepoId: r1.repoId })).rejects.toThrow("common Repurchase Date");

    await setDate(inDays(7));
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a);
    await call(`${SERVICE.B}/repos/${r2.repoId}/pair-off`, "POST", { otherRepoId: r1.repoId });
    await expect.poll(async () => (await row(SERVICE.A, r1.repoId)).pairOffPending, { timeout: 30_000 }).toBe("toDecide");
    expect((await row(SERVICE.A, r1.repoId)).pairOffNet).toBe("-97");
    await expect(call(`${SERVICE.A}/repos/${r1.repoId}/pair-off`, "POST", { otherRepoId: r2.repoId })).rejects.toThrow("agree or refuse");

    await page.goto("/#/live/A");
    await page.getByTestId(`repo-${r1.repoId}`).getByRole("button", { name: "Refuse pair-off" }).click({ timeout: STEP_TIMEOUT });
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await row(SERVICE.B, id)).pairOffPending, { timeout: 30_000 }).toBeUndefined();
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    expect((await row(SERVICE.A, r1.repoId)).state).toBe("purchased");
  } finally {
    done = await close([r1, r2]);
    expect(done).toBe(2);
  }
});

test("flow-repo-buy-sell-back: A books a buy/sell-back in the console -> B affirms -> purchase -> B enters income -> A agrees, no cash moves and the Sell Back Price falls -> sell-back at the lower price", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as BsbRow;
  const before = new Set((await call<{ repos: { repoId: string }[] }>(`${SERVICE.A}/repos`)).repos.map((r) => r.repoId));

  await page.goto("/#/live/A");
  const card = page.getByTestId("repos");
  await card.getByLabel("Repo type").selectOption("bsb");
  await card.getByRole("button", { name: "Book buy/sell-back: sell to B" }).click({ timeout: STEP_TIMEOUT });
  let repoId = "";
  await expect.poll(async () => {
    const fresh = (await call<{ repos: BsbRow[] }>(`${SERVICE.A}/repos`)).repos.find((r) => !before.has(r.repoId) && r.buySellBack);
    repoId = fresh?.repoId ?? "";
    return repoId;
  }, { timeout: 30_000 }).not.toBe("");
  const r = { repoId, seller: SERVICE.A, buyer: SERVICE.B };
  let done = false;
  try {
    await expect.poll(async () => (await row(SERVICE.B, repoId))?.state, { timeout: 30_000 }).toBe("booked");
    expect((await row(SERVICE.B, repoId)).buySellBack).toBe(true);
    await call(`${SERVICE.B}/repos/${repoId}/affirm`, "POST", {});
    await expect.poll(async () => (await row(SERVICE.A, repoId))?.state, { timeout: 30_000 }).toBe("affirmed");
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "purchase" });
    await expect.poll(async () => (await row(SERVICE.B, repoId))?.state, { timeout: 30_000 }).toBe("purchased");
    await expect(page.getByTestId(`repo-${repoId}`)).toContainText("buy/sell-back · seller", { timeout: STEP_TIMEOUT });
    // No interim interest on a buy/sell-back: the forward price is fixed at trade.
    await expect(page.getByTestId(`repo-${repoId}`).getByRole("button", { name: "Pay accrued interest" })).toHaveCount(0);
    await expect(call(`${SERVICE.A}/repos/${repoId}/interim-interest`, "POST", {})).rejects.toThrow("no interim interest");

    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    // B, the Buyer, enters income of 0.5 per unit three days in: 10,366 x 0.5 = 5,183, plus 5,183 x 4.5% x 4 / 360 = 2.59.
    await page.goto("/#/live/B");
    const rowB = page.getByTestId(`repo-${repoId}`);
    await rowB.getByLabel("Income per unit").fill("0.5");
    await rowB.getByLabel("Income date").fill(inDays(3));
    await rowB.getByRole("button", { name: "Enter income" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await row(SERVICE.A, repoId)).incomePending, { timeout: 30_000 }).toBe("toDecide");

    await page.goto("/#/live/A");
    await page.getByTestId(`repo-${repoId}`).getByRole("button", { name: "Agree income USD 5183, sell-back price lower by USD 5,186" }).click({ timeout: STEP_TIMEOUT });
    await expect.poll(async () => (await row(SERVICE.B, repoId)).incomeDeduction, { timeout: 30_000 }).toBe("5186");
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd);
    const agreed = await row(SERVICE.A, repoId);
    expect(agreed.repurchasePrice).toBe("1000875");
    expect(agreed.sellBackPrice).toBe("995689");
    await expect(page.getByTestId(`repo-price-${repoId}`)).toContainText("sell back USD 995,689", { timeout: STEP_TIMEOUT });

    // The sell-back on the Repurchase Date: the Seller pays 1,000,875 - 5,186.
    await setDate(inDays(7));
    await call(`${SERVICE.A}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await call(`${SERVICE.B}/repos/${repoId}/settle`, "POST", { phase: "repurchase" });
    await expect.poll(async () => (await row(SERVICE.A, repoId)).state, { timeout: 30_000 }).toBe("repurchased");
    done = true;
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd - 995_689n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd + 995_689n);
    for (const svc of [SERVICE.A, SERVICE.B]) {
      expect((await row(svc, repoId)).verified).toBe(true);
      expect((await call<{ closedState: string }>(`${svc}/repos/${repoId}/trade`)).closedState).toBe("Terminated");
    }
  } finally {
    if (!done) await close([r]);
    await setDate(today);
  }
});

test("flow-repo-buy-sell-back: two offsetting buy/sell-backs pair off on the Repurchase Date, netting the Sell Back Prices -> a buy/sell-back does not pair off with a repo", async () => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  await setDate(today);
  await setPrice(PRICE_TUST);
  const row = async (svc: string, id: string) => (await repo(svc, id)) as unknown as BsbRow;
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000, "4.5", true); // Repurchase Price 1,000,875
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4", true); // Repurchase Price 1,000,778
  const r3 = await open(SERVICE.A, SERVICE.B, 1_000_000, "4.5"); // a repo, A sells again
  let paired = false;
  try {
    // Income on r1 lowers its Sell Back Price by 5,186 to 995,689.
    await call(`${SERVICE.B}/repos/${r1.repoId}/income`, "POST", { incomePerUnit: "0.5", incomeDate: inDays(3) });
    await expect.poll(async () => (await row(SERVICE.A, r1.repoId)).incomePending, { timeout: 30_000 }).toBe("toDecide");
    await call(`${SERVICE.A}/repos/${r1.repoId}/income/agree`, "POST", {});
    await expect.poll(async () => (await row(SERVICE.B, r1.repoId)).incomeDeduction, { timeout: 30_000 }).toBe("5186");

    await setDate(inDays(7));
    // r2 (a buy/sell-back B sells) and r3 (a repo A sells) offset in all but type.
    await expect(call(`${SERVICE.B}/repos/${r2.repoId}/pair-off`, "POST", { otherRepoId: r3.repoId })).rejects.toThrow("do not offset");

    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);
    await call(`${SERVICE.A}/repos/${r1.repoId}/pair-off`, "POST", { otherRepoId: r2.repoId });
    // 995,689 against 1,000,778: B, the Seller of r2, pays A 5,089.
    await expect.poll(async () => (await row(SERVICE.B, r2.repoId)).pairOffPending, { timeout: 30_000 }).toBe("toDecide");
    expect((await row(SERVICE.B, r2.repoId)).pairOffNet).toBe("-5089");
    await call(`${SERVICE.B}/repos/${r2.repoId}/pair-off/agree`, "POST", {});
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await row(SERVICE.A, id)).state, { timeout: 30_000 }).toBe("repurchased");
    paired = true;
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + 5_089n);
    expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - 5_089n);
    for (const svc of [SERVICE.A, SERVICE.B])
      for (const id of [r1.repoId, r2.repoId])
        expect((await call<{ closedState: string }>(`${svc}/repos/${id}/trade`)).closedState).toBe("Terminated");
  } finally {
    expect(await close(paired ? [r3] : [r1, r2, r3])).toBe(paired ? 1 : 3);
    await setDate(today);
  }
});

test("flow-repo-default-close-out: B declares A's default in the console -> Default Notice -> every purchased repo of the pair closes out, no securities move -> the party owing the net balance pays it", async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT * 2);
  const { p, tUST, tUSD, today, inDays, repo, setDate, setPrice, open, close } = await repoAdjustFixture();
  const view = (svc: string) => call<RepoDefaultView>(`${svc}/repo-default`);
  const aWasInDefault = (await call<{ inDefault: boolean }>(`${GATEWAY.B}/defaults/${p.a}`)).inDefault;
  expect((await call<{ inDefault: boolean }>(`${GATEWAY.A}/defaults/${p.b}`)).inDefault).toBe(false);
  await setDate(today);
  await setPrice(PRICE_TUST);
  const r1 = await open(SERVICE.A, SERVICE.B, 1_000_000, "4.5"); // a repo A sells to B
  const r2 = await open(SERVICE.B, SERVICE.A, 1_000_000, "4", true); // a buy/sell-back B sells to A
  let closedOut = false;
  try {
    await setDate(inDays(3));
    const before = await view(SERVICE.B);
    expect(before.inDefault).toBe(false);
    expect(before.automaticEarlyTermination).toBe(false); // the baseline GMRA elections: a Default Notice is served
    const preview = before.preview!;
    const value = (s: CloseOutStatementView, id: string) => s.transactions.find((t) => t.repoId === id)!;
    // As at the Early Termination Date, three days in: 1,000,000 + 375 at 4.5% and + 333 at 4%; 10,366 tUST at 98.4.
    expect(value(preview, r1.repoId)).toMatchObject({ buySellBack: false, repurchasePrice: "1000375", defaultMarketValue: "1020014" });
    expect(value(preview, r2.repoId)).toMatchObject({ buySellBack: true, repurchasePrice: "1000333", defaultMarketValue: "1020014" });
    // From B's side r1 gives -19,639 and r2 +19,681; margin held between the pair, if any, is owed back by its holder.
    const margin = preview.heldMargin.reduce((sum, m) => sum + (m.holder === preview.nonDefaultingParty ? -Number(m.value) : Number(m.value)), 0);
    expect(Number(preview.netAmount)).toBe(42 + margin + otherTransactions(preview, [r1.repoId, r2.repoId]));

    const aSec = await balanceOf(GATEWAY.A, tUST, p.a), bSec = await balanceOf(GATEWAY.B, tUST, p.b);
    const aUsd = await balanceOf(GATEWAY.A, tUSD, p.a), bUsd = await balanceOf(GATEWAY.B, tUSD, p.b);

    // 1. B declares A's default and closes out in its console: the oracle records the default (if not already), B serves
    // the Default Notice on-chain, then records the statement and the balance; both repos close out.
    await page.goto("/#/live/B");
    await page.getByTestId("repo-default-close-out").click({ timeout: STEP_TIMEOUT });
    for (const id of [r1.repoId, r2.repoId])
      await expect.poll(async () => (await repo(SERVICE.A, id))?.state, { timeout: 60_000 }).toBe("closedOut");
    closedOut = true;
    for (const gw of [GATEWAY.A, GATEWAY.B]) expect((await call<{ inDefault: boolean }>(`${gw}/defaults/${p.a}`)).inDefault).toBe(true);
    expect(await balanceOf(GATEWAY.A, tUST, p.a)).toBe(aSec);
    expect(await balanceOf(GATEWAY.B, tUST, p.b)).toBe(bSec);

    // 2. Both services rebuild the statement from their own trades and agree; the defaulting party is offered no close-out.
    const a = await view(SERVICE.A), b = await view(SERVICE.B);
    expect(a.inDefault).toBe(true);
    expect(a.preview).toBeUndefined();
    const coA = a.closeOuts[0], coB = b.closeOuts[0];
    expect(coA.closeOutId).toBe(coB.closeOutId);
    expect(coA.verified && coB.verified).toBe(true);
    expect(coB.noticeServed).toBe(true);
    expect(coB.statement!.balance).toBe(preview.balance);
    expect(coB.amount).toBe(preview.balance);
    expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd);

    // 3. The party owing the balance pays it in its console.
    const amount = BigInt(coB.amount);
    if (amount > 0n) {
      const payerSvc = coB.payer === "A" ? "A" : "B";
      await page.goto(`/#/live/${payerSvc}`);
      await page.getByTestId(`repo-closeout-${coB.closeOutId}`).getByRole("button", { name: `Pay USD ${coB.amount}` }).click({ timeout: STEP_TIMEOUT });
      await expect.poll(async () => (await view(SERVICE.B)).closeOuts[0].paid, { timeout: 60_000 }).toBe(true);
      const sign = payerSvc === "A" ? -1n : 1n;
      expect(await balanceOf(GATEWAY.A, tUSD, p.a)).toBe(aUsd + sign * amount);
      expect(await balanceOf(GATEWAY.B, tUSD, p.b)).toBe(bUsd - sign * amount);
    } else {
      expect(coB.paid).toBe(true);
    }
    for (const svc of [SERVICE.A, SERVICE.B])
      for (const id of [r1.repoId, r2.repoId]) expect((await repo(svc, id))?.verified).toBe(true);
  } finally {
    if (!closedOut) await close([r1, r2]);
    if (!aWasInDefault) await call(`${ORACLE}/defaults`, "POST", { party: p.a, inDefault: false, notifiedBy: "e2e restore" });
    await setDate(today);
  }
});
