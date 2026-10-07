import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const python = process.platform === "win32" ? join(root, ".venv", "Scripts", "python.exe") : join(root, ".venv", "bin", "python");
const port = Number(process.env.PITCH_PORT ?? 8030);

// Captures product screenshots for docs/pitch and renders the deck to PDF. Run: npx playwright test -c playwright.pitch.config.ts
export default defineConfig({
  testDir: "./pitch",
  testMatch: "*.pitch.ts",
  timeout: 6 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    viewport: { width: 1536, height: 864 },
    deviceScaleFactor: 1.5,
    colorScheme: "dark",
    locale: "en-IN",
  },
  webServer: {
    command: `"${python}" -m reality_api.cli --demo-only --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      RC_DATA_DIR: mkdtempSync(join(tmpdir(), "rc-pitch-")),
      RC_REPLAY_PACING: "0.6,1.0",
      ALLOW_DEMO_LOGIN: "1",
      SERPAPI_API_KEY: "",
      LLM_MODEL: "",
    },
  },
});
