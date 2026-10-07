import {
  BellRing,
  Bot,
  Briefcase,
  CandlestickChart,
  Globe,
  Image,
  IndianRupee,
  Landmark,
  MapPin,
  Megaphone,
  MessagesSquare,
  Newspaper,
  Plane,
  Presentation,
  Scale,
  ScanText,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  Hotel,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";

export const AGENT_ICONS: Record<string, LucideIcon> = {
  "scan-text": ScanText,
  landmark: Landmark,
  smartphone: Smartphone,
  "messages-square": MessagesSquare,
  globe: Globe,
  newspaper: Newspaper,
  megaphone: Megaphone,
  "indian-rupee": IndianRupee,
  "trending-up": TrendingUp,
  "map-pin": MapPin,
  image: Image,
  plane: Plane,
  "candlestick-chart": CandlestickChart,
  briefcase: Briefcase,
  presentation: Presentation,
  sparkles: Sparkles,
  scale: Scale,
  "bell-ring": BellRing,
};

export function agentIcon(name: string | undefined): LucideIcon {
  return (name && AGENT_ICONS[name]) || Bot;
}

export const ENGINE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  google_light: { label: "Google Search", icon: Search, color: "#4f8df5" },
  google: { label: "Google Search", icon: Search, color: "#4f8df5" },
  google_play: { label: "Play Store", icon: Smartphone, color: "#22b07d" },
  google_play_product: { label: "Play Product", icon: Star, color: "#22b07d" },
  google_maps: { label: "Maps", icon: MapPin, color: "#ea6a4f" },
  google_maps_reviews: { label: "Maps Reviews", icon: MessagesSquare, color: "#ea6a4f" },
  google_news: { label: "News", icon: Newspaper, color: "#8b7cf6" },
  google_ads_transparency_center: { label: "Ads Transparency", icon: Megaphone, color: "#f0a33a" },
  google_shopping: { label: "Shopping", icon: ShoppingBag, color: "#e2558c" },
  google_immersive_product: { label: "Product Stores", icon: ShoppingCart, color: "#e2558c" },
  amazon: { label: "Amazon.in", icon: ShoppingCart, color: "#f29a2e" },
  google_trends: { label: "Trends", icon: TrendingUp, color: "#3fb6c9" },
  google_lens: { label: "Lens", icon: ScanSearch, color: "#5aa1f2" },
  google_flights: { label: "Flights", icon: Plane, color: "#4f8df5" },
  google_hotels: { label: "Hotels", icon: Hotel, color: "#c77ddb" },
  google_finance: { label: "Finance", icon: CandlestickChart, color: "#26a269" },
  google_jobs: { label: "Jobs", icon: Briefcase, color: "#9a8cf0" },
};

export function engineMeta(engine: string | null | undefined) {
  return (engine && ENGINE_META[engine]) || { label: engine || "Internal", icon: Bot, color: "#8190a8" };
}
