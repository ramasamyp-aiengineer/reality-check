"""Intent extraction: turn a forwarded message, link or business profile into a typed ClaimSet."""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

from evidence_agents.llm.base import LLMConfig, run_structured, untrusted
from evidence_agents.signals import BusinessProfile, ClaimSet, ClaimType, Entity
from evidence_agents.text import extract_amounts, extract_phones, extract_urls, registered_domain

_TYPE_KEYWORDS: list[tuple[ClaimType, tuple[str, ...]]] = [
    ("loan_offer", ("loan", "emi", "cibil", "credit score", "instant cash", "disburs", "borrow", "lend")),
    ("investment_tip", ("stock tip", "trading", "returns", "ipo", "crypto", "multibagger", "share market", "sebi",
                        "intraday", "invest")),
    ("job_offer", ("job", "hiring", "vacancy", "work from home", "part time", "part-time", "salary", "earn daily",
                   "task based", "offer letter")),
    ("customer_care", ("customer care", "helpline", "toll free", "toll-free", "refund", "support number")),
    ("travel", ("flight", "hotel", "tour package", "trip", "holiday package", "resort")),
    ("deal_price", ("deal", "sale", "offer price", "discount", "only rs", "only ₹", "buy now", "mrp", "% off", "iphone",
                    "price")),
]

_RED_FLAGS = (
    "no cibil", "no credit check", "without cibil", "instant approval", "100% approval", "approval in 5 minutes",
    "without documents", "no documents", "only aadhaar", "only pan", "upfront fee", "advance fee", "processing fee before",
    "registration fee", "pay to unlock", "guaranteed returns", "double your money", "share otp", "limited time",
    "act now", "no kyc", "earn daily", "work from home and earn",
)

_APP_PATTERNS = [
    re.compile(r"(?:download|install|use|try|open)\s+(?:the\s+)?[\"']?([A-Z][\w&.\-]*(?:\s+[A-Z][\w&.\-]*){0,3})[\"']?", re.M),
    re.compile(r"([A-Z][\w&\-]*(?:\s+[A-Z][\w&\-]*){0,2})\s+app\b", re.M),
]
_ORG_SUFFIXES = (
    r"Private Limited|Pvt\.?\s*Ltd\.?|Limited|Ltd\.?|LLP|Finance|Fintech|Finserv|Capital|NBFC|Bank|Advisory|Advisors|"
    r"Advisers|Research|Securities|Investments?|Wealth|Solutions|Services|Technologies|Infotech|Consultants|Consultancy|"
    r"Enterprises|Traders|Clinic|Hospital|Hospitals|Academy|Institute|Classes|Coaching|Studio|Travels|Tours|Holidays|"
    r"Realty|Builders|Motors"
)
_COMPANY_PATTERN = re.compile(
    rf"\b([A-Z][\w&.\-]*(?:\s+[A-Z][\w&.\-]*){{0,4}}\s+(?:{_ORG_SUFFIXES}))(?![\w])", re.M)
_CAPITALIZED_RUN = re.compile(r"\b[A-Z][\w&\-]*(?:\s+[A-Z][\w&\-]*)+")
_PRODUCT_PATTERN = re.compile(
    r"([A-Za-z][\w\-+ ]{2,60}?)\s+(?:at|for|@|only|just|now)\s*(?:rs\.?|₹|inr)\s*[0-9]", re.I)
_STOP_APP = {"Instant", "Get", "Loan", "Download", "Apply", "The", "Now", "Click", "Link", "Install", "Free", "Our",
             "Your", "This", "Hurry", "Limited", "Play", "Google"}
_LEADING_STOP = {"Join", "Contact", "Call", "Visit", "Book", "With", "By", "From", "At", "Message", "Dear", "Hi", "Hello",
                 "Congratulations", "Urgent", "Official", "Genuine", "The", "Our", "Your", "New", "Best", "Top", "Free",
                 "Payment", "Proof", "Screenshot", "Work", "Earn", "Part", "Time", "Today", "Buy", "Sell", "Get"}
CITIES = ("Bengaluru", "Bangalore", "Mumbai", "Delhi", "New Delhi", "Chennai", "Hyderabad", "Kolkata", "Pune", "Ahmedabad",
          "Jaipur", "Lucknow", "Kochi", "Coimbatore", "Indore", "Chandigarh", "Noida", "Gurugram", "Gurgaon", "Surat",
          "Nagpur", "Bhopal", "Visakhapatnam", "Mysuru", "Mysore", "Thiruvananthapuram", "Madurai", "Patna", "Goa")


def _strip_leading(name: str) -> str:
    words = name.split()
    while len(words) > 1 and words[0] in _LEADING_STOP:
        words.pop(0)
    return " ".join(words)


def _find_city(text: str) -> str | None:
    for city in CITIES:
        if re.search(rf"\b{re.escape(city)}\b", text, re.I):
            return city
    return None


def _fallback_name(text: str, city: str | None) -> str | None:
    """Longest run of capitalised words, e.g. 'Lucky Draw India', when no app or company pattern matched."""
    best = None
    for m in _CAPITALIZED_RUN.finditer(text):
        words = _strip_leading(m.group(0)).split()
        if city and words and words[-1].lower() == city.lower():
            words = words[:-1]
        if len(words) >= 2 and (best is None or len(words) > len(best.split())):
            best = " ".join(words)
    return best


class IntentLLM(BaseModel):
    claim_type: ClaimType
    summary: str = Field(description="One neutral sentence describing what the message claims")
    app_name: str | None = None
    company_name: str | None = None
    product: str | None = None
    topic: str | None = None
    claimed_price: float | None = None
    red_flags: list[str] = Field(default_factory=list)
    city: str | None = None


def _clean_app(name: str) -> str | None:
    words = [w for w in name.split() if w not in _STOP_APP]
    cleaned = " ".join(words).strip(" .,'\"")
    return cleaned if len(cleaned) >= 3 else None


def heuristic_intent(text: str) -> ClaimSet:
    low = text.lower()
    claim_type: ClaimType = "generic"
    for ctype, words in _TYPE_KEYWORDS:
        if any(w in low for w in words):
            claim_type = ctype
            break

    app_name = None
    for pattern in _APP_PATTERNS:
        for m in pattern.finditer(text):
            candidate = _clean_app(m.group(1))
            if candidate:
                app_name = candidate
                break
        if app_name:
            break

    city = _find_city(text)
    company = None
    m = _COMPANY_PATTERN.search(text)
    if m:
        company = _strip_leading(m.group(1).strip())
        if len(company.split()) < 2:
            company = None

    product = None
    amounts = extract_amounts(text)
    if claim_type in ("deal_price", "generic", "travel"):
        pm = _PRODUCT_PATTERN.search(text)
        if pm:
            product = re.sub(r"^(?:get|buy|grab|the|new)\s+", "", pm.group(1).strip(), flags=re.I)
            if claim_type == "generic":
                claim_type = "deal_price"

    urls = extract_urls(text)
    domains = [d for d in (registered_domain(u) for u in urls) if d]
    red_flags = [f for f in _RED_FLAGS if f in low]
    claimed_price = amounts[0] if claim_type in ("deal_price", "travel") and amounts else None
    if not (app_name or company or product) and claim_type not in ("deal_price", "travel"):
        company = _fallback_name(text, city)
    entities = []
    if app_name:
        entities.append(Entity(name=app_name, kind="app"))
    if company:
        entities.append(Entity(name=company, kind="company"))
    if product:
        entities.append(Entity(name=product, kind="product"))
    subject = app_name or company or product or "the sender"
    summary = {
        "loan_offer": f"{subject} offers a loan through a forwarded message",
        "investment_tip": f"{subject} promotes an investment opportunity",
        "job_offer": f"{subject} offers a job",
        "customer_care": f"A customer-care contact for {subject}",
        "deal_price": f"{product or subject} offered at Rs {claimed_price:,.0f}" if claimed_price else f"A deal on {subject}",
        "travel": f"A travel offer from {subject}",
    }.get(claim_type, text[:100])
    return ClaimSet(
        agent="intent", raw_text=text, claim_type=claim_type, summary=summary, entities=entities,
        app_name=app_name, company_name=company, product=product, claimed_price=claimed_price, amounts=amounts,
        urls=urls, domains=domains, phones=extract_phones(text), red_flags=red_flags, city=city,
    )


def profile_intent(profile: BusinessProfile) -> ClaimSet:
    return ClaimSet(
        agent="intent", raw_text=f"Market research for {profile.topic}", claim_type="market_research",
        summary=f"Market pulse for '{profile.topic}'" + (f" in {profile.city}" if profile.city else ""),
        topic=profile.topic, company_name=profile.business_name or None, city=profile.city,
        entities=[Entity(name=profile.topic, kind="topic")] + [Entity(name=c, kind="brand") for c in profile.competitors],
    )


INSTRUCTIONS = (
    "You extract the factual claim from a message an Indian user received (often a WhatsApp forward, SMS or ad). "
    "Identify the claim type, the app, company, product or topic named, any claimed price in INR, and pressure or "
    "red-flag phrases quoted verbatim. Use null when something is not stated. Do not judge whether it is true."
)


async def extract_intent(text: str, llm: LLMConfig | None) -> ClaimSet:
    base = heuristic_intent(text)
    refined = await run_structured(llm, IntentLLM, INSTRUCTIONS, untrusted(text))
    if not refined:
        return base
    merged = base.model_copy(update={
        "claim_type": refined.claim_type,
        "summary": refined.summary or base.summary,
        "app_name": refined.app_name or base.app_name,
        "company_name": refined.company_name or base.company_name,
        "product": refined.product or base.product,
        "topic": refined.topic or base.topic,
        "claimed_price": refined.claimed_price if refined.claimed_price is not None else base.claimed_price,
        "red_flags": list(dict.fromkeys(base.red_flags + [f.lower() for f in refined.red_flags]))[:8],
        "city": refined.city or base.city,
    })
    names = {e.name for e in merged.entities}
    for name, kind in ((merged.app_name, "app"), (merged.company_name, "company"), (merged.product, "product")):
        if name and name not in names:
            merged.entities.append(Entity(name=name, kind=kind))  # type: ignore[arg-type]
    return merged
