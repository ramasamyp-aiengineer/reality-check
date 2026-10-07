from evidence_agents.rules import rule
from evidence_agents.signals import (
    ClaimSet,
    FareInsight,
    Finding,
    HotelBand,
    ImageMatches,
    JobPostings,
    PlaceProfile,
    Quote,
    SignalBag,
    TrendSeries,
)

_RISKY = {"loan_offer", "investment_tip", "job_offer", "customer_care"}


def _digits(phone: str) -> str:
    d = "".join(ch for ch in phone if ch.isdigit())
    return d[-10:]


@rule("place.listed", "Business listed on Google Maps", ("PlaceProfile",),
      "A Maps listing whose name matches the claim shows the business has a public, reviewable presence.")
def place_listed(bag: SignalBag) -> list[Finding]:
    out = []
    for p in bag.all(PlaceProfile):
        if p.agent != "place_reality" or not p.data_id or p.match_score < 70:
            continue
        reviews = f" · {p.rating}★ from {p.reviews_count} reviews" if p.rating and p.reviews_count else ""
        severity = "medium" if (p.reviews_count or 0) >= 50 else "low"
        out.append(Finding(id="place_listed", rule="", kind="support", severity=severity,
                           title=f"'{p.name}' is listed on Google Maps{reviews}",
                           detail=p.address or "", evidence_ids=p.evidence_ids))
    return out


@rule("place.missing", "No matching Google Maps listing", ("PlaceProfile", "ClaimSet"),
      "The named business has no Maps listing, or the closest listing is a different business.")
def place_missing(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    out = []
    for p in bag.all(PlaceProfile):
        if p.agent != "place_reality" or p.match_score >= 50:
            continue
        risky = claim.claim_type in _RISKY
        title = (f"No Google Maps listing found for '{p.name}'" if not p.data_id
                 else f"Closest Google Maps listing is a different business: '{p.name}'")
        out.append(Finding(id="place_missing", rule="", kind="gap", severity="medium" if risky else "low",
                           title=title,
                           detail="Many genuine online businesses have no Maps listing, so this is a gap, not proof.",
                           evidence_ids=p.evidence_ids))
    return out


@rule("place.phone_mismatch", "Phone number differs from the listed one", ("PlaceProfile", "ClaimSet"),
      "The number in the message is not the number the business publishes on its Maps listing.")
def phone_mismatch(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    if not claim.phones:
        return []
    out = []
    for p in bag.all(PlaceProfile):
        if not p.phone or p.match_score < 70:
            continue
        listed = _digits(p.phone)
        claimed = [ph for ph in claim.phones if _digits(ph) != listed]
        if len(claimed) == len(claim.phones):
            severity = "high" if claim.claim_type == "customer_care" else "medium"
            out.append(Finding(id="place_phone_mismatch", rule="", kind="contradiction", severity=severity,
                               title=f"The number in the message differs from {p.name}'s listed number",
                               detail=f"Message: {', '.join(claim.phones)} · Listed: {p.phone}. "
                                      "Call only numbers published on the official website or app.",
                               evidence_ids=p.evidence_ids))
        else:
            out.append(Finding(id="place_phone_match", rule="", kind="support", severity="medium",
                               title=f"The number matches {p.name}'s listed number", evidence_ids=p.evidence_ids))
    return out


@rule("jobs.employer_postings", "Employer's job postings", ("JobPostings",),
      "Real employers that recruit at scale usually have visible postings on job boards.")
def employer_postings(bag: SignalBag) -> list[Finding]:
    out = []
    for j in bag.all(JobPostings):
        if j.employer_found is False:
            out.append(Finding(id="jobs_employer_missing", rule="", kind="contradiction", severity="medium",
                               title=f"No Google Jobs postings from the named employer for '{j.query}'",
                               detail=f"{j.count} postings scanned; employers seen: {', '.join(j.employers[:4]) or 'none'}.",
                               evidence_ids=j.evidence_ids[:3]))
        elif j.employer_found:
            out.append(Finding(id="jobs_employer_found", rule="", kind="support", severity="medium",
                               title=f"The employer has live postings on Google Jobs ({j.count} found)",
                               evidence_ids=j.evidence_ids[:3]))
    return out


@rule("image.reused", "Image already published elsewhere", ("ImageMatches",),
      "An image that appears on many unrelated pages is likely reused rather than original proof.")
def image_reused(bag: SignalBag) -> list[Finding]:
    out = []
    for m in bag.all(ImageMatches):
        if m.match_count >= 3:
            earliest = f" Earliest copy: {m.earliest_source}." if m.earliest_source else ""
            out.append(Finding(id="image_reused", rule="", kind="contradiction",
                               severity="high" if m.match_count >= 10 else "medium",
                               title=f"The same image appears on {m.match_count} other pages",
                               detail="Sources: " + ", ".join(m.sources[:5]) + "." + earliest,
                               evidence_ids=m.evidence_ids[:4]))
        elif m.match_count == 0:
            out.append(Finding(id="image_original", rule="", kind="signal", severity="low",
                               title="No exact copies of the image were found online", evidence_ids=m.evidence_ids[:1]))
    return out


@rule("travel.hotel_band", "Hotel price versus bookable rates", ("HotelBand", "ClaimSet"),
      "Compares the offered nightly price with live Google Hotels rates for the same place.")
def hotel_band(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    price = claim.claimed_price
    out = []
    for h in bag.all(HotelBand):
        if not price or not h.median_price:
            continue
        band = (f"Live rates for {h.check_in} across {h.property_count} properties: lowest Rs {(h.min_price or 0):,.0f}, "
                f"median Rs {h.median_price:,.0f}, upper quartile Rs {(h.p75_price or h.median_price):,.0f}.")
        if h.rated_median:
            band += f" Star-rated hotels ({h.rated_count}): median Rs {h.rated_median:,.0f}."
        ids = h.evidence_ids[:3]
        in_band = price <= h.median_price * 1.15
        in_rated = bool(h.rated_median) and price <= (h.rated_median or 0) * 1.5
        if h.min_price and price < 0.5 * h.min_price:
            out.append(Finding(id="hotel_too_cheap", rule="", kind="contradiction", severity="medium",
                               title=f"Rs {price:,.0f}/night is far below any bookable hotel in {h.location}",
                               detail=band, evidence_ids=ids))
        elif in_band or in_rated:
            title = (f"Rs {price:,.0f}/night is in line with live rates in {h.location}" if in_band
                     else f"Rs {price:,.0f}/night is in line with star-rated hotels in {h.location}")
            out.append(Finding(id="hotel_in_band", rule="", kind="support", severity="medium", title=title,
                               detail=band, evidence_ids=ids))
            if h.property_count >= 5:
                out.append(Finding(id="hotel_availability", rule="", kind="support", severity="low",
                                   title=f"{h.property_count} properties are bookable in {h.location} for {h.check_in}",
                                   evidence_ids=h.evidence_ids[3:4] or h.evidence_ids[:1]))
        elif price <= (h.p75_price or h.median_price) * 1.5:
            out.append(Finding(id="hotel_above_band", rule="", kind="signal", severity="low",
                               title=f"Rs {price:,.0f}/night is at the upper end of live rates in {h.location}",
                               detail=band + " Compare with booking directly.", evidence_ids=ids))
        else:
            out.append(Finding(id="hotel_overpriced", rule="", kind="contradiction", severity="medium",
                               title=f"Rs {price:,.0f}/night costs more than most bookable stays in {h.location}",
                               detail=band + " The 'package' is not a discount on live rates.", evidence_ids=ids))
    return out


@rule("travel.season", "Seasonal search demand", ("TrendSeries", "ClaimSet"),
      "For trips: whether searches for the destination are near their yearly peak (crowds and surge pricing).")
def travel_season(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet = bag.first(ClaimSet)
    if claim.claim_type != "travel":
        return []
    out = []
    for t in bag.all(TrendSeries):
        if not t.keywords or not t.points:
            continue
        key = t.keywords[0]
        values = [p.values.get(key, 0) for p in t.points]
        peak = max(values) or 0
        recent = sum(values[-3:]) / min(3, len(values))
        if peak and recent >= 0.75 * peak:
            out.append(Finding(id="travel_peak_season", rule="", kind="signal", severity="medium",
                               title=f"Searches for {key} are near their yearly peak",
                               detail="Expect crowds and surge pricing; book refundable rates and confirm directly.",
                               evidence_ids=t.evidence_ids[:1]))
        elif peak and recent <= 0.4 * peak:
            out.append(Finding(id="travel_off_season", rule="", kind="signal", severity="low",
                               title=f"Searches for {key} are well below peak: off-season pricing likely",
                               evidence_ids=t.evidence_ids[:1]))
    return out


@rule("travel.fare_band", "Fare versus Google Flights", ("FareInsight",),
      "Compares the offered fare with Google Flights' lowest and typical prices for the route.")
def fare_band(bag: SignalBag) -> list[Finding]:
    claim: ClaimSet | None = bag.first(ClaimSet)
    out = []
    for f in bag.all(FareInsight):
        price = f.claimed_price or (claim.claimed_price if claim else None)
        if not price or not f.lowest_price:
            continue
        if price < 0.5 * f.lowest_price:
            out.append(Finding(id="fare_too_cheap", rule="", kind="contradiction", severity="medium",
                               title=f"Rs {price:,.0f} is far below the lowest fare on {f.route}",
                               detail=f"Google Flights lowest: Rs {f.lowest_price:,.0f}.", evidence_ids=f.evidence_ids[:2]))
        elif f.typical_high is None or price <= f.typical_high:
            out.append(Finding(id="fare_in_band", rule="", kind="support", severity="low",
                               title=f"Rs {price:,.0f} is within the normal fare range for {f.route}",
                               evidence_ids=f.evidence_ids[:2]))
    return out


@rule("market.quote", "Live market quote", ("Quote",),
      "Shows the current market price so a tip can be compared with reality.")
def market_quote(bag: SignalBag) -> list[Finding]:
    out = []
    for q in bag.all(Quote):
        if q.price is None:
            continue
        change = f" ({q.change_pct:+.1f}% today)" if q.change_pct is not None else ""
        out.append(Finding(id=f"quote_{q.symbol}", rule="", kind="signal", severity="low",
                           title=f"{q.name or q.symbol} trades at {q.currency} {q.price:,.2f}{change}",
                           detail="A price quote cannot confirm any promised return.", evidence_ids=q.evidence_ids[:1]))
    return out
