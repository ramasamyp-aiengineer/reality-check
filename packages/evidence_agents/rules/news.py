from evidence_agents.rules import rule
from evidence_agents.signals import Finding, NewsEvents, SignalBag


@rule("news.recent_enforcement", "Recent enforcement news", ("NewsEvents",),
      "News of bans, arrests, takedowns or regulator action in the last 180 days.")
def recent_enforcement(bag: SignalBag) -> list[Finding]:
    out = []
    for n in bag.all(NewsEvents):
        if n.recent_enforcement_count:
            named = [i for i in n.items if i.category == "enforcement" and i.mentions_subject]
            ids = [i.evidence_id for i in named if i.evidence_id][:2]
            out.append(Finding(id="news_enforcement", rule="", kind="contradiction", severity="high",
                               title=f"{n.recent_enforcement_count} enforcement-related news item(s) in 180 days",
                               detail=named[0].title if named else "",
                               evidence_ids=ids))
    return out


@rule("news.complaints", "Complaint coverage in news", ("NewsEvents",), "Two or more news items about victims or complaints.")
def complaint_news(bag: SignalBag) -> list[Finding]:
    out = []
    for n in bag.all(NewsEvents):
        items = [i for i in n.items if i.category == "complaint" and i.mentions_subject]
        if len(items) >= 2:
            out.append(Finding(id="news_complaints", rule="", kind="contradiction", severity="medium",
                               title=f"{len(items)} news items describe complaints or victims",
                               evidence_ids=[i.evidence_id for i in items[:2] if i.evidence_id]))
    return out
