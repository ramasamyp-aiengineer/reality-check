import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN = { name: "Ram Kumar", email: "ram@example.in", password: "Str0ngPassw0rd", workspace: "Ram Labs" };

async function login(request: APIRequestContext, password: string) {
  return request.post("/api/auth/login", { data: { email: ADMIN.email, password } });
}

test.describe.configure({ mode: "serial" });

test("first-run setup creates the admin and lands on Connect SerpApi", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await expect(page.getByText("Try the demo workspace")).toHaveCount(0);

  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Workspace").fill(ADMIN.workspace);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: /Create admin account/ }).click();
  await expect(page.getByText("At least 10 characters")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: /Create admin account/ }).click();
  await expect(page).toHaveURL(/\/connect/);
  await expect(page.getByRole("heading", { level: 1, name: "Connect SerpApi" })).toBeVisible();
  await expect(page.getByText("Add your SerpApi key")).toBeVisible();
  await expect(page.getByText("This workspace runs in demo mode")).toHaveCount(0);

  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "rc_session");
  const csrf = cookies.find((c) => c.name === "rc_csrf");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  expect(csrf?.httpOnly).toBe(false);

  const me = await page.request.get("/api/auth/me");
  expect(me.ok()).toBe(true);
  const body = await me.json();
  expect(body.user).toMatchObject({ email: ADMIN.email, role: "admin", is_demo: false });
  expect(body.workspace).toMatchObject({ name: ADMIN.workspace, mode: "live" });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Good to see you, Ram" })).toBeVisible();
  await expect(page.getByText("Demo mode")).toHaveCount(0);
});

test("an invalid SerpApi key is rejected and never echoed back", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you/ })).toBeVisible();

  await page.goto("/connect");
  const fake = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  await page.getByPlaceholder("Paste your 64-character key").fill(fake);
  await page.getByRole("button", { name: /Validate & connect/ }).click();
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 30_000 });
  const toast = await page.locator("[data-sonner-toast]").first().innerText();
  expect(toast).not.toContain(fake);
  const status = await (await page.request.get("/api/keys/serpapi/status")).json();
  expect(status.connected).toBe(false);
});

test("sign out, wrong password, then sign in again", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Good to see you/ })).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  await page.goto("/runs");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("WrongPassw0rd");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByText("Incorrect email or password")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page).toHaveURL(/\/runs/);
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
});

test("API guards: setup once, CSRF, auth required", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/runs")).status()).toBe(401);
  const again = await anon.post("/api/auth/setup", {
    data: { name: "Intruder", email: "x@example.in", password: "An0therStrongOne", workspace_name: "Evil" },
  });
  expect(again.status()).toBe(409);
  const state = await (await anon.get("/api/auth/state")).json();
  expect(state).toMatchObject({ needs_setup: false, allow_demo: false, signed_in: false });
  expect((await anon.post("/api/auth/demo")).status()).toBe(403);

  const user = await playwright.request.newContext({ baseURL });
  expect((await login(user, ADMIN.password)).ok()).toBe(true);
  const noCsrf = await user.put("/api/settings", { data: { run_budget: 10 } });
  expect(noCsrf.status()).toBe(403);
  expect(await noCsrf.text()).toContain("CSRF");
  await anon.dispose();
  await user.dispose();
});

test("five wrong passwords lock the account", async ({ playwright, baseURL }) => {
  const ctx = await playwright.request.newContext({ baseURL });
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await login(ctx, `Wrong${i}Passw0rd`)).status());
  expect(statuses.slice(0, 5).every((s) => s === 401 || s === 429)).toBe(true);
  expect([423, 429]).toContain(statuses[5]);
  await ctx.dispose();
});
