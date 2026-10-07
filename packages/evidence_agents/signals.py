"""Typed evidence model shared by agents, rules, the engine, the API and the UI.

Every agent emits `Evidence` items (raw, source-attributed facts) and `Signal`s
(typed summaries that rules reason over). Rules attach to signal types, never to
workflows, so any composition of agents still yields a valid verdict.
"""

from __future__ import annotations

import hashlib
from typing import Any, Literal

from pydantic import BaseModel, Field


def evidence_id(*parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    return "ev_" + hashlib.sha1(raw.encode("utf-8"), usedforsecurity=False).hexdigest()[:12]


class Evidence(BaseModel):
    id: str
    agent: str
    engine: str | None = None
    kind: str
    title: str
    snippet: str = ""
    url: str | None = None
    source: str | None = None
    published_at: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class Signal(BaseModel):
    type: str
    agent: str = ""
    evidence_ids: list[str] = Field(default_factory=list)


ClaimType = Literal[
    "loan_offer",
    "investment_tip",
    "job_offer",
    "deal_price",
    "customer_care",
    "market_research",
    "travel",
    "local_service",
    "generic",
]


class Entity(BaseModel):
    name: str
    kind: Literal["app", "company", "product", "brand", "person", "place", "domain", "phone", "topic"] = "company"


class ClaimSet(Signal):
    type: Literal["ClaimSet"] = "ClaimSet"
    raw_text: str
    claim_type: ClaimType = "generic"
    summary: str = ""
    entities: list[Entity] = Field(default_factory=list)
    app_name: str | None = None
    company_name: str | None = None
    product: str | None = None
    topic: str | None = None
    claimed_price: float | None = None
    amounts: list[float] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    phones: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    city: str | None = None


class BusinessProfile(Signal):
    type: Literal["BusinessProfile"] = "BusinessProfile"
    business_name: str = ""
    topic: str
    city: str | None = None
    price: float | None = None
    usp: str | None = None
    audience: str | None = None
    competitors: list[str] = Field(default_factory=list)


class RegistryStatus(Signal):
    type: Literal["RegistryStatus"] = "RegistryStatus"
    registry: Literal["rbi_dla", "sebi_ia_ra"]
    query: str
    matched: bool
    match_name: str | None = None
    match_owner: str | None = None
    regulated_entity: str | None = None
    match_score: float = 0.0
    match_method: Literal["package_id", "fuzzy_name", "none"] = "none"
    checked_at: str
    source_url: str
    snapshot_size: int = 0
    is_sample: bool = False


class AppProfile(Signal):
    type: Literal["AppProfile"] = "AppProfile"
    title: str
    product_id: str | None = None
    developer: str | None = None
    rating: float | None = None
    reviews_count: int | None = None
    installs: str | None = None
    updated: str | None = None
    link: str | None = None
    category: str | None = None
    match_score: float = 0.0


class ReviewQuote(BaseModel):
    text: str
    rating: float | None = None
    date: str | None = None
    topics: list[str] = Field(default_factory=list)
    evidence_id: str | None = None


class ReviewWindow(Signal):
    type: Literal["ReviewWindow"] = "ReviewWindow"
    source: Literal["play", "maps", "amazon"]
    entity: str
    overall_rating: float | None = None
    newest_avg: float | None = None
    newest_count: int = 0
    topic_shares: dict[str, float] = Field(default_factory=dict)
    quotes: list[ReviewQuote] = Field(default_factory=list)
    complaint_share: float = 0.0


class ComplaintMentions(Signal):
    type: Literal["ComplaintMentions"] = "ComplaintMentions"
    query: str
    subject: str | None = None
    # "product" means the search was about the item itself, so complaints describe the product, not the offer.
    subject_kind: Literal["entity", "seller", "product"] = "entity"
    results_scanned: int = 0
    complaint_hits: int = 0
    complaint_domains: list[str] = Field(default_factory=list)
    official_domain: str | None = None
    official_site_found: bool = False


class NewsItem(BaseModel):
    title: str
    source: str | None = None
    date: str | None = None
    category: Literal["enforcement", "complaint", "launch", "funding", "pricing", "general"] = "general"
    mentions_subject: bool = True
    evidence_id: str | None = None


class NewsEvents(Signal):
    type: Literal["NewsEvents"] = "NewsEvents"
    query: str
    items: list[NewsItem] = Field(default_factory=list)
    enforcement_count: int = 0
    recent_enforcement_count: int = 0


class Advertiser(BaseModel):
    name: str
    advertiser_id: str | None = None
    ad_count: int = 0
    region: str | None = None
    evidence_id: str | None = None


class AdCreative(BaseModel):
    advertiser: str
    format: str | None = None
    first_shown: str | None = None
    last_shown: str | None = None
    link: str | None = None
    image: str | None = None
    evidence_id: str | None = None


class AdvertiserProfile(Signal):
    type: Literal["AdvertiserProfile"] = "AdvertiserProfile"
    query: str
    advertisers: list[Advertiser] = Field(default_factory=list)
    creatives: list[AdCreative] = Field(default_factory=list)
    total_creatives: int = 0


class PriceObservation(BaseModel):
    store: str
    price: float
    title: str | None = None
    url: str | None = None
    rating: float | None = None
    evidence_id: str | None = None


class PriceBand(Signal):
    type: Literal["PriceBand"] = "PriceBand"
    product: str
    currency: str = "INR"
    observations: list[PriceObservation] = Field(default_factory=list)
    min_price: float | None = None
    median_price: float | None = None
    max_price: float | None = None
    store_count: int = 0
    claimed_price: float | None = None


class TrendPoint(BaseModel):
    date: str
    values: dict[str, float]


class TrendSeries(Signal):
    type: Literal["TrendSeries"] = "TrendSeries"
    keywords: list[str]
    geo: str = "IN"
    points: list[TrendPoint] = Field(default_factory=list)
    momentum_pct: dict[str, float] = Field(default_factory=dict)
    peak_date: str | None = None


class RegionValue(BaseModel):
    name: str
    value: float


class RegionInterest(Signal):
    type: Literal["RegionInterest"] = "RegionInterest"
    keyword: str
    regions: list[RegionValue] = Field(default_factory=list)


class QueryValue(BaseModel):
    query: str
    value: str


class RisingQueries(Signal):
    type: Literal["RisingQueries"] = "RisingQueries"
    keyword: str
    rising: list[QueryValue] = Field(default_factory=list)
    top: list[QueryValue] = Field(default_factory=list)


class PlaceProfile(Signal):
    type: Literal["PlaceProfile"] = "PlaceProfile"
    name: str
    address: str | None = None
    rating: float | None = None
    reviews_count: int | None = None
    phone: str | None = None
    website: str | None = None
    place_type: str | None = None
    data_id: str | None = None
    match_score: float = 0.0


class ImageMatches(Signal):
    type: Literal["ImageMatches"] = "ImageMatches"
    image_url: str
    match_count: int = 0
    earliest_source: str | None = None
    sources: list[str] = Field(default_factory=list)


class FareInsight(Signal):
    type: Literal["FareInsight"] = "FareInsight"
    route: str
    lowest_price: float | None = None
    typical_low: float | None = None
    typical_high: float | None = None
    price_level: str | None = None
    claimed_price: float | None = None


class HotelBand(Signal):
    type: Literal["HotelBand"] = "HotelBand"
    location: str
    check_in: str
    median_price: float | None = None
    min_price: float | None = None
    p75_price: float | None = None
    rated_median: float | None = None
    rated_count: int = 0
    property_count: int = 0


class Quote(Signal):
    type: Literal["Quote"] = "Quote"
    symbol: str
    name: str | None = None
    price: float | None = None
    change_pct: float | None = None
    currency: str = "INR"


class JobPostings(Signal):
    type: Literal["JobPostings"] = "JobPostings"
    query: str
    count: int = 0
    employers: list[str] = Field(default_factory=list)
    employer_found: bool | None = None


class Opportunity(BaseModel):
    text: str
    evidence_ids: list[str] = Field(default_factory=list)


class MarketBrief(Signal):
    type: Literal["MarketBrief"] = "MarketBrief"
    topic: str
    momentum_pct: float | None = None
    momentum_label: str = "unknown"
    top_regions: list[RegionValue] = Field(default_factory=list)
    rising_queries: list[str] = Field(default_factory=list)
    price_floor: float | None = None
    price_median: float | None = None
    competitor_advertisers: list[str] = Field(default_factory=list)
    pain_points: list[str] = Field(default_factory=list)
    opportunities: list[Opportunity] = Field(default_factory=list)
    summary: str = ""


class AdClaim(BaseModel):
    text: str
    evidence_ids: list[str] = Field(default_factory=list)
    supported: bool = True


class AdVariant(BaseModel):
    channel: Literal["google_search", "instagram", "linkedin", "whatsapp"]
    headlines: list[str] = Field(default_factory=list)
    descriptions: list[str] = Field(default_factory=list)
    body: str = ""
    hashtags: list[str] = Field(default_factory=list)
    claims: list[AdClaim] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)


class AdPack(Signal):
    type: Literal["AdPack"] = "AdPack"
    topic: str
    business_name: str = ""
    variants: list[AdVariant] = Field(default_factory=list)
    target_regions: list[str] = Field(default_factory=list)
    target_keywords: list[str] = Field(default_factory=list)
    compliance_flags: list[str] = Field(default_factory=list)
    generated_by: str = "rules"


FindingKind = Literal["contradiction", "support", "gap", "signal"]


class Finding(BaseModel):
    id: str
    rule: str
    kind: FindingKind
    severity: Literal["high", "medium", "low"] = "medium"
    title: str
    detail: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    signal_types: list[str] = Field(default_factory=list)


class ConfidenceFactor(BaseModel):
    name: str
    score: float
    weight: float
    detail: str


class Action(BaseModel):
    label: str
    url: str | None = None
    kind: Literal["verify", "report", "protect", "proceed", "watch"] = "verify"


EvidenceStatus = Literal["CORROBORATED", "CONTRADICTED", "UNVERIFIED", "INSUFFICIENT_EVIDENCE"]
Decision = Literal["SAFE_TO_PROCEED", "PROCEED_WITH_CAUTION", "WAIT_VERIFY_MORE", "DO_NOT_PROCEED"]


class Verdict(Signal):
    type: Literal["Verdict"] = "Verdict"
    evidence_status: EvidenceStatus
    decision: Decision
    confidence: float
    confidence_factors: list[ConfidenceFactor] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    actions: list[Action] = Field(default_factory=list)
    headline: str = ""
    explanation: str = ""
    explained_by: str = "rules"


SIGNAL_TYPES: dict[str, type[Signal]] = {
    cls.model_fields["type"].default: cls
    for cls in [
        ClaimSet, BusinessProfile, RegistryStatus, AppProfile, ReviewWindow, ComplaintMentions, NewsEvents,
        AdvertiserProfile, PriceBand, TrendSeries, RegionInterest, RisingQueries, PlaceProfile, ImageMatches,
        FareInsight, HotelBand, Quote, JobPostings, MarketBrief, AdPack, Verdict,
    ]
}


def signal_from_dict(data: dict[str, Any]) -> Signal:
    cls = SIGNAL_TYPES.get(data.get("type", ""), Signal)
    return cls.model_validate(data)


class SignalBag:
    """All signals and evidence produced so far in a run, indexed by type."""

    def __init__(self) -> None:
        self.signals: list[Signal] = []
        self.evidence: dict[str, Evidence] = {}

    def add(self, signals: list[Signal], evidence: list[Evidence]) -> None:
        self.signals.extend(signals)
        for ev in evidence:
            self.evidence[ev.id] = ev

    def all(self, cls: type[Signal]) -> list[Any]:
        return [s for s in self.signals if isinstance(s, cls)]

    def first(self, cls: type[Signal]) -> Any | None:
        found = self.all(cls)
        return found[0] if found else None

    def types(self) -> set[str]:
        return {s.type for s in self.signals}

    def engines(self) -> set[str]:
        return {e.engine for e in self.evidence.values() if e.engine}
