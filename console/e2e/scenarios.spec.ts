import { expect, test } from "@playwright/test";
import { SCENARIOS } from "../src/scenarios/scenarios";

// The scenario files drive the end-to-end tests (wp-adr-ux-scenario-grid): every guided step's button is clicked
// in the actor's console, in order, against the production build.
for (const sc of SCENARIOS) {
  test(`guided: ${sc.id}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/#/");
    await page.click(`[data-sc="${sc.id}"]`);
    for (const st of sc.steps) {
      const consoleName = { A: "BANK-A", B: "BANK-B", M: "MKT" }[st.actor];
      await page.getByRole("region", { name: `${consoleName} console` }).getByRole("button", { name: st.label, exact: true }).click();
    }
    await expect(page.getByText("Scenario complete")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("free: enforcement is rejected until the default is published", async ({ page }) => {
  await page.goto("/#/s/im-default/free");
  const b = page.getByRole("region", { name: "BANK-B console" });
  await b.getByRole("button", { name: "Enforce" }).click();
  await expect(b.getByRole("alert")).toContainText("the oracle feed shows no default for BANK-A");
  await page.getByRole("region", { name: "MKT console" }).getByRole("button", { name: "Publish BANK-A default" }).click();
  await b.getByRole("button", { name: "Enforce" }).click();
  await expect(b.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("enforce(C-0001)")).toBeVisible();
});

test("phone width: no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 900 });
  for (const path of ["/#/", "/#/s/im-reval/guided", "/#/s/im-call/free"]) {
    await page.goto(path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(400);
  }
});
