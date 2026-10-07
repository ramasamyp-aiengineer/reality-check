import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  KeyRound,
  Languages,
  LogOut,
  Moon,
  Search,
  Radio,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { LANGUAGES, setLanguage } from "@/lib/i18n";
import { useKeyStatus, useMe } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { cn, formatNumber } from "@/lib/utils";
import { ModeBadge } from "../domain";
import { Button } from "../ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from "../ui/overlays";
import { Kbd } from "../ui/primitives";
import { CommandPalette } from "./CommandPalette";
import { NAV_GROUPS } from "./nav";

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-sm">
        <ShieldCheck className="size-[18px]" />
      </span>
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">Reality Check</span>
          <span className="block text-[11px] text-subtle">Evidence agents · SerpApi</span>
        </span>
      )}
    </Link>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));
  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex"
    >
      <div className="flex h-14 items-center px-3.5">
        <Logo collapsed={collapsed} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.key}>
            {!collapsed && <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{t(`nav.${group.key}`)}</div>}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const on = active(item.to);
                const link = (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                      on ? "bg-brand-soft text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {on && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" />}
                    <item.icon className={cn("size-[18px] shrink-0", on ? "text-brand" : "text-subtle group-hover:text-muted")} />
                    {!collapsed && <span className="truncate">{t(`nav.${item.key}`)}</span>}
                  </Link>
                );
                return collapsed ? (
                  <Tip key={item.to} content={t(`nav.${item.key}`)} side="right">
                    {link}
                  </Tip>
                ) : (
                  link
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-2.5">
        <button
          onClick={onToggle}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="mx-auto size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && (
            <>
              Collapse <Kbd className="ml-auto">Ctrl B</Kbd>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}

function KeyPill() {
  const status = useKeyStatus();
  const me = useMe();
  const navigate = useNavigate();
  const s = status.data;
  if (!s) return null;
  if (s.mode === "demo") return null;
  if (!s.connected)
    return (
      <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/connect" })} className="border-warn-line text-warn">
        <KeyRound /> Connect SerpApi
      </Button>
    );
  const left = s.account?.total_searches_left ?? s.account?.plan_searches_left;
  return (
    <Tip
      content={
        <div className="space-y-0.5">
          <div>Key {s.masked} ({s.scope === "workspace" ? "stored encrypted" : s.scope === "env" ? "server .env" : "this session only"})</div>
          {s.account?.plan_name && <div>Plan: {s.account.plan_name}</div>}
          {me.data && <div>Run budget: {me.data.workspace.run_budget} searches</div>}
        </div>
      }
    >
      <button
        onClick={() => navigate({ to: "/connect" })}
        className="hidden h-8 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-[12px] text-muted hover:border-border-strong sm:inline-flex"
      >
        <span className="size-1.5 rounded-full bg-ok" />
        <span className="font-mono">{s.masked}</span>
        {left != null && (
          <span className="tabular text-foreground">
            {formatNumber(left)} <span className="text-subtle">left</span>
          </span>
        )}
      </button>
    </Tip>
  );
}

function useWorkspaceSwitch() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openDemo = async () => {
    await api.post("/auth/demo");
    qc.clear();
    sessionStorage.removeItem("rc_demo_toast");
    navigate({ to: "/" });
  };
  const backToWorkspace = async () => {
    try {
      await api.post("/auth/return");
      qc.clear();
      toast.success("Back in your workspace", { description: "Runs use live SerpApi evidence again." });
      navigate({ to: "/" });
    } catch {
      qc.clear();
      navigate({ to: "/login" });
    }
  };
  return { openDemo, backToWorkspace };
}

function WorkspaceSwitchButton() {
  const me = useMe();
  const { backToWorkspace } = useWorkspaceSwitch();
  if (!me.data?.user.is_demo || !me.data.can_return) return null;
  return (
    <Button size="sm" variant="secondary" onClick={backToWorkspace} className="border-ok/40 text-ok">
      <Radio /> Back to my workspace
    </Button>
  );
}

function UserMenu() {
  const me = useMe();
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { openDemo, backToWorkspace } = useWorkspaceSwitch();
  const user = me.data?.user;
  const initials = (user?.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      qc.clear();
      navigate({ to: "/login" });
    }
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-2" aria-label="Account menu">
          <span className="grid size-7 place-items-center rounded-md bg-brand-soft text-[11px] font-semibold text-brand">{initials}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-[12.5px] font-medium">{user?.name}</span>
            <span className="block text-[11px] capitalize text-subtle">{user?.role}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent className="w-60">
        <MenuLabel>
          <div className="text-[13px] font-medium text-foreground">{user?.name}</div>
          <div className="truncate">{user?.email}</div>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => navigate({ to: "/settings" })}>
          <User /> Workspace settings
        </MenuItem>
        <MenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light" : "Dark"} theme
        </MenuItem>
        {user && !user.is_demo && me.data?.allow_demo && (
          <MenuItem onSelect={openDemo}>
            <FlaskConical /> Open demo workspace
          </MenuItem>
        )}
        {user?.is_demo && me.data?.can_return && (
          <MenuItem onSelect={backToWorkspace}>
            <Radio /> Back to my workspace
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuLabel className="flex items-center gap-1.5">
          <Languages className="size-3.5" /> Language
        </MenuLabel>
        {LANGUAGES.map((l) => (
          <MenuItem key={l.code} onSelect={() => setLanguage(l.code)}>
            <span className="w-4">{i18n.language === l.code && <Check />}</span>
            {l.label}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={logout} className="text-bad">
          <LogOut /> {t("common.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function Topbar({ onPalette }: { onPalette: () => void }) {
  const me = useMe();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-[13.5px] font-medium">{me.data?.workspace.name}</span>
        <ModeBadge mode={me.data?.workspace.mode} />
      </div>
      <button
        onClick={onPalette}
        className="mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] text-subtle transition-colors hover:border-border-strong md:flex"
      >
        <Search className="size-4" />
        Search or jump to...
        <span className="ml-auto flex gap-1">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onPalette} aria-label="Search">
          <Search />
        </Button>
        <WorkspaceSwitchButton />
        <KeyPill />
        <UserMenu />
      </div>
    </header>
  );
}

const CHORDS: Record<string, string> = { h: "/", w: "/workflows", s: "/studio", r: "/runs", e: "/evidence", a: "/watches", g: "/agents", u: "/usage", d: "/developer" };

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("rc_sidebar") === "1");
  const [palette, setPalette] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const chord = useRef<number>(0);
  const me = useMe();

  useEffect(() => {
    localStorage.setItem("rc_sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (me.data?.user.is_demo && !sessionStorage.getItem("rc_demo_toast")) {
      sessionStorage.setItem("rc_demo_toast", "1");
      toast.info("You are in the demo workspace", { description: "Runs replay recorded SerpApi evidence. No key needed, nothing is spent." });
    }
  }, [me.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "g") {
        chord.current = Date.now();
        return;
      }
      if (Date.now() - chord.current < 1200 && CHORDS[e.key]) {
        chord.current = 0;
        navigate({ to: CHORDS[e.key] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const fullBleed = path.startsWith("/studio") || /^\/runs\/[^/]+$/.test(path);

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onPalette={() => setPalette(true)} />
        <motion.main
          key={path}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn("flex-1", fullBleed ? "" : "mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8")}
        >
          <Outlet />
        </motion.main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
