# Pitch deck

- **Deck:** [`index.html`](index.html), 10 slides at 1920×1080. Open it in any browser. It works offline because fonts
  and screenshots are bundled in `assets/`.
- **PDF:** [`reality-check-pitch.pdf`](reality-check-pitch.pdf), the same slides for sharing or uploading.
- **Extended deck:** [`full.html`](full.html) and [`reality-check-pitch-full.pdf`](reality-check-pitch-full.pdf), 20 slides
  with separate slides for the Engine Atlas, orchestration, the SerpApi gateway, security and engineering proof.

## Presenting

| Key | Action |
|---|---|
| → · Space · Page Down · click right side | Next slide |
| ← · Page Up · click left side | Previous slide |
| Home / End | First / last slide |
| F | Fullscreen |
| P | Print or save as PDF |

`index.html#7` opens slide 7 directly.

## Regenerating

The screenshots are captured from the running app in demo mode, so they always match the current UI.

```bash
cd apps/web
npm run build
npx playwright test -c playwright.pitch.config.ts shots   # refresh docs/pitch/assets/screens/*.jpg
npx playwright test -c playwright.pitch.config.ts deck    # re-render both PDFs (and PNG previews in data/pitch-preview)
```

## Story and talk track

The deck follows the judging criteria: idea, originality, technical complexity, usefulness, and meaningful SerpApi
usage. At about 15 to 20 seconds per slide it fits a three-minute pitch.

| # | Slide | What to say |
|---|---|---|
| 1 | Cover | Reality Check: reusable SerpApi evidence agents, composed into workflows, with verdicts decided by rules. |
| 2 | The problem | Indians reported ₹22,845 crore lost to cyber fraud in 2024. Search is manual, chatbots answer from memory, fact-checkers are slow. The ground truth exists on Google and in RBI's list, but nobody checks it when the forward arrives. |
| 3 | The idea | Small agents that each prove one thing, composed like Lego. Paste, plan, approve the cost, watch it run, get a verdict. |
| 4 | Hero flow | One loan forward in. The app is not in RBI's directory, 65% of the newest reviews report harm, and there is enforcement news: CONTRADICTED, do not proceed. |
| 5 | Agent library | 17 agents, each answering one plain question. Twelve of them call SerpApi. |
| 6 | Composability and SerpApi | Ten workflows reuse the same agents across 16 engines. Every workflow is priced before it runs, and every call gets a receipt. |
| 7 | Trustworthy by design | Evidence status, five confidence factors and 30 rules decide. The LLM only explains. The real RBI registry is the ground truth, and security is built in. |
| 8 | Technical depth | Not a prompt chain. A claim is planned, validated, priced and approved, then agents run concurrently through one budgeted SerpApi gateway and 30 rules decide. Failures become gaps, verdicts are deterministic, runs replay offline, and the key never leaves the server. |
| 9 | Platform | The same agents build a market brief and grounded ads, and power watches, an MCP server, a REST API and local open-source LLMs. |
| 10 | Proof and close | 90 Python tests, 9 end-to-end tests, about 13.7k lines of code, who it is for, the roadmap, and three commands to run it. |
## Sources for the problem slide

- Ministry of Home Affairs, written reply in the Lok Sabha, July 2025: ₹22,845.73 crore reported lost in 2024
  (₹7,465.18 crore in 2023), and 36,37,288 financial-fraud incidents reported on NCRP and CFCFRMS in 2024.
- PIB: MeitY has blocked 87 illegal loan apps under Section 69A of the IT Act. RBI's Digital Lending Apps directory
  has been live since 1 July 2025.
