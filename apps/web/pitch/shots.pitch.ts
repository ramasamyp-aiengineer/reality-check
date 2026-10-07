import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(import.meta.dirname, "..", "..", "..", "docs", "pitch", "assets", "screens");
mkdirSync(out, { recursive: true });

const LOAN =
  "Instant Personal Loan Rs 50,000 in 5 minutes! No CIBIL check, only Aadhaar & PAN. 100% approval. Download QuickRupee app now: https://bit.ly/quickrupee-loan Limited time offer! Call 9876543210";

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: "jpeg", quality: 90 });
}

async function scrollTo(page: Page, loc: Locator, offset = 80) {
  await loc.waitFor();
  await loc.evaluate((el, off) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "instant" }), offset);
  await page.waitForTimeout(600);
}

async function approve(page: Page, name?: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Review and approve")).toBeVisible();
  await dialog.getByRole("switch").click();
  if (name) await shot(page, name);
  await dialog.getByRole("button", { name: /Approve & Run/ }).click();
  await expect(page).toHaveURL(/\/runs\/run_/);
  await expect(page.locator(".react-flow__node").first()).toBeAttached();
}

async function fit(page: Page) {
  const fitBtn = page.getByRole("button", { name: "Fit View" });
  if (await fitBtn.count()) await fitBtn.first().click();
  await page.waitForTimeout(500);
}

test("pitch screenshots", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rc_theme", "dark"));
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Try the demo workspace/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "01-login");

  await page.getByRole("button", { name: /Try the demo workspace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you|Welcome/ })).toBeVisible();
  const box = page.getByRole("textbox", { name: "Message, link or image URL to check" });
  await box.fill(LOAN);
  await page.waitForTimeout(800);
  await shot(page, "02-home");

  await page.getByRole("button", { name: /Plan the check/ }).click();
  await expect.poll(() => page.locator(".react-flow__node").count(), { timeout: 30_000 }).toBeGreaterThan(3);
  await page.waitForTimeout(1800);
  await shot(page, "03-plan");

  await page.getByRole("button", { name: /Review & run/ }).click();
  await approve(page, "04-approve");

  await page.waitForTimeout(2600);
  await fit(page);
  await shot(page, "05-run-live");

  await page.getByRole("button", { name: /Evidence stream/ }).click();
  await expect(page.getByText("Do not proceed").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await fit(page);
  await shot(page, "06-run-done");

  await scrollTo(page, page.getByRole("tab", { name: /Verdict/ }), 70);
  await shot(page, "07-verdict");
  await scrollTo(page, page.getByTestId("verdict-gaps"), 260);
  await shot(page, "08-verdict-findings");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("tab", { name: /Evidence graph/ }).click();
  await page.waitForTimeout(1500);
  await scrollTo(page, page.getByRole("tab", { name: /Evidence graph/ }), 70);
  await shot(page, "09-graph");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("tab", { name: /Receipt/ }).click();
  await expect(page.getByText("Search receipt")).toBeVisible();
  await scrollTo(page, page.getByRole("tab", { name: /Receipt/ }), 70);
  await shot(page, "10-receipt");

  await page.goto("/studio?template=market_pulse_ads&sample=1");
  await approve(page);
  await page.getByRole("button", { name: /Evidence stream/ }).click();
  await expect(page.getByText("Market brief · electric scooter")).toBeVisible();
  await page.waitForTimeout(800);
  await scrollTo(page, page.getByRole("tab", { name: /Market brief/ }), 70);
  await shot(page, "11-brief");
  await page.evaluate(() => window.scrollBy({ top: 760, behavior: "instant" }));
  await shot(page, "12-brief-more");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("tab", { name: /Ad studio/ }).click();
  await page.waitForTimeout(900);
  await scrollTo(page, page.getByRole("tab", { name: /Ad studio/ }), 70);
  await shot(page, "13-ads");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.getByRole("button", { name: /^Watch$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Watch this")).toBeVisible();
  await dialog.getByRole("button", { name: "Daily" }).click();
  await dialog.getByRole("switch").first().click();
  await dialog.getByRole("button", { name: /Create watch/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Watches" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "14-watches");

  await page.goto("/studio?template=loan_forward_check");
  await expect.poll(() => page.locator(".react-flow__node").count()).toBeGreaterThan(4);
  await page.waitForTimeout(1200);
  await shot(page, "15-studio");

  await page.goto("/agents");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "16-agents");
  await page.goto("/agents?tab=engines");
  await page.waitForTimeout(1000);
  await shot(page, "17-engines");
  await page.goto("/agents?tab=rules");
  await page.waitForTimeout(1000);
  await shot(page, "18-rules");

  await page.goto("/workflows");
  await page.waitForTimeout(1000);
  await shot(page, "19-library");

  await page.goto("/usage");
  await page.waitForTimeout(1200);
  await shot(page, "20-usage");

  await page.goto("/developer");
  await expect(page.getByRole("heading", { level: 1, name: "Developer" })).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "21-developer");
  await scrollTo(page, page.getByText(/open-source|Ollama/i).first(), 120);
  await shot(page, "22-developer-llm");
});
