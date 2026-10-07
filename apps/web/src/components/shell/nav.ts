import {
  Activity,
  Bot,
  Code2,
  Database,
  LayoutDashboard,
  Library,
  Radar,
  Receipt,
  Settings,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  shortcut?: string;
  minRole?: "viewer" | "analyst" | "admin";
}

export const NAV_GROUPS: { key: string; items: NavItem[] }[] = [
  {
    key: "build",
    items: [
      { to: "/", key: "home", icon: LayoutDashboard, shortcut: "G H" },
      { to: "/workflows", key: "library", icon: Library, shortcut: "G W" },
      { to: "/studio", key: "studio", icon: Workflow, shortcut: "G S" },
      { to: "/runs", key: "runs", icon: Activity, shortcut: "G R" },
    ],
  },
  {
    key: "insight",
    items: [
      { to: "/evidence", key: "evidence", icon: Database, shortcut: "G E" },
      { to: "/watches", key: "watches", icon: Radar, shortcut: "G A" },
      { to: "/agents", key: "agents", icon: Bot, shortcut: "G G" },
      { to: "/usage", key: "usage", icon: Receipt, shortcut: "G U" },
    ],
  },
  {
    key: "admin",
    items: [
      { to: "/settings", key: "settings", icon: Settings },
      { to: "/developer", key: "developer", icon: Code2, shortcut: "G D" },
    ],
  },
];
