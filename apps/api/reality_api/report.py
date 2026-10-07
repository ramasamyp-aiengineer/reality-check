"""PDF export of a run report (reportlab)."""

from __future__ import annotations

import io
from datetime import UTC, datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

STATUS_COLORS = {"CORROBORATED": "#16a34a", "CONTRADICTED": "#dc2626", "UNVERIFIED": "#d97706",
                 "INSUFFICIENT_EVIDENCE": "#6b7280"}


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text or "")).replace("₹", "Rs "), style)


def render_pdf(run: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title=f"Reality Check report {run['id']}")
    ss = getSampleStyleSheet()
    h1, h2, body, small = ss["Title"], ss["Heading2"], ss["BodyText"], ParagraphStyle("small", parent=ss["BodyText"],
                                                                                         fontSize=8, textColor=colors.grey)
    result = run.get("result") or {}
    story: list[Any] = [_p("Reality Check report", h1),
                        _p(f"{run.get('workflow_name')} · {datetime.fromtimestamp(run['created_at'], UTC):%d %b %Y %H:%M} UTC"
                           f" · mode {run.get('mode')}", small), Spacer(1, 6)]
    text = (run.get("input") or {}).get("text")
    if text:
        story += [_p("Input", h2), _p(text, body)]
    verdict = result.get("verdict")
    if verdict:
        color = STATUS_COLORS.get(verdict["evidence_status"], "#111827")
        story += [Spacer(1, 6), Paragraph(f'<font color="{color}"><b>{verdict["evidence_status"].replace("_", " ")}</b></font>'
                                          f' · {verdict["decision"].replace("_", " ")} · confidence {verdict["confidence"]:.0f}/100', h2),
                  _p(verdict.get("explanation"), body), _p("Findings", h2)]
        rows = [["Kind", "Severity", "Finding"]] + [[f["kind"], f["severity"], _p(f["title"], body)] for f in verdict["findings"]]
        t = Table(rows, colWidths=[28 * mm, 22 * mm, 120 * mm])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e1b4b")),
                               ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")), ("FONTSIZE", (0, 0), (-1, -1), 8)]))
        story += [t, _p("Actions", h2)] + [_p(f"• {a['label']}" + (f" ({a['url']})" if a.get("url") else ""), body)
                                           for a in verdict["actions"]]
    brief = result.get("market_brief")
    if brief:
        story += [_p("Market brief", h2), _p(brief.get("summary"), body)]
        story += [_p(f"• {o['text']}", body) for o in brief.get("opportunities", [])]
    ads = result.get("ad_pack")
    if ads:
        story += [_p("Ad pack", h2)]
        for v in ads["variants"]:
            story.append(_p(f"{v['channel']}: " + (" | ".join(v["headlines"][:5]) or v["body"][:300]), body))
        if ads.get("compliance_flags"):
            story += [_p("Compliance flags", h2)] + [_p(f"• {f}", body) for f in ads["compliance_flags"]]
    story += [_p("Evidence", h2)]
    for e in (result.get("evidence") or [])[:40]:
        story.append(_p(f"[{e.get('engine') or 'registry'}] {e['title']} — {e.get('source') or ''} {e.get('url') or ''}", small))
    r = result.get("receipt") or {}
    story += [Spacer(1, 6), _p(f"SerpApi receipt: {r.get('total_calls', 0)} calls, {r.get('paid_searches', 0)} paid searches, "
                               f"{r.get('cache_hits', 0)} cache hits, engines {', '.join(r.get('engines', {}).keys())}", small),
              _p("Verdicts are computed by deterministic rules from public evidence. They describe what the evidence "
                 "shows and are not legal findings.", small)]
    doc.build(story)
    return buf.getvalue()
