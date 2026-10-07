import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const python = process.platform === "win32" ? join(root, ".venv", "Scripts", "python.exe") : join(root, ".venv", "bin", "python");
const port = Number(process.env.VIDEO_PORT ?? 8020);

// Records the demo video (see scripts/make_demo_video.py). 1536x864 CSS pixels at 1.25x = 1920x1080 frames.
export default defineConfig({
  testDir: "./video",
  testMatch: "*.video.ts",
  timeout: 8 * 60_000,
  expect: { timeout: 90_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    viewport: { width: 1536, height: 864 },
    deviceScaleFactor: 1.25,
    colorScheme: process.env.VIDEO_THEME === "light" ? "light" : "dark",
    locale: "en-IN",
  },
  webServer: {
    command: `"${python}" -m reality_api.cli --demo-only --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      RC_DATA_DIR: mkdtempSync(join(tmpdir(), "rc-video-")),
      RC_REPLAY_PACING: "2.6,4.0",
      ALLOW_DEMO_LOGIN: "1",
      SERPAPI_API_KEY: "",
      LLM_MODEL: "",
    },
  },
});
