# Demo video script (under 3 minutes, running locally)

Setup before recording:

- `uv run reality-check` with `SERPAPI_API_KEY` in `.env` for live runs, or `--demo-only` for recorded runs everywhere (`--demo` keeps your own workspace live and adds the demo workspace).
- Browser at 1440×900, signed out, dark theme.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Sign-in page with the banner slider | "Every Indian phone gets these forwards: instant loans, stock tips, job offers. Reality Check verifies them with live Google evidence from SerpApi." |
| 0:15–0:30 | Sign in, then Home. Paste the QuickRupee loan forward | "I paste the forward. The AI planner builds a workflow of evidence agents and shows exactly how many searches it will cost." |
| 0:30–0:45 | Graph preview, then approve | "Seven agents across five SerpApi engines: Play Store, reviews, web, news and Ads Transparency, plus RBI's lending-app directory. I approve." |
| 0:45–1:15 | Live run canvas: agents light up, searches and evidence stream | "Agents run in parallel. Every search and every piece of evidence streams in live." |
| 1:15–1:40 | Verdict tab: CONTRADICTED / Do not proceed, findings with evidence, evidence graph | "Rules, not the LLM, decide the verdict. The app isn't on RBI's list, 65% of the newest reviews report harassment or hidden charges, and there's enforcement news. Every finding links to its source." |
| 1:40–1:50 | Receipt tab | "The receipt shows every search, what was cached and what it cost." |
| 1:50–2:25 | Home, then Market Pulse with the electric-scooter profile. Market brief, then Ad Studio | "The same agents work for businesses. Market Pulse reads Trends, News, Shopping, Maps reviews and competitor ads. The Ad Studio writes ad copy where every claim is backed by evidence and checked for ASCI substantiation." |
| 2:25–2:40 | Studio: drag an agent (for example Google Jobs) onto the canvas | "You can compose your own workflows by dragging agents in, Cursor-style." |
| 2:40–2:55 | Watches, then Developer (MCP config) | "Watch any check and get a Telegram alert when the evidence changes. And every agent is available over MCP, inside Cursor or Claude." |
| 2:55–3:00 | Logo | "Reality Check: verify before you trust." |

Automated recording:

`scripts/make_demo_video.py` reproduces this video end to end. It writes the narration with a neural voice
(`edge-tts`, voice `en-IN-NeerjaNeural`), drives the UI with Playwright (`apps/web/video/demo.video.ts`), captures
1080p frames through the Chrome screencast, and muxes everything into `data/video/reality-check-demo.mp4`.

```powershell
python -m venv data\videotools
data\videotools\Scripts\python -m pip install edge-tts imageio-ffmpeg
data\videotools\Scripts\python scripts\make_demo_video.py all

# Light theme, same script and narration -> data/video/reality-check-demo-light.mp4
$env:VIDEO_THEME="light"; data\videotools\Scripts\python scripts\make_demo_video.py record; data\videotools\Scripts\python scripts\make_demo_video.py mux
```

The recording server runs in demo mode with `RC_REPLAY_PACING=2.6,4.0`, so replayed searches take a realistic
2.6–4 seconds each and the live canvas is readable.

Tips:

- Run each flow once before recording so live responses are cached and the video doesn't wait on the network.
- Keep the receipt visible for a second, because judges look for real SerpApi usage.
