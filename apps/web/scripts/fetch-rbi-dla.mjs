// Downloads RBI's public "Digital Lending Apps deployed by Regulated Entities" directory as XLSX, then imports it.
// Run from apps/web:  node scripts/fetch-rbi-dla.mjs
// The directory is a SAP BusinessObjects report; the export reuses the anonymous session the viewer opens.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = resolve(ROOT, "data/rbi/dla.xlsx");
const URL = "https://data.rbi.org.in/BOE/OpenDocument/opendoc/custom.jsp?sIDType=CUID&iDocID=ARfEgy.WNSVIvFfvSIVmBCw";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  let pageReq = null;
  page.on("request", (r) => {
    if (/raylight\/v1\/documents\/\d+\/occurrences\/0\/reports\/\d+\/pages\/1/.test(r.url())) pageReq = { url: r.url(), headers: r.headers() };
  });
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  for (let i = 0; i < 60 && !pageReq; i++) await page.waitForTimeout(1000);
  if (!pageReq) throw new Error("RBI report viewer did not load");
  const [, base, reportId] = pageReq.url.match(/^(.*raylight\/v1\/documents\/\d+)\/occurrences\/0\/reports\/(\d+)/);
  const headers = Object.fromEntries(Object.entries(pageReq.headers).filter(([k]) => /^x-sap/i.test(k)));
  const res = await page.request.get(`${base}/occurrences/0/reports/${reportId}`, { headers: { ...headers, Accept: XLSX }, timeout: 120_000 });
  const body = await res.body();
  if (!res.ok() || body.length < 5000) throw new Error(`Export failed: HTTP ${res.status()}, ${body.length} bytes`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body);
  console.log(`Saved ${body.length} bytes to ${OUT}`);
} finally {
  await browser.close();
}

const python = resolve(ROOT, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
execFileSync(python, ["-W", "ignore", "-m", "evidence_agents.tools.import_registry", "rbi_dla", OUT], { cwd: ROOT, stdio: "inherit" });
