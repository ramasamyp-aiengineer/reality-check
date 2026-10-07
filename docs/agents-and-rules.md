# Agents and rules reference

Reality Check has **17 agents** and **30 verdict rules**. This page lists all of them as they are defined in code
(`packages/evidence_agents/agents/` and `packages/evidence_agents/rules/`). The app shows the same catalogue under
*Agents & engines*.

## How the pieces fit

1. **Intent** reads the input and produces a `ClaimSet`: the claim type, the entities, prices, links and red-flag
   phrases.
2. **Evidence agents** each run one to three SerpApi searches and turn the results into typed signals, such as
   `AppProfile`, `ReviewWindow` or `PriceBand`, plus evidence items with their sources.
3. **Registry** checks the official RBI or SEBI snapshot. It makes no SerpApi call.
4. **Synthesis agents** (Market Brief, Ad Studio) combine signals into a brief or an ad pack.
5. **Verdict** runs every rule whose required signals are present, then works out the evidence status, the decision
   and the confidence.

Each agent declares what it consumes, what it produces and how many searches it may spend. That is why any graph you
build on the canvas, or that the planner builds for you, can be validated and priced before it runs, and still gets a
verdict.

## Agents

### Core

| Agent | Answers | Consumes | Produces | Searches |
|---|---|---|---|---|
| Intent | What exactly is being claimed, and about whom? | input | `ClaimSet` | 0 |
| Verdict | Given the evidence, what should I do? Rules decide; the LLM only explains. | all signals | `Verdict` | 0 |

### Ground truth

| Agent | Answers | Consumes | Produces | Searches |
|---|---|---|---|---|
| Registry | Has a regulated entity reported this app to RBI, or is the adviser SEBI-registered? | `ClaimSet`, `AppProfile` | `RegistryStatus` | 0 |

The RBI list is the official Digital Lending Apps directory: 2,868 listings, 1,153 apps and 457 regulated entities,
exported on 7 Oct 2026. Matching tries the Play Store package id first. If that fails, it matches on the distinctive
words in the name and ignores generic lending words. The fuzzy threshold is 86, and names made only of generic words
need 95. The SEBI snapshot is still a sample.

### Evidence (live SerpApi)

| Agent | Answers | Engines | Produces | Est. searches |
|---|---|---|---|---|
| Web Reputation | Do independent sites and forums warn about this entity? | `google_light` | `ComplaintMentions` | 1 |
| App Identity | Is the app on Play, and who really publishes it? | `google_play`, `google_play_product` | `AppProfile` | 2 |
| Review Voice | What are customers saying right now, not two years ago? | `google_play_product`, `google_maps`, `google_maps_reviews` | `ReviewWindow` | 1 |
| Price Reality | What does the product really cost across stores today? | `google_shopping`, `google_immersive_product`, `amazon` | `PriceBand` | 3 |
| News Timeline | What happened recently: crackdowns, launches, price changes? | `google_news` | `NewsEvents` | 1 |
| Advertiser Identity | Which verified company is actually behind the ads? | `google_ads_transparency_center`, `google_light` | `AdvertiserProfile` | 2 |
| Demand Trend | Is demand rising, where in India, and what do people search next? | `google_trends` | `TrendSeries`, `RegionInterest`, `RisingQueries` | 3 |
| Place Reality | Does the shop, clinic or office exist where it says? | `google_maps` | `PlaceProfile` | 1 |
| Visual Provenance | Is a "proof" screenshot or product photo reused from elsewhere? | `google_lens` | `ImageMatches` | 1 |
| Travel Price | Does a travel "deal" beat what anyone can book today? | `google_flights`, `google_hotels` | `FareInsight`, `HotelBand` | 1 |
| Market | What is the real price and movement behind a stock tip? | `google_finance` | `Quote` | 1 |
| Jobs Demand | Does the job exist on real job boards? | `google_jobs` | `JobPostings` | 1 |

### Synthesis

| Agent | Answers | Consumes | Produces |
|---|---|---|---|
| Market Brief | Where is demand, what do competitors do, and what gap can I attack? | trends, regions, rising queries, prices, advertisers, reviews, news | `MarketBrief` |
| Ad Studio | Which ad claims can the evidence back? | `MarketBrief`, `BusinessProfile`, `PriceBand` | `AdPack` |

Ad Studio writes Google Search, Instagram, LinkedIn and WhatsApp copy. Every claim links to its evidence. It flags
unsupported superlatives, price claims below the market floor, and lines that are too long.

## Verdict rules

Each rule declares the signal types it requires. It runs only when those signals are present, and returns findings of
four kinds: contradiction, gap, signal or support. Each finding has a severity and the ids of the evidence behind it.

| Rule | Title | Requires | What it checks |
|---|---|---|---|
| `ads.advertiser_identity` | Who is paying for the ads | `AdvertiserProfile`, `ClaimSet` | Verified advertiser names in Google's Ads Transparency Center against the claimed or registered company |
| `app.not_found` | App not found on Google Play | `ClaimSet` | The message promotes an app that Play search does not return |
| `app.developer_mismatch` | Developer does not match the claimed or registered company | `AppProfile` | The Play developer name against the company in the message and in the registry |
| `app.low_rating` | Low Play Store rating | `AppProfile` | An overall rating under 3.0 |
| `claim.red_flags` | Pressure and red-flag phrases | `ClaimSet` | Phrases regulators and police link to scams, such as no credit check, upfront fee or guaranteed returns |
| `news.recent_enforcement` | Recent enforcement news | `NewsEvents` | Bans, arrests, takedowns or regulator action in the last 180 days |
| `news.complaints` | Complaint coverage in news | `NewsEvents` | Two or more news items about victims or complaints |
| `place.listed` | Business listed on Google Maps | `PlaceProfile` | A matching Maps listing with a public, reviewable presence |
| `place.missing` | No matching Google Maps listing | `PlaceProfile`, `ClaimSet` | No listing, or the closest listing is a different business |
| `place.phone_mismatch` | Phone number differs from the listed one | `PlaceProfile`, `ClaimSet` | The number in the message against the number on the Maps listing |
| `jobs.employer_postings` | Employer's job postings | `JobPostings` | Whether the employer has visible postings on job boards |
| `image.reused` | Image already published elsewhere | `ImageMatches` | An image that appears on many unrelated pages |
| `travel.hotel_band` | Hotel price versus bookable rates | `HotelBand`, `ClaimSet` | The offered nightly price against live Google Hotels rates |
| `travel.season` | Seasonal search demand | `TrendSeries`, `ClaimSet` | Whether searches for the destination are near their yearly peak |
| `travel.fare_band` | Fare versus Google Flights | `FareInsight` | The offered fare against Google Flights' lowest and typical prices |
| `market.quote` | Live market quote | `Quote` | The current market price behind a tip |
| `price.too_good` | Price too good to be true | `PriceBand` | A claimed price more than 40% below the lowest store price |
| `price.below_market` | Cheaper than every store | `PriceBand` | Up to 15% below the cheapest store is a caution signal (often a bank offer); 15–40% is a contradiction |
| `price.within_band` | Price is within the market band | `PriceBand` | The claimed price sits between the cheapest and the most expensive store |
| `price.above_market` | Pricier than every store | `PriceBand` | The claimed price is higher than every store |
| `price.no_seller` | Offer names no store | `PriceBand`, `ClaimSet` | A deal with no store name or link, so the seller cannot be checked |
| `price.thin_market` | Few stores found | `PriceBand` | Fewer than three stores list the product |
| `registry.not_listed` | Not found in the regulator registry | `RegistryStatus`, `ClaimSet` | A lender or adviser missing from the official snapshot |
| `registry.listed` | Listed in the regulator registry | `RegistryStatus` | A registry match, which is strong ground truth |
| `registry.lender_mismatch` | Claimed lender differs from the registered one | `RegistryStatus`, `ClaimSet` | The forward names a company that is not the regulated entity behind the listed app |
| `reviews.momentum_drop` | Review momentum has turned | `ReviewWindow` | A newest-review average more than 1.5 stars below the overall rating |
| `reviews.complaint_share` | Recent reviews report harm | `ReviewWindow` | Harassment, hidden charges, fraud or data access in more than 20% of the newest reviews |
| `reviews.healthy` | Recent reviews are healthy | `ReviewWindow` | Newest reviews average 4 or more with almost no complaint topics |
| `web.complaints` | Complaints across the web | `ComplaintMentions` | Complaint sites and forums mention the seller with fraud or scam terms; complaints about the product itself are only a signal |
| `web.official_site` | Official website found | `ComplaintMentions` | An official domain for the entity appears in organic results |

## From findings to a verdict

**Evidence status** is checked in this order:

| Status | Condition |
|---|---|
| INSUFFICIENT_EVIDENCE | No evidence-bearing signal, or fewer than 3 evidence items |
| CONTRADICTED | A high-severity contradiction, or 2 or more contradictions |
| UNVERIFIED | One contradiction, or a high-severity gap |
| CORROBORATED | 2 or more supports |
| UNVERIFIED | Otherwise, any support or open question (a gap, or a signal above low severity) |
| INSUFFICIENT_EVIDENCE | Anything else |

**Decision.** The decision is one of Do not proceed, Proceed with caution, Wait and verify more, or Safe to proceed. It
depends on the status and on whether the claim type is risky (loan, investment, job or customer care).

**Confidence** is a weighted mix of five factors, each shown in the report:

| Factor | Weight | Measures |
|---|---|---|
| Source independence | 25% | Distinct SerpApi engines and web domains |
| Entity match | 20% | How well results match the subject |
| Ground truth | 20% | Whether an official registry was checked |
| Agreement | 20% | Findings that point the same way |
| Recency | 15% | Dated evidence from the last 90 days |

**Explanation.** When an LLM is configured, it writes the plain-language explanation from the findings only, in
English, Hindi or Tamil. Without an LLM, the rules write it. Either way, the verdict is the same.

## Workflow templates

| Template | Agents (after Intent) | Est. searches |
|---|---|---|
| Loan Forward Check | App Identity, Registry (RBI), Review Voice, Web Reputation, News Timeline, Advertiser Identity, Verdict | 6 |
| Market Pulse + Ad Studio | Demand Trend, News Timeline, Price Reality, Advertiser Identity, Review Voice (Maps), Market Brief, Ad Studio | 9 |
| Buy Decision | Price Reality, Web Reputation, Verdict | 4 |
| Competitor Watch | Advertiser Identity, News Timeline, Demand Trend, Market Brief | 4 |
| Investment Tip Check | Registry (SEBI), Market, Web Reputation, News Timeline, Verdict | 3 |
| Job Offer Check | Jobs Demand, Place Reality, Web Reputation, Verdict | 3 |
| Customer Care Number Check | Web Reputation, Place Reality, Verdict | 2 |
| Local Service Check | Place Reality, Review Voice (Maps), Web Reputation, Verdict | 4 |
| Image Provenance Check | Visual Provenance, Web Reputation, Verdict | 2 |
| Trip Timing | Travel Price, News Timeline, Demand Trend, Verdict | 3 |
