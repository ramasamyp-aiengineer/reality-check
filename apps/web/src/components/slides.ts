import type { AgentSpec, Workflow } from "@/lib/types";

type Lite = Pick<AgentSpec, "id" | "title" | "icon" | "category" | "engines" | "est_searches">;

const A = (id: string, title: string, icon: string, category: AgentSpec["category"], engines: string[], est = 0): Lite => ({
  id,
  title,
  icon,
  category,
  engines,
  est_searches: est,
});

const LITE: Lite[] = [
  A("intent", "Intent", "scan-text", "core", []),
  A("registry", "RBI Registry", "landmark", "ground_truth", []),
  A("app_identity", "App Identity", "smartphone", "evidence", ["google_play", "google_play_product"], 2),
  A("review_voice", "Review Voice", "messages-square", "evidence", ["google_play_product"], 1),
  A("web_reputation", "Web Reputation", "globe", "evidence", ["google_light"], 1),
  A("news_timeline", "News Timeline", "newspaper", "evidence", ["google_news"], 1),
  A("advertiser_identity", "Ad Transparency", "megaphone", "evidence", ["google_ads_transparency_center"], 1),
  A("price_reality", "Price Reality", "indian-rupee", "evidence", ["google_shopping"], 1),
  A("demand_trend", "Demand Trend", "trending-up", "evidence", ["google_trends"], 3),
  A("market_brief", "Market Brief", "presentation", "synthesis", []),
  A("ad_agent", "Ad Studio", "sparkles", "synthesis", []),
  A("verdict", "Verdict", "scale", "core", []),
  A("watch", "Watch", "bell-ring", "core", []),
];

export const SLIDE_AGENTS: Record<string, AgentSpec> = Object.fromEntries(
  LITE.map((a) => [a.id, { ...a, description: "", consumes: [], produces: [], params: {}, proves: "" }]),
);

const g = (nodes: string[], edges: [string, string][]): Pick<Workflow, "nodes" | "edges"> => ({
  nodes: nodes.map((id) => ({ id, agent: id, params: {} })),
  edges: edges.map(([source, target]) => ({ source, target })),
});

export interface Slide {
  key: "loan" | "market" | "buy" | "watch" | "ai";
  templateId: string | null;
  eyebrow: string;
  accent: string;
  searches: number;
  graph: Pick<Workflow, "nodes" | "edges">;
}

export const SLIDES: Slide[] = [
  {
    key: "loan",
    templateId: "loan_forward_check",
    eyebrow: "Hero · Loan forward check",
    accent: "#ef4444",
    searches: 6,
    graph: g(
      ["intent", "app_identity", "registry", "review_voice", "web_reputation", "news_timeline", "advertiser_identity", "verdict"],
      [
        ["intent", "app_identity"],
        ["app_identity", "registry"],
        ["app_identity", "review_voice"],
        ["intent", "web_reputation"],
        ["intent", "news_timeline"],
        ["intent", "advertiser_identity"],
        ["registry", "verdict"],
        ["review_voice", "verdict"],
        ["web_reputation", "verdict"],
        ["news_timeline", "verdict"],
        ["advertiser_identity", "verdict"],
      ],
    ),
  },
  {
    key: "market",
    templateId: "market_pulse_ads",
    eyebrow: "Hero · Market Pulse + Ad Studio",
    accent: "#6366f1",
    searches: 9,
    graph: g(
      ["intent", "demand_trend", "news_timeline", "price_reality", "advertiser_identity", "review_voice", "market_brief", "ad_agent"],
      [
        ["intent", "demand_trend"],
        ["intent", "news_timeline"],
        ["intent", "price_reality"],
        ["intent", "advertiser_identity"],
        ["intent", "review_voice"],
        ["demand_trend", "market_brief"],
        ["news_timeline", "market_brief"],
        ["price_reality", "market_brief"],
        ["advertiser_identity", "market_brief"],
        ["review_voice", "market_brief"],
        ["market_brief", "ad_agent"],
      ],
    ),
  },
  {
    key: "buy",
    templateId: "buy_decision",
    eyebrow: "Buy decision",
    accent: "#ec4899",
    searches: 4,
    graph: g(
      ["intent", "price_reality", "web_reputation", "verdict"],
      [
        ["intent", "price_reality"],
        ["intent", "web_reputation"],
        ["price_reality", "verdict"],
        ["web_reputation", "verdict"],
      ],
    ),
  },
  {
    key: "watch",
    templateId: "competitor_watch",
    eyebrow: "Competitor watch",
    accent: "#14b8a6",
    searches: 4,
    graph: g(
      ["intent", "advertiser_identity", "news_timeline", "demand_trend", "market_brief", "watch"],
      [
        ["intent", "advertiser_identity"],
        ["intent", "news_timeline"],
        ["intent", "demand_trend"],
        ["advertiser_identity", "market_brief"],
        ["news_timeline", "market_brief"],
        ["demand_trend", "market_brief"],
        ["market_brief", "watch"],
      ],
    ),
  },
  {
    key: "ai",
    templateId: null,
    eyebrow: "Build with AI",
    accent: "#a855f7",
    searches: 4,
    graph: g(
      ["intent", "advertiser_identity", "price_reality", "market_brief"],
      [
        ["intent", "advertiser_identity"],
        ["intent", "price_reality"],
        ["advertiser_identity", "market_brief"],
        ["price_reality", "market_brief"],
      ],
    ),
  },
];
