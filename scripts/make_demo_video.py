"""Build the demo video: neural voice-over, scripted 1080p screen recording, then an MP4 mux.

Needs a scratch environment with `edge-tts` and `imageio-ffmpeg` (kept out of the project dependencies):

    python -m venv data/videotools
    data/videotools/Scripts/python -m pip install edge-tts imageio-ffmpeg
    data/videotools/Scripts/python scripts/make_demo_video.py all

Steps: `tts` writes narration clips and data/video/segments.json, `record` runs the Playwright recording
(apps/web/video), `mux` stitches the frames and narration into data/video/reality-check-demo.mp4.
Set VIDEO_THEME=light to record the light theme (written to reality-check-demo-light.mp4).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "video"
AUDIO = OUT / "audio"
FRAMES = OUT / "frames"
THEME = os.environ.get("VIDEO_THEME", "dark")
VOICE = os.environ.get("VIDEO_VOICE", "en-IN-NeerjaNeural")
RATE = os.environ.get("VIDEO_RATE", "+4%")
FPS = 30

SEGMENTS: list[tuple[str, str]] = [
    ("intro", "Reality Check. Evidence agents for India, powered by SerpApi."),
    ("forwards", "Every phone in India gets these forwards. Instant loans with no CIBIL check, stock tips with "
                 "guaranteed returns, job offers that ask for a fee. Reality Check verifies them with live Google "
                 "evidence."),
    ("paste", "I sign in, and paste a loan forward that came on WhatsApp."),
    ("plan", "The planner turns it into a workflow of evidence agents, and shows exactly how many SerpApi searches "
             "it will spend, before anything runs. I approve."),
    ("live", "The agents run in parallel. The Play Store listing, the newest reviews, the open web, Google News and "
             "the Ads Transparency Center, checked against RBI's list of digital lending apps. Every search and "
             "every piece of evidence streams in live."),
    ("verdict", "Rules decide the verdict, not the language model. The app is not on RBI's list, the newest reviews "
                "report harassment and hidden charges, and there is enforcement news. Every finding links back to "
                "its source."),
    ("receipt", "The receipt lists every search, the engine that answered it, and what it cost."),
    ("market", "The same agents work for businesses. Here is Market Pulse for an electric scooter dealer in "
               "Bengaluru, on real SerpApi data. Demand, news, prices, competitor reviews and competitor ads are "
               "all read at once, and the evidence stream fills up as results arrive."),
    ("brief", "Google Trends shows where demand is moving and which states are most interested. Shopping sets the "
              "real price band, Maps reviews surface competitor pain points, and the Ads Transparency Center shows "
              "who is already advertising."),
    ("ads", "The Ad Studio writes campaigns where every claim is tied to evidence, and checked for ASCI "
            "substantiation and platform character limits."),
    ("watch", "Any check can become a watch. It re-runs on a schedule, compares the evidence, and sends a Telegram "
              "alert when something changes."),
    ("studio", "Or compose your own workflow. Drag agents from the palette onto the canvas, and the search cost "
               "updates instantly."),
    ("combos", "Seventeen agents, sixteen SerpApi engines, endless combinations."),
    ("mcp", "And every agent is available over MCP, so you can run the same checks from Cursor or Claude."),
    ("outro", "Reality Check. Verify before you trust."),
]


def ffmpeg() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def media_duration(path: Path) -> float:
    proc = subprocess.run([ffmpeg(), "-hide_banner", "-i", str(path)], capture_output=True, text=True)  # noqa: S603
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", proc.stderr)
    if not m:
        raise RuntimeError(f"Could not read duration of {path}")
    h, mnt, s = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(s)


async def _speak(seg_id: str, text: str) -> Path:
    import edge_tts

    path = AUDIO / f"{seg_id}.mp3"
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(path))
    return path


def tts() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    out = []
    for seg_id, text in SEGMENTS:
        path = asyncio.run(_speak(seg_id, text))
        out.append({"id": seg_id, "text": text, "duration": round(media_duration(path), 3)})
        print(f"  {seg_id:<9} {out[-1]['duration']:5.1f}s")
    (OUT / "segments.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Narration total {sum(s['duration'] for s in out):.1f}s")


def record() -> None:
    if FRAMES.exists():
        shutil.rmtree(FRAMES)
    FRAMES.mkdir(parents=True)
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    env = {**os.environ, "VIDEO_DIR": str(OUT), "VIDEO_THEME": THEME}
    subprocess.run([npx, "playwright", "test", "-c", "playwright.video.config.ts"],  # noqa: S603
                   cwd=ROOT / "apps" / "web", env=env, check=True)


def mux() -> None:
    frames = json.loads((OUT / "frames.json").read_text(encoding="utf-8"))
    timings = json.loads((OUT / "timings.json").read_text(encoding="utf-8"))
    t0 = frames[0]["t"]
    end = timings.get("_end", frames[-1]["t"] + 1)
    # Screencast frames arrive at a variable rate; resample onto an exact constant-rate sequence (hard links, no
    # copies) so video time equals wall time and the narration offsets stay in sync.
    cfr = OUT / "cfr"
    if cfr.exists():
        shutil.rmtree(cfr)
    cfr.mkdir()
    idx = 0
    for k in range(int((end - t0) * FPS) + 1):
        t = t0 + k / FPS
        while idx + 1 < len(frames) and frames[idx + 1]["t"] <= t:
            idx += 1
        src, dst = FRAMES / frames[idx]["file"], cfr / f"{k:06d}.jpg"
        try:
            os.link(src, dst)
        except OSError:
            shutil.copyfile(src, dst)

    segs = json.loads((OUT / "segments.json").read_text(encoding="utf-8"))
    inputs: list[str] = ["-framerate", str(FPS), "-i", str(cfr / "%06d.jpg")]
    filters, labels = [], []
    for i, seg in enumerate(segs, start=1):
        if seg["id"] not in timings:
            continue
        delay = max(0, int(round((timings[seg["id"]] - t0) * 1000)) + 250)
        inputs += ["-i", str(AUDIO / f"{seg['id']}.mp3")]
        filters.append(f"[{len(labels) + 1}:a]aresample=48000,adelay={delay}|{delay}[a{i}]")
        labels.append(f"[a{i}]")
    filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,loudnorm=I=-16:TP=-1.5[aout]")
    target = OUT / ("reality-check-demo.mp4" if THEME == "dark" else f"reality-check-demo-{THEME}.mp4")
    cmd = [ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", *inputs,
           "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[aout]",
           "-vf", "scale=1920:1080:flags=lanczos:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(target)]
    subprocess.run(cmd, cwd=OUT, check=True)  # noqa: S603
    print(f"Wrote {target} ({media_duration(target):.1f}s, {target.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    OUT.mkdir(parents=True, exist_ok=True)
    if step in ("tts", "all"):
        tts()
    if step in ("record", "all"):
        record()
    if step in ("mux", "all"):
        mux()
