"""Engine Atlas: every SerpApi engine the platform uses, what it proves, and which agents use it."""

from __future__ import annotations

from typing import Any

ENGINE_ATLAS: dict[str, dict[str, str]] = {
    "google_light": {"title": "Google Search (Light)", "docs": "https://serpapi.com/google-light-api",
                     "proves": "Complaints, scam warnings and the official site across the open web."},
    "google_play": {"title": "Google Play Store", "docs": "https://serpapi.com/google-play-api",
                    "proves": "Whether the promoted app exists on Play and who publishes it."},
    "google_play_product": {"title": "Google Play Product & Reviews", "docs": "https://serpapi.com/google-play-product-api",
                            "proves": "Developer identity, installs, and the newest reviews sorted by date."},
    "google_maps": {"title": "Google Maps", "docs": "https://serpapi.com/google-maps-api",
                    "proves": "That a business physically exists, with address, phone and rating."},
    "google_maps_reviews": {"title": "Google Maps Reviews", "docs": "https://serpapi.com/google-maps-reviews-api",
                            "proves": "What customers say right now, with Google's own topic counts."},
    "google_news": {"title": "Google News", "docs": "https://serpapi.com/google-news-api",
                    "proves": "Dated events: enforcement, complaints, launches, funding, price changes."},
    "google_ads_transparency_center": {"title": "Google Ads Transparency Center",
                                       "docs": "https://serpapi.com/google-ads-transparency-center-api",
                                       "proves": "Which verified advertiser pays for the ads, and their creatives."},
    "google_shopping": {"title": "Google Shopping", "docs": "https://serpapi.com/google-shopping-api",
                        "proves": "Live prices from Indian stores for the exact product."},
    "google_immersive_product": {"title": "Google Immersive Product", "docs": "https://serpapi.com/google-immersive-product-api",
                                 "proves": "The full store list and prices for one product."},
    "amazon": {"title": "Amazon (amazon.in)", "docs": "https://serpapi.com/amazon-search-api",
               "proves": "The Amazon India price as an independent reference."},
    "google_trends": {"title": "Google Trends", "docs": "https://serpapi.com/google-trends-api",
                      "proves": "Demand over time, interest by Indian state, and rising searches."},
    "google_lens": {"title": "Google Lens", "docs": "https://serpapi.com/google-lens-api",
                    "proves": "Where else an image appears online (reused 'proof' screenshots)."},
    "google_flights": {"title": "Google Flights", "docs": "https://serpapi.com/google-flights-api",
                       "proves": "Real fares and whether today's price is low, typical or high."},
    "google_hotels": {"title": "Google Hotels", "docs": "https://serpapi.com/google-hotels-api",
                      "proves": "Real nightly rates for a destination and date."},
    "google_finance": {"title": "Google Finance", "docs": "https://serpapi.com/google-finance-api",
                       "proves": "The live NSE quote behind a stock tip."},
    "google_jobs": {"title": "Google Jobs", "docs": "https://serpapi.com/google-jobs-api",
                    "proves": "Whether an employer is really hiring for the role."},
}


def atlas() -> list[dict[str, Any]]:
    from evidence_agents.agents import all_agents

    usage: dict[str, list[str]] = {}
    for agent in all_agents():
        for engine in agent.spec.engines:
            usage.setdefault(engine, []).append(agent.spec.id)
    return [{"engine": k, **v, "agents": usage.get(k, [])} for k, v in ENGINE_ATLAS.items()]
