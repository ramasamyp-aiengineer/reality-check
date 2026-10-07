"""Deterministic text helpers: prices, dates, domains, phones, fuzzy matching and topic tagging."""

from __future__ import annotations

import re
import statistics
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import phonenumbers
import tldextract
from rapidfuzz import fuzz

_PRICE_RE = re.compile(r"(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|lakh|lac|l|cr|crore)?", re.I)
_URL_RE = re.compile(r"https?://[^\s<>\"')]+", re.I)
_COMPANY_SUFFIXES = re.compile(
    r"\b(private|pvt|limited|ltd|llp|inc|technologies|technology|tech|solutions|services|india|fintech|finance|"
    r"financial|finserv|capital|loans?|app|instant|credit)\b\.?",
    re.I,
)


@lru_cache(maxsize=1)
def _extractor() -> tldextract.TLDExtract:
    return tldextract.TLDExtract(suffix_list_urls=())


def parse_price(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    text = str(value).replace("\u00a0", " ")
    m = _PRICE_RE.search(text)
    if not m:
        return None
    try:
        number = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    unit = (m.group(2) or "").lower()
    multiplier = {"k": 1e3, "lakh": 1e5, "lac": 1e5, "l": 1e5, "cr": 1e7, "crore": 1e7}.get(unit, 1)
    return number * multiplier


def extract_amounts(text: str) -> list[float]:
    found = []
    for m in re.finditer(r"(?:₹|rs\.?\s*|inr\s*)([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|lakh|lac|cr|crore)?", text, re.I):
        value = parse_price(m.group(0))
        if value:
            found.append(value)
    return found


def extract_urls(text: str) -> list[str]:
    return list(dict.fromkeys(u.rstrip(".,;") for u in _URL_RE.findall(text)))


_RESERVED_TLDS = {"example", "test", "invalid", "localhost"}  # RFC 2606; used by synthetic fixtures


def registered_domain(url_or_host: str) -> str | None:
    ext = _extractor()(url_or_host)
    if not ext.domain:
        return None
    if not ext.suffix and ext.domain in _RESERVED_TLDS and ext.subdomain:
        return f"{ext.subdomain.split('.')[-1]}.{ext.domain}"
    return f"{ext.domain}.{ext.suffix}" if ext.suffix else ext.domain


def extract_phones(text: str, region: str = "IN") -> list[str]:
    phones = []
    for match in phonenumbers.PhoneNumberMatcher(text, region):
        phones.append(phonenumbers.format_number(match.number, phonenumbers.PhoneNumberFormat.E164))
    return list(dict.fromkeys(phones))


def normalize_name(name: str) -> str:
    text = _COMPANY_SUFFIXES.sub(" ", name.lower())
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _is_acronym(short: str, long: str) -> bool:
    letters = re.sub(r"[^A-Za-z]", "", short)
    words = [w for w in re.findall(r"[A-Za-z]+", long) if len(w) > 1]
    return 2 <= len(letters) <= 5 and len(words) == len(letters) and "".join(w[0] for w in words).lower() == letters.lower()


def name_similarity(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    if _is_acronym(a, b) or _is_acronym(b, a):
        return 90.0
    na, nb = normalize_name(a), normalize_name(b)
    if not na or not nb:
        return float(fuzz.token_set_ratio(a.lower(), b.lower()))
    return float(max(fuzz.token_set_ratio(na, nb), fuzz.ratio(na, nb)))


_GENERIC_WORDS = {"bank", "clinic", "dental", "hospital", "advisory", "advisors", "global", "group", "the", "and", "co",
                  "reviews", "complaints", "customer", "care", "official", "store", "shop"}


def brand_tokens(subject: str) -> list[str]:
    """Distinctive words of an entity name, e.g. 'Profit Kings Advisory' -> ['profit', 'kings']."""
    return [w for w in normalize_name(subject).split() if w not in _GENERIC_WORDS and len(w) > 1]


def brand_token(subject: str) -> str:
    return "".join(brand_tokens(subject))


def mentions(subject: str, text: str) -> bool:
    """True when the text names the entity: all distinctive words (or their joined form) appear."""
    tokens = brand_tokens(subject)[:3]
    if not tokens:
        return False
    norm = normalize_name(text)
    words = set(norm.split())
    return all(t in words for t in tokens) or "".join(tokens) in norm.replace(" ", "")


SECOND_HAND_RE = re.compile(
    r"\b(refurb\w*|pre[- ]?owned|used|renewed|open[- ]?box|second[- ]?hand|unboxed|like new|\d{2}% new|wholesale|"
    r"\d{2}% battery|battery health|excellent condition|good condition)\b", re.I)
_VARIANTS = {"max", "plus", "mini", "ultra", "lite", "pro", "fe", "neo", "air", "kids", "kick", "toy"}
_STORAGE = re.compile(r"\b(\d+)\s*(gb|tb)\b", re.I)


def comparable_listing(product: str, title: str | None, condition: str | None = None) -> bool:
    """A new listing of the same model: no refurbished/pre-owned items, no other variants or storage sizes."""
    if not title or condition or SECOND_HAND_RE.search(title):
        return False
    q, t = product.lower(), title.lower()
    qw, tw = set(re.findall(r"[a-z0-9]+", q)), set(re.findall(r"[a-z0-9]+", t))
    if (qw & _VARIANTS) != (tw & _VARIANTS):
        return False
    numbers = {w for w in qw if w.isdigit() and len(w) <= 3}
    if numbers and not numbers <= tw:
        return False
    qs, ts = {m.group(1) for m in _STORAGE.finditer(q)}, {m.group(1) for m in _STORAGE.finditer(t)}
    return not (qs and ts and not (qs & ts))


def median(values: list[float]) -> float | None:
    return float(statistics.median(values)) if values else None


def now_utc() -> datetime:
    return datetime.now(UTC)


_REL_RE = re.compile(r"(\d+|an?|one)\s+(minute|hour|day|week|month|year)s?\s+ago", re.I)
_DATE_FORMATS = (
    "%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%m/%d/%Y, %I:%M %p, %z UTC", "%b %d, %Y",
    "%B %d, %Y", "%d %b %Y", "%d %B %Y", "%m/%d/%Y",
)


def parse_date(value: Any, reference: datetime | None = None) -> datetime | None:
    if not value:
        return None
    ref = reference or now_utc()
    text = str(value).strip()
    m = _REL_RE.search(text)
    if m:
        qty = 1 if m.group(1).lower() in ("a", "an", "one") else int(m.group(1))
        unit = m.group(2).lower()
        days = {"minute": 1 / 1440, "hour": 1 / 24, "day": 1, "week": 7, "month": 30, "year": 365}[unit]
        return ref - timedelta(days=qty * days)
    if text.lower() in ("today", "just now"):
        return ref
    if text.lower() == "yesterday":
        return ref - timedelta(days=1)
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(text, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        return None


def days_ago(value: Any, reference: datetime | None = None) -> float | None:
    dt = parse_date(value, reference)
    if not dt:
        return None
    return ((reference or now_utc()) - dt).total_seconds() / 86400


REVIEW_TOPICS: dict[str, tuple[str, ...]] = {
    "harassment": ("harass", "abuse", "threat", "contacts", "call my family", "morphed", "blackmail", "abusive",
                   "recovery agent", "torture", "defame"),
    "hidden_charges": ("hidden charge", "processing fee", "extra charge", "deducted", "high interest",
                       "interest rate", "cut", "less amount", "only received", "gst"),
    "fraud_terms": ("fraud", "scam", "fake", "cheat", "illegal", "loot", "chor"),
    "data_privacy": ("permission", "access to contacts", "gallery", "privacy", "data", "photos"),
    "disbursal": ("instant", "approved", "disbursed", "quick", "fast"),
    "support": ("customer care", "support", "no response", "not responding", "helpline"),
    "battery_range": ("range", "battery", "charging", "charge"),
    "service": ("service center", "service centre", "spare", "after sales", "workshop"),
    "price_value": ("price", "costly", "expensive", "value for money", "worth", "cheap"),
    "quality": ("quality", "build", "broke", "defect", "issue", "problem"),
    "delivery": ("delivery", "late", "delay", "waiting period"),
}
COMPLAINT_TOPICS = ("harassment", "hidden_charges", "fraud_terms", "data_privacy")


@lru_cache(maxsize=512)
def _word_re(word: str) -> re.Pattern[str]:
    return re.compile(r"(?<![a-z0-9])" + re.escape(word))


def has_word(text_lower: str, words: tuple[str, ...]) -> bool:
    """Word-start matching: 'harass' matches 'harassment' but 'ban' does not match 'urbanamp'."""
    return any(_word_re(w).search(text_lower) for w in words)


def tag_topics(text: str, topics: dict[str, tuple[str, ...]] = REVIEW_TOPICS) -> list[str]:
    low = text.lower()
    return [name for name, words in topics.items() if has_word(low, words)]


NEWS_CATEGORIES: dict[str, tuple[str, ...]] = {
    "enforcement": ("rbi", "ban", "banned", "arrest", "police", "ed raid", "seized", "blocked", "removed",
                    "crackdown", "fir", "illegal loan", "cyber crime", "cybercrime", "action against", "sebi order"),
    "complaint": ("complaint", "harass", "victim", "scam", "fraud", "suicide", "extortion"),
    "funding": ("raises", "funding", "series a", "series b", "investment", "valuation"),
    "launch": ("launch", "launches", "unveil", "introduces", "new model"),
    "pricing": ("price cut", "price hike", "discount", "subsidy", "fame", "pm e-drive", "offer"),
}


def news_category(title: str) -> str:
    low = title.lower()
    for name, words in NEWS_CATEGORIES.items():
        if has_word(low, words):
            return name
    return "general"


COMPLAINT_DOMAINS = ("consumercomplaints.in", "voxya.com", "mouthshut.com", "trustpilot.com", "reddit.com",
                     "quora.com", "complaintboard.in", "akosha.com", "sachet.rbi.org.in")
COMPLAINT_WORDS = ("fraud", "scam", "fake", "complaint", "harass", "cheat", "illegal", "beware", "warning")
