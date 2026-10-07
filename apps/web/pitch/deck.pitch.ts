import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..", "..", "..");
const pitch = join(root, "docs", "pitch");
const previews = join(root, "data", "pitch-preview");

const DECKS = [
  { html: "index.html", pdf: "reality-check-pitch.pdf", prefix: "slide" },
  { html: "full.html", pdf: "reality-check-pitch-full.pdf", prefix: "full" },
];

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

for (const d of DECKS) {
  test(`deck ${d.html}`, async ({ page }) => {
    mkdirSync(previews, { recursive: true });
    await page.goto(`${pathToFileURL(join(pitch, d.html)).href}#1`);
    await page.evaluate(() => document.fonts.ready);
    const count = await page.locator(".slide").count();
    expect(count).toBeGreaterThan(5);
    for (let i = 1; i <= count; i++) {
      await page.evaluate((n) => { location.hash = `#${n}`; }, i);
      await expect(page.locator(".slide.active")).toHaveCount(1);
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(previews, `${d.prefix}-${String(i).padStart(2, "0")}.png`) });
    }
    await page.emulateMedia({ media: "print" });
    // 13.33 × 7.5 in (the PowerPoint widescreen size); the 1920 × 1080 slides are scaled to fit.
    await page.pdf({ path: join(pitch, d.pdf), width: "1280px", height: "720px", scale: 2 / 3, printBackground: true });
  });
}
