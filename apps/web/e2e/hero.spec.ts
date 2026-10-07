import { expect, test } from "@playwright/test";

test("demo sign-in, approve the loan forward check and read the verdict", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: /Try the demo workspace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you/ })).toBeVisible();

  await page.goto("/studio?template=loan_forward_check&sample=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Review and approve")).toBeVisible();
  const approve = dialog.getByRole("button", { name: /Approve & Run/ });
  await expect(approve).toBeDisabled();
  await dialog.getByRole("switch").click();
  await approve.click();

  await expect(page).toHaveURL(/\/runs\/run_/);
  await expect(page.getByText("Do not proceed").first()).toBeVisible();
  await expect(page.getByText("Contradicted").first()).toBeVisible();

  await page.getByRole("tab", { name: /Receipt/ }).click();
  await expect(page.getByText("Search receipt")).toBeVisible();
  await expect(page.getByText("Keys are never recorded.")).toBeVisible();
});

test("pasting a forward on Home plans a full workflow", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Try the demo workspace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you/ })).toBeVisible();
  await page.getByRole("button", { name: "Loan forward" }).click();
  await page.getByRole("button", { name: /Plan the check/ }).click();
  await expect(page.getByText("Planned by keyword rules.")).toBeVisible();
  await expect.poll(() => page.locator(".react-flow__node").count()).toBeGreaterThan(3);
});

test("market pulse produces a brief and grounded ads", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Try the demo workspace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you/ })).toBeVisible();

  await page.goto("/studio?template=market_pulse_ads&sample=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("switch").click();
  await dialog.getByRole("button", { name: /Approve & Run/ }).click();

  await expect(page.getByText("Market brief · electric scooter")).toBeVisible();
  await page.getByRole("tab", { name: /Ad studio/ }).click();
  await expect(page.getByText(/flags? caught|^\s*Clean\s*$/).first()).toBeVisible();
});

test("every page renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByRole("button", { name: /Try the demo workspace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you/ })).toBeVisible();
  for (const [path, heading] of [
    ["/workflows", "Workflow library"],
    ["/runs", "Runs"],
    ["/evidence", "Evidence explorer"],
    ["/watches", "Watches"],
    ["/agents", "Agents & Engine Atlas"],
    ["/usage", "Usage & receipts"],
    ["/settings", "Settings"],
    ["/developer", "Developer"],
    ["/connect", "Connect SerpApi"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
