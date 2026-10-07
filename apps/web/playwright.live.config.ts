import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const python = process.platform === "win32" ? join(root, ".venv", "Scripts", "python.exe") : join(root, ".venv", "bin", "python");
const port = Number(process.env.E2E_LIVE_PORT ?? 8011);

// Non-demo server: real first-run setup, demo login disabled, no SerpApi key in the environment.
export default defineConfig({
  testDir: "./e2e-live",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `"${python}" -m reality_api.cli --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      RC_DATA_DIR: mkdtempSync(join(tmpdir(), "rc-live-")),
      RC_FORCE_DEMO: "0",
      ALLOW_DEMO_LOGIN: "0",
      ALLOW_ENV_SERPAPI_KEY: "0",
      SERPAPI_API_KEY: "",
      LLM_MODEL: "",
      GITHUB_CLIENT_ID: "",
      GOOGLE_CLIENT_ID: "",
    },
  },
});
