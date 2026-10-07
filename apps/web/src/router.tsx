import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "./components/shell/AppShell";
import { api, ApiError } from "./lib/api";
import { keys, queryClient } from "./lib/queries";
import type { Me } from "./lib/types";
import { NotFound, RouteError } from "./pages/Fallbacks";

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (s: Record<string, unknown>) => ({ next: typeof s.next === "string" ? s.next : undefined }),
  component: lazyRouteComponent(() => import("./pages/Login"), "LoginPage"),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
  errorComponent: RouteError,
  beforeLoad: async ({ location }) => {
    try {
      await queryClient.ensureQueryData({ queryKey: keys.me, queryFn: () => api.get<Me>("/auth/me") });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: "/login", search: { next: location.href } });
      }
      throw err;
    }
  },
});

const page = (path: string, loader: () => Promise<Record<string, unknown>>, name: string, validateSearch?: (s: Record<string, unknown>) => Record<string, unknown>) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    validateSearch,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: lazyRouteComponent(loader as any, name),
  });

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v) || undefined);

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    page("/", () => import("./pages/Home"), "HomePage"),
    page("/connect", () => import("./pages/ConnectKey"), "ConnectKeyPage"),
    page("/workflows", () => import("./pages/Library"), "LibraryPage"),
    page("/studio", () => import("./pages/Studio"), "StudioPage", (s) => ({
      template: str(s.template),
      sample: num(s.sample),
      ai: num(s.ai),
      prompt: str(s.prompt),
      text: str(s.text),
    })),
    page("/runs", () => import("./pages/Runs"), "RunsPage"),
    page("/runs/$runId", () => import("./pages/Run"), "RunPage", (s) => ({ tab: str(s.tab) })),
    page("/evidence", () => import("./pages/Evidence"), "EvidencePage", (s) => ({ run: str(s.run), engine: str(s.engine), q: str(s.q) })),
    page("/watches", () => import("./pages/Watches"), "WatchesPage"),
    page("/agents", () => import("./pages/Agents"), "AgentsPage", (s) => ({ tab: str(s.tab) })),
    page("/usage", () => import("./pages/Usage"), "UsagePage"),
    page("/settings", () => import("./pages/Settings"), "SettingsPage", (s) => ({ tab: str(s.tab) })),
    page("/developer", () => import("./pages/Developer"), "DeveloperPage"),
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingMs: 150,
  scrollRestoration: true,
});
