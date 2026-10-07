"""Build SYNTHETIC sample fixtures so demo mode runs offline before real responses are recorded.

All names (QuickRupee, ZipVolt, UrbanAmp, VoltRide, iphone-sale-deals.shop ...) and numbers are
fictional and every response carries "_synthetic": true; the UI labels them as sample data.
Real recordings in fixtures/serp/ always take precedence (see `record-fixtures`).
"""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "sample"
rng = random.Random(42)  # noqa: S311 - deterministic sample data, not security-sensitive
NOW = datetime.now(UTC)


def iso(days: float) -> str:
    return (NOW - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def write(name: str, params: dict, response: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    response = {"_synthetic": True, "search_metadata": {"status": "Success", "note": "synthetic sample"}, **response}
    (OUT / f"{name}.json").write_text(json.dumps({"params": params, "response": response}, indent=1,
                                                 ensure_ascii=False), encoding="utf-8")


# ---------------- Loan forward (fictional app "QuickRupee") ----------------
PKG = "com.quickrupee.instantloan.sample"
write("play_search_quickrupee", {"engine": "google_play", "q": "QuickRupee", "store": "apps", "gl": "in", "hl": "en"}, {
    "organic_results": [{"title": "Apps", "items": [
        {"title": "QuickRupee - Instant Loan App", "product_id": PKG, "author": "QR Digital Services",
         "rating": 3.9, "link": f"https://play.google.com/store/apps/details?id={PKG}"},
        {"title": "Quick Rupay Wallet", "product_id": "com.sample.quickrupay", "author": "Sample Wallet Labs", "rating": 4.2,
         "link": "https://play.google.com/store/apps/details?id=com.sample.quickrupay"},
    ]}]})
write("play_product_quickrupee", {"engine": "google_play_product", "product_id": PKG, "store": "apps"}, {
    "product_info": {"title": "QuickRupee - Instant Loan App", "authors": [{"name": "QR Digital Services"}],
                     "rating": 3.9, "reviews": "12,480", "downloads": "500K+", "category": "Finance"},
    "about_this_app": {"info": {"updated_on": (NOW - timedelta(days=9)).strftime("%b %d, %Y")}}})

complaints = [
    "They called everyone in my contacts and sent abusive messages. Harassment from recovery agent within 7 days.",
    "Hidden charges! Applied for 5000, only received 3200 after processing fee and GST. Interest rate is insane.",
    "Fraud app. Threatened to send morphed photos to my family. Please don't install.",
    "Asks access to contacts and gallery. Started calling my relatives before due date.",
    "Scam. Repaid on time but they keep demanding more money and abuse on phone.",
    "Very high interest, extra charges deducted, customer care not responding.",
]
neutral = ["Got the loan quickly, process is fast.", "Instant approval but amount is small.",
           "Okay app, disbursed in 10 minutes."]
reviews = []
for i in range(120):
    if rng.random() < 0.62:
        reviews.append({"rating": rng.choice([1, 1, 1, 2]), "snippet": rng.choice(complaints), "iso_date": iso(i * 0.4)})
    else:
        reviews.append({"rating": rng.choice([3, 4, 5]), "snippet": rng.choice(neutral), "iso_date": iso(i * 0.4)})
write("play_reviews_quickrupee", {"engine": "google_play_product", "product_id": PKG, "store": "apps",
                                  "all_reviews": "true", "sort_by": "2", "num": "199"}, {"reviews": reviews})

write("web_quickrupee", {"engine": "google_light", "q": "QuickRupee reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "QuickRupee loan app harassment complaint - Consumer Complaints", "link": "https://www.consumercomplaints.in/sample/quickrupee",
         "snippet": "Recovery agents of QuickRupee are calling my contacts. Complaint registered..."},
        {"title": "Is QuickRupee a scam? : r/IndiaInvestments", "link": "https://www.reddit.com/r/sample/quickrupee",
         "snippet": "Beware of QuickRupee, illegal loan app charging hidden fees..."},
        {"title": "QuickRupee reviews | MouthShut", "link": "https://www.mouthshut.com/sample/quickrupee",
         "snippet": "1.4 rating. Users report fraud and harassment."},
        {"title": "QuickRupee - Instant Loan App - Apps on Google Play", "link": f"https://play.google.com/store/apps/details?id={PKG}",
         "snippet": "Get instant personal loans up to Rs 50,000."},
        {"title": "Instant loan apps list 2026 - comparison", "link": "https://example-finance-blog.in/sample/loan-apps",
         "snippet": "We compare popular instant loan apps..."},
        {"title": "QuickRupee customer care number complaint", "link": "https://www.voxya.com/sample/quickrupee",
         "snippet": "Complaint against QuickRupee for harassment and fake charges."},
    ]})
write("news_quickrupee", {"engine": "google_news", "q": "QuickRupee loan app", "gl": "in", "hl": "en"}, {
    "news_results": [
        {"title": "Cyber police block 40 illegal loan apps including QuickRupee after harassment complaints",
         "source": {"name": "Sample City Times"}, "iso_date": iso(21), "link": "https://news.example.com/sample/loan-apps-blocked"},
        {"title": "Victims of instant loan app QuickRupee approach police over extortion calls",
         "source": {"name": "Sample Daily"}, "iso_date": iso(48), "link": "https://news.example.com/sample/loan-app-victims"},
        {"title": "How to spot fake loan apps: RBI's digital lending directory explained",
         "source": {"name": "Sample Money"}, "iso_date": iso(70), "link": "https://news.example.com/sample/rbi-dla-explained"},
        {"title": "Loan app complaint: woman harassed with morphed photos, FIR filed",
         "source": {"name": "Sample Express"}, "iso_date": iso(95), "link": "https://news.example.com/sample/fir-loan-app"},
    ]})
write("ads_quickrupee", {"engine": "google_ads_transparency_center", "text": "QuickRupee", "region": "2356"}, {
    "ad_creatives": [
        {"advertiser": "Lucky Star Marketing Solutions", "advertiser_id": "AR000SAMPLE1", "format": "image",
         "first_shown": int((NOW - timedelta(days=30)).timestamp()), "last_shown": int((NOW - timedelta(days=2)).timestamp()),
         "details_link": "https://adstransparency.google.com/sample/1"},
        {"advertiser": "Lucky Star Marketing Solutions", "advertiser_id": "AR000SAMPLE1", "format": "video",
         "first_shown": int((NOW - timedelta(days=20)).timestamp()), "last_shown": int((NOW - timedelta(days=1)).timestamp()),
         "details_link": "https://adstransparency.google.com/sample/2"},
        {"advertiser": "Apex Growth Media", "advertiser_id": "AR000SAMPLE2", "format": "text",
         "first_shown": int((NOW - timedelta(days=12)).timestamp()), "last_shown": int((NOW - timedelta(days=3)).timestamp()),
         "details_link": "https://adstransparency.google.com/sample/3"},
    ]})

# ---------------- Market Pulse (fictional brands ZipVolt / UrbanAmp) ----------------
weeks = 52
timeline = []
for w in range(weeks):
    base = 38 + w * 0.7 + rng.uniform(-4, 4) + (14 if w > 46 else 0)
    zip_v = 12 + w * 0.25 + rng.uniform(-3, 3)
    urb = 9 + w * 0.12 + rng.uniform(-2, 2)
    timeline.append({"date": (NOW - timedelta(weeks=weeks - w)).strftime("%b %d, %Y"), "values": [
        {"query": "electric scooter", "extracted_value": round(min(base, 100))},
        {"query": "ZipVolt", "extracted_value": round(zip_v)},
        {"query": "UrbanAmp", "extracted_value": round(urb)}]})
write("trends_ts_ev", {"engine": "google_trends", "q": "electric scooter,ZipVolt,UrbanAmp", "geo": "IN",
                       "date": "today 12-m", "data_type": "TIMESERIES"}, {"interest_over_time": {"timeline_data": timeline}})
write("trends_geo_ev", {"engine": "google_trends", "q": "electric scooter", "geo": "IN", "date": "today 12-m",
                        "data_type": "GEO_MAP_0", "region": "REGION"}, {"interest_by_region": [
    {"location": s, "extracted_value": v} for s, v in [("Karnataka", 100), ("Maharashtra", 86), ("Tamil Nadu", 79),
                                                        ("Kerala", 71), ("Telangana", 68), ("Delhi", 64), ("Gujarat", 58),
                                                        ("Rajasthan", 44), ("West Bengal", 39), ("Uttar Pradesh", 35)]]})
write("trends_rel_ev", {"engine": "google_trends", "q": "electric scooter", "geo": "IN", "date": "today 12-m",
                        "data_type": "RELATED_QUERIES"}, {"related_queries": {
    "rising": [{"query": q, "value": v} for q, v in [("electric scooter subsidy 2026", "+450%"),
                                                    ("best electric scooter 2026", "+320%"),
                                                    ("electric scooter 150 km range", "+250%"),
                                                    ("ev scooter service center", "+180%"),
                                                    ("zipvolt s1 price", "+140%")]],
    "top": [{"query": q, "value": str(v)} for q, v in [("electric scooter price", 100), ("ev scooter", 82),
                                                       ("electric bike", 60), ("zipvolt", 31)]]}})
write("news_ev", {"engine": "google_news", "q": "electric scooter India", "gl": "in", "hl": "en"}, {"news_results": [
    {"title": "ZipVolt launches S2 electric scooter with 140 km range in Bengaluru", "source": {"name": "Sample Auto"},
     "iso_date": iso(6), "link": "https://news.example.com/sample/zipvolt-s2"},
    {"title": "Electric scooter sales up 32% this festive season, Karnataka leads", "source": {"name": "Sample Business"},
     "iso_date": iso(11), "link": "https://news.example.com/sample/ev-sales"},
    {"title": "UrbanAmp announces price cut of Rs 8,000 on X2 model", "source": {"name": "Sample Wheels"},
     "iso_date": iso(17), "link": "https://news.example.com/sample/urbanamp-price-cut"},
    {"title": "Owners flag long waits at EV service centres in metro cities", "source": {"name": "Sample Daily"},
     "iso_date": iso(25), "link": "https://news.example.com/sample/ev-service"},
]})
stores = [("ZipVolt S1 Electric Scooter", "ZipVolt Store", 119999), ("UrbanAmp X2 Electric Scooter", "UrbanAmp Online", 104999),
          ("ZipVolt S1 Pro Electric Scooter", "Sample Mart", 139999), ("Ampere City Electric Scooter", "Sample Retail", 89999),
          ("UrbanAmp X1 Electric Scooter", "Sample Bazaar", 94999), ("Volta Lite Electric Scooter", "Sample Kart", 79999),
          ("ZipVolt S1 Electric Scooter", "Sample Dealers", 121499)]
write("shop_ev", {"engine": "google_shopping", "q": "electric scooter", "gl": "in", "hl": "en"}, {"shopping_results": [
    {"title": t, "source": s, "extracted_price": p, "price": f"₹{p:,}", "product_link": f"https://shop.example.com/sample/{i}"}
    for i, (t, s, p) in enumerate(stores)]})
for brand, adv in (("ZipVolt", "ZipVolt Mobility Pvt Ltd (sample)"), ("UrbanAmp", "UrbanAmp Electric (sample)")):
    write(f"ads_{brand.lower()}", {"engine": "google_ads_transparency_center", "text": brand, "region": "2356"}, {
        "ad_creatives": [{"advertiser": adv, "advertiser_id": f"AR{brand.upper()}", "format": f,
                          "first_shown": int((NOW - timedelta(days=d + 10)).timestamp()),
                          "last_shown": int((NOW - timedelta(days=d)).timestamp()),
                          "details_link": f"https://adstransparency.google.com/sample/{brand}/{d}"}
                         for f, d in (("image", 1), ("video", 2), ("text", 4), ("image", 6))]})
write("maps_zipvolt", {"engine": "google_maps", "type": "search", "q": "ZipVolt Bengaluru", "hl": "en"}, {
    "local_results": [{"title": "ZipVolt Experience Centre - Indiranagar", "data_id": "0xsample:zipvolt", "rating": 4.1,
                       "reviews": 640, "address": "100 Feet Rd, Indiranagar, Bengaluru (sample)", "type": "Scooter dealer"}]})
ev_reviews = ["Service center takes 2 weeks for a simple repair, spares not available.",
              "Range drops to 90 km in real use, battery degrades fast.",
              "Great scooter but after sales service is poor. Workshop always busy.",
              "Charging takes too long and the charger broke in 3 months.",
              "Smooth ride, good value for money.", "Love the design and pickup.",
              "Delivery delayed by a month after booking."]
write("maps_reviews_zipvolt", {"engine": "google_maps_reviews", "data_id": "0xsample:zipvolt", "sort_by": "newestFirst",
                               "hl": "en"}, {
    "place_info": {"rating": 4.1, "reviews": 640},
    "topics": [{"keyword": "service", "mentions": 88}, {"keyword": "range", "mentions": 61}, {"keyword": "battery", "mentions": 47}],
    "reviews": [{"rating": rng.choice([2, 3, 4]) if i % 3 else 5, "snippet": rng.choice(ev_reviews), "iso_date": iso(i)}
                for i in range(40)]})

# ---------------- Buy decision (fictional seller domain) ----------------
iphone = [("Flipkart", 119900), ("Croma", 121900), ("Reliance Digital", 119900), ("Vijay Sales", 118490),
          ("Apple Store", 129900), ("Sample Mobiles", 117999)]
write("shop_iphone", {"engine": "google_shopping", "q": "Apple iPhone 16 Pro 256GB", "gl": "in", "hl": "en"}, {
    "shopping_results": [{"title": "Apple iPhone 16 Pro 256GB", "source": s, "extracted_price": p, "price": f"₹{p:,}",
                          "product_link": f"https://shop.example.com/sample/iphone/{i}",
                          "immersive_product_page_token": "sample_token_iphone"} for i, (s, p) in enumerate(iphone)]})
write("immersive_iphone", {"engine": "google_immersive_product", "page_token": "sample_token_iphone", "more_stores": "true"}, {
    "product_results": {"stores": [{"name": s, "extracted_price": p + 500, "link": f"https://shop.example.com/sample/st/{i}"}
                                   for i, (s, p) in enumerate(iphone[:4])]}})
write("amazon_iphone", {"engine": "amazon", "k": "Apple iPhone 16 Pro 256GB", "amazon_domain": "amazon.in"}, {
    "organic_results": [{"title": "Apple iPhone 16 Pro (256 GB)", "extracted_price": 119900, "price": "₹1,19,900",
                         "link": "https://www.amazon.in/sample/iphone16pro"}]})
write("web_iphone_shop", {"engine": "google_light", "q": "iphone-sale-deals.shop reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "iphone-sale-deals.shop scam? Never received order", "link": "https://www.reddit.com/r/sample/iphone-sale-deals",
         "snippet": "Paid via UPI, website stopped responding. Beware, fake site."},
        {"title": "iphone-sale-deals.shop Reviews | Scam Detector", "link": "https://www.scam-detector.example/sample",
         "snippet": "Low trust score. Domain registered recently."},
        {"title": "Complaint against iphone-sale-deals.shop", "link": "https://www.consumercomplaints.in/sample/iphone-sale-deals",
         "snippet": "Fraud website selling iPhones at unrealistic prices."},
    ]})

# ---------------- Customer care number (fictional "NimbusPay Bank") ----------------
write("web_nimbuspay", {"engine": "google_light", "q": "NimbusPay Bank reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "NimbusPay Bank - Official Website | Contact Us", "link": "https://www.nimbuspay.example/contact",
         "snippet": "Our only customer care number is 080-4000-0000. We never ask for OTP, PIN or passwords."},
        {"title": "Beware of fake NimbusPay Bank customer care numbers on search ads",
         "link": "https://www.reddit.com/r/sample/nimbuspay-fake-care",
         "snippet": "Called a 1800 number from a search result, they asked me to share OTP and money was debited."},
        {"title": "NimbusPay Bank fake helpline complaint - Consumer Complaints",
         "link": "https://www.consumercomplaints.in/sample/nimbuspay-helpline",
         "snippet": "Fraudsters posing as NimbusPay customer care took Rs 24,000 after a KYC update call."},
        {"title": "NimbusPay Bank warns customers about fake KYC update calls",
         "link": "https://news.example.com/sample/nimbuspay-kyc-warning",
         "snippet": "Warning: the bank says it never calls customers for KYC over phone."},
        {"title": "NimbusPay Bank savings account review", "link": "https://money-blog.example/sample/nimbuspay-review",
         "snippet": "Interest rates, branch network and app experience compared."},
        {"title": "NimbusPay Bank - Apps on Google Play", "link": "https://play.google.com/store/apps/details?id=com.nimbuspay.sample",
         "snippet": "Official mobile banking app of NimbusPay Bank."},
    ]})
write("maps_nimbuspay", {"engine": "google_maps", "type": "search", "q": "NimbusPay Bank", "hl": "en"}, {
    "local_results": [
        {"title": "NimbusPay Bank", "data_id": "0xsample:nimbuspay", "rating": 4.0, "reviews": 1280,
         "address": "12 Residency Rd, Bengaluru (sample)", "phone": "080 4000 0000", "type": "Bank",
         "website": "https://www.nimbuspay.example"},
        {"title": "NimbusPay Bank ATM", "data_id": "0xsample:nimbuspay-atm", "rating": 3.6, "reviews": 88,
         "address": "Brigade Rd, Bengaluru (sample)", "type": "ATM"},
    ]})

# ---------------- Image provenance (fictional "Lucky Draw India") ----------------
LENS_URL = "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg"
write("lens_example", {"engine": "google_lens", "url": LENS_URL, "type": "exact_matches", "hl": "en", "country": "in"}, {
    "exact_matches": [
        {"title": "Stock photo: payment received screenshot template", "source": "stock-images.example",
         "link": "https://stock-images.example/sample/payment-template", "date": "Mar 3, 2023"},
        {"title": "Winner proof - Lucky Spin Rewards", "source": "luckyspin-rewards.example",
         "link": "https://luckyspin-rewards.example/sample/winners", "date": "Aug 19, 2024"},
        {"title": "Mega Prize Club payment proof", "source": "megaprize.example",
         "link": "https://megaprize.example/sample/proof", "date": "Jan 7, 2025"},
        {"title": "Daily Cash Draw winners list", "source": "dailycashdraw.example",
         "link": "https://dailycashdraw.example/sample/winners"},
        {"title": "How scammers reuse fake payment screenshots", "source": "news.example.com",
         "link": "https://news.example.com/sample/fake-payment-screenshots", "date": "Jun 2, 2025"},
        {"title": "Telegram channel post: today's winner", "source": "t.me", "link": "https://t.me/s/sample_channel"},
    ]})
write("web_luckydraw", {"engine": "google_light", "q": "Lucky Draw India reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "Lucky Draw India asked me to pay tax to release prize - scam?",
         "link": "https://www.reddit.com/r/sample/lucky-draw-india", "snippet": "They sent a payment proof screenshot and asked for Rs 6,500 GST."},
        {"title": "Lucky Draw India complaint - prize money never received",
         "link": "https://www.consumercomplaints.in/sample/lucky-draw-india", "snippet": "Fake winner message on WhatsApp, paid processing fee."},
        {"title": "Lucky Draw India reviews | MouthShut", "link": "https://www.mouthshut.com/sample/lucky-draw-india",
         "snippet": "1.2 rating. Users say they were cheated after paying a release fee."},
        {"title": "Cyber cell advisory on lottery and lucky draw messages", "link": "https://news.example.com/sample/lottery-advisory",
         "snippet": "Beware of messages claiming you won a lucky draw you never entered."},
        {"title": "What is a lucky draw? Rules and legality in India", "link": "https://law-blog.example/sample/lucky-draw-rules",
         "snippet": "Prize competitions are regulated by state laws."},
    ]})

# ---------------- Investment tip (fictional "Profit Kings Advisory"; quote values are synthetic) ----------------
write("finance_reliance", {"engine": "google_finance", "q": "RELIANCE:NSE", "hl": "en"}, {
    "summary": {"title": "Reliance Industries Ltd (sample quote)", "stock": "RELIANCE", "exchange": "NSE",
                "price": "₹1,400.00", "extracted_price": 1400.0, "currency": "₹",
                "price_movement": {"percentage": 0.4, "value": 5.6, "movement": "Up"}}})
write("web_profitkings", {"engine": "google_light", "q": "Profit Kings Advisory reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "Profit Kings Advisory Telegram group - scam? Lost my VIP fee",
         "link": "https://www.reddit.com/r/sample/profit-kings", "snippet": "Paid Rs 4,999 for VIP tips, guaranteed returns never came, admins blocked me."},
        {"title": "Complaint against Profit Kings Advisory - fake SEBI registration",
         "link": "https://www.consumercomplaints.in/sample/profit-kings", "snippet": "They showed a fake SEBI certificate and stopped replying."},
        {"title": "Profit Kings Advisory reviews | Trustpilot", "link": "https://www.trustpilot.com/sample/profit-kings",
         "snippet": "1.6 stars. Beware, they cheat with screenshots of fake profits."},
        {"title": "How to verify a SEBI registered investment adviser", "link": "https://money-blog.example/sample/verify-sebi-ia",
         "snippet": "Check the adviser's registration number on SEBI's intermediary list."},
        {"title": "Telegram stock tips: what investors should know", "link": "https://news.example.com/sample/telegram-tips",
         "snippet": "Unregistered tip groups promising fixed returns are a growing concern."},
    ]})
write("news_profitkings", {"engine": "google_news", "q": "Profit Kings Advisory", "gl": "in", "hl": "en"}, {"news_results": [
    {"title": "Investors lose lakhs to 'Profit Kings' Telegram tip group, police complaint filed",
     "source": {"name": "Sample City Times"}, "iso_date": iso(18), "link": "https://news.example.com/sample/profit-kings-complaint"},
    {"title": "Victims of guaranteed-return stock tip groups approach cyber cell",
     "source": {"name": "Sample Daily"}, "iso_date": iso(40), "link": "https://news.example.com/sample/tip-group-victims"},
    {"title": "SEBI cautions investors against unregistered advisers on social media",
     "source": {"name": "Sample Money"}, "iso_date": iso(62), "link": "https://news.example.com/sample/sebi-caution"},
]})

# ---------------- Job offer (fictional "Zylo Global Solutions") ----------------
ZYLO = "Zylo Global Solutions Pvt Ltd."
write("jobs_zylo", {"engine": "google_jobs", "q": ZYLO, "location": "India", "gl": "in", "hl": "en"}, {
    "jobs_results": [
        {"title": "Data Entry Operator", "company_name": "Sample Infosystems", "location": "Pune, Maharashtra", "via": "Sample Jobs"},
        {"title": "Back Office Executive", "company_name": "Acme Outsourcing (sample)", "location": "Noida, Uttar Pradesh",
         "via": "Sample Naukri"},
        {"title": "Global Solutions Analyst", "company_name": "Globex Consulting (sample)", "location": "Bengaluru, Karnataka",
         "via": "Sample LinkedIn"},
        {"title": "Work from home - Content Moderator", "company_name": "Initech Services (sample)", "location": "Anywhere",
         "via": "Sample Indeed"},
    ]})
write("maps_zylo", {"engine": "google_maps", "type": "search", "q": ZYLO, "hl": "en"}, {"local_results": []})
write("web_zylo", {"engine": "google_light", "q": f"{ZYLO} reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "Zylo Global Solutions data entry job scam - registration fee",
         "link": "https://www.reddit.com/r/sample/zylo-global", "snippet": "Paid Rs 1,500 registration fee, then they asked for more and stopped replying."},
        {"title": "Zylo Global Solutions complaint - salary not paid", "link": "https://www.consumercomplaints.in/sample/zylo",
         "snippet": "Fake work-from-home offer, no payment after 2 weeks of work."},
        {"title": "Zylo Global Solutions reviews | MouthShut", "link": "https://www.mouthshut.com/sample/zylo",
         "snippet": "Users warn: beware of upfront fees for part time jobs."},
        {"title": "How to spot fake work-from-home job offers", "link": "https://news.example.com/sample/wfh-job-scams",
         "snippet": "Genuine employers never charge a registration fee."},
    ]})

# ---------------- Local service (fictional "Pearlcrest Dental Clinic") ----------------
write("maps_pearlcrest", {"engine": "google_maps", "type": "search", "q": "Pearlcrest Dental Clinic Bengaluru", "hl": "en"}, {
    "local_results": [
        {"title": "Pearlcrest Dental Clinic", "data_id": "0xsample:pearlcrest", "rating": 4.7, "reviews": 412,
         "address": "5th Block, Koramangala, Bengaluru (sample)", "phone": "080 4000 1111", "type": "Dental clinic",
         "website": "https://www.pearlcrest.example"},
        {"title": "Pearl Smile Dental Care", "data_id": "0xsample:pearlsmile", "rating": 4.3, "reviews": 96,
         "address": "HSR Layout, Bengaluru (sample)", "type": "Dentist"},
    ]})
dental = ["Painless root canal, the doctor explained every step. Very clean clinic.",
          "Got my teeth cleaned here, friendly staff and on time.",
          "Excellent treatment for my son's braces, transparent pricing.",
          "Doctor is patient and gentle. Highly recommend for wisdom tooth removal.",
          "Modern equipment and hygienic. Appointment slots are easy to book.",
          "Good experience overall, waiting time was a bit long on Saturday."]
write("maps_reviews_pearlcrest", {"engine": "google_maps_reviews", "data_id": "0xsample:pearlcrest", "sort_by": "newestFirst",
                                  "hl": "en"}, {
    "place_info": {"rating": 4.7, "reviews": 412},
    "topics": [{"keyword": "root canal", "mentions": 54}, {"keyword": "clean", "mentions": 41}, {"keyword": "staff", "mentions": 33}],
    "reviews": [{"rating": 4 if i % 5 == 4 else 5, "snippet": dental[i % len(dental)], "iso_date": iso(i * 1.5)}
                for i in range(30)]})
write("web_pearlcrest", {"engine": "google_light", "q": "Pearlcrest Dental Clinic reviews complaints", "gl": "in", "hl": "en"}, {
    "organic_results": [
        {"title": "Pearlcrest Dental Clinic - Koramangala, Bengaluru", "link": "https://www.pearlcrest.example",
         "snippet": "Root canal, implants, aligners and family dentistry since 2012."},
        {"title": "Pearlcrest Dental Clinic | Doctor directory profile (sample)", "link": "https://doctors.example/sample/pearlcrest",
         "snippet": "4.7 rating, 300+ patient stories. Book an appointment online."},
        {"title": "Best dental clinics in Koramangala 2026", "link": "https://city-guide.example/sample/dentists-koramangala",
         "snippet": "Pearlcrest Dental Clinic is known for painless treatment."},
        {"title": "Pearlcrest Dental Clinic - local listings (sample)", "link": "https://listings.example/sample/pearlcrest",
         "snippet": "Opening hours, address and patient ratings."},
    ]})

# ---------------- Trip timing (Manali; hotel names fictional) ----------------
hotels = [("Snowline Retreat (sample)", 6200), ("Pine Valley Cottages (sample)", 4300), ("Beas River Lodge (sample)", 3100),
          ("Old Manali Homestay (sample)", 2800), ("Solang Peak Resort (sample)", 9800), ("Cedar Heights Hotel (sample)", 5400),
          ("Hadimba View Inn (sample)", 3900), ("Rohtang Gateway Suites (sample)", 7600)]
write("hotels_manali", {"engine": "google_hotels", "q": "Manali", "check_in_date": "2026-01-01", "check_out_date": "2026-01-02",
                        "currency": "INR", "gl": "in", "hl": "en"}, {
    "properties": [{"name": n, "link": f"https://hotels.example/sample/{i}",
                    "rate_per_night": {"lowest": f"₹{p:,}", "extracted_lowest": p}} for i, (n, p) in enumerate(hotels)]})
write("news_manali", {"engine": "google_news", "q": "Manali", "gl": "in", "hl": "en"}, {"news_results": [
    {"title": "Fresh snowfall expected in Manali next week, hoteliers report strong New Year bookings",
     "source": {"name": "Sample Travel"}, "iso_date": iso(3), "link": "https://news.example.com/sample/manali-snow"},
    {"title": "Atal Tunnel traffic advisory: plan Solang and Sissu trips early in the day",
     "source": {"name": "Sample Himachal"}, "iso_date": iso(8), "link": "https://news.example.com/sample/atal-advisory"},
    {"title": "Manali among the top five winter destinations searched by Indian travellers",
     "source": {"name": "Sample Business"}, "iso_date": iso(15), "link": "https://news.example.com/sample/winter-destinations"},
]})
manali = []
for w in range(52):
    seasonal = 30 + 45 * max(0.0, 1 - abs(w - 49) / 6) + 25 * max(0.0, 1 - abs(w - 24) / 5)
    manali.append({"date": (NOW - timedelta(weeks=52 - w)).strftime("%b %d, %Y"),
                   "values": [{"query": "Manali", "extracted_value": round(min(100, seasonal + rng.uniform(-3, 3)))}]})
write("trends_ts_manali", {"engine": "google_trends", "q": "Manali", "geo": "IN", "date": "today 12-m",
                           "data_type": "TIMESERIES"}, {"interest_over_time": {"timeline_data": manali}})

print(f"Wrote {len(list(OUT.glob('*.json')))} synthetic fixtures to {OUT}")
