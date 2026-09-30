import type { UserRole } from "@/contexts/AuthContext";
import { isAdminRole } from "@/lib/roles";

type RouteModule = { default?: unknown };
type RouteLoader = () => Promise<RouteModule>;

const ROUTE_RELOAD_KEY = "attica_route_chunk_reload_attempted";

const getErrorText = (error: unknown) => {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error || "");
};

const isRecoverableRouteLoadError = (error: unknown) => {
  const message = getErrorText(error).toLowerCase();
  return (
    message.includes("chunkloaderror")
    || message.includes("loading chunk")
    || message.includes("dynamically imported module")
    || message.includes("failed to fetch dynamically imported module")
    || message.includes("reading 'default'")
    || message.includes("missing route default export")
  );
};

const reloadOnceForRouteChunk = (reason: string) => {
  if (typeof window === "undefined") return;

  try {
    const reloadId = `${window.location.pathname}|${reason}`;
    if (window.sessionStorage.getItem(ROUTE_RELOAD_KEY) === reloadId) return;
    window.sessionStorage.setItem(ROUTE_RELOAD_KEY, reloadId);
    window.location.reload();
  } catch {
    window.location.reload();
  }
};

const createRouteLoader = (loader: () => Promise<RouteModule>, label: string): RouteLoader => async () => {
  try {
    const module = await loader();
    if (!module?.default) {
      const error = new Error(`Missing route default export: ${label}`);
      reloadOnceForRouteChunk(error.message);
      throw error;
    }
    return module;
  } catch (error) {
    if (isRecoverableRouteLoadError(error)) {
      reloadOnceForRouteChunk(`${label}:${getErrorText(error)}`);
    }
    throw error;
  }
};

export const loadDashboardHome = createRouteLoader(() => import("@/pages/DashboardHome"), "DashboardHome");
export const loadCallsPage = createRouteLoader(() => import("@/pages/CallsPage"), "CallsPage");
export const loadReportsPage = createRouteLoader(() => import("@/pages/ReportsPage"), "ReportsPage");
export const loadAdminPanel = createRouteLoader(() => import("@/pages/AdminPanel"), "AdminPanel");
export const loadFollowUpsPage = createRouteLoader(() => import("@/pages/FollowUpsPage"), "FollowUpsPage");
export const loadMDDashboard = createRouteLoader(() => import("@/pages/MDDashboard"), "MDDashboard");
export const loadSeoMarketingLeadDashboard = createRouteLoader(() => import("@/pages/SeoMarketingLeadDashboard"), "SeoMarketingLeadDashboard");
export const loadBranchesPage = createRouteLoader(() => import("@/pages/BranchesPage"), "BranchesPage");
export const loadAgentStatusBoardPage = createRouteLoader(() => import("@/pages/AgentStatusBoardPage"), "AgentStatusBoardPage");
export const loadStatusDashboardPage = createRouteLoader(() => import("@/pages/StatusDashboardPage"), "StatusDashboardPage");
export const loadAgentStatusBoardSwitcherPage = createRouteLoader(() => import("@/pages/AgentStatusBoardSwitcherPage"), "AgentStatusBoardSwitcherPage");

const routeLoadersByPath: Record<string, RouteLoader[]> = {
  "/agent-status-board": [loadAgentStatusBoardSwitcherPage],
  "/": [loadDashboardHome],
  "/calls/incoming": [loadCallsPage],
  "/calls/outgoing": [loadCallsPage],
  "/reports": [loadReportsPage],
  "/branches": [loadBranchesPage],
  "/agent/follow-ups": [loadFollowUpsPage],
  "/md-dashboard": [loadMDDashboard],
  "/seo-marketing-leads": [loadSeoMarketingLeadDashboard],
  "/admin/users": [loadAdminPanel],
  "/admin/languages": [loadAdminPanel],
  "/admin/branches": [loadAdminPanel],
  "/admin/shifts": [loadAdminPanel],
  "/admin/rates": [loadAdminPanel],
  "/admin/break-logs": [loadAdminPanel],
  "/admin/incoming-call-queue": [loadAdminPanel],
  "/admin/missed-calls": [loadAdminPanel],
  "/admin/auto-dial": [loadAdminPanel],
  "/admin/status-follow-ups": [loadAdminPanel],
  "/admin/customer-data": [loadAdminPanel],
  "/admin/justdial-leads": [loadAdminPanel],
  "/admin/website-leads": [loadAdminPanel],
  "/admin/meta-leads": [loadAdminPanel],
  "/admin/agent-status": [loadAdminPanel],
  "/admin/status-dashboard": [loadStatusDashboardPage],
  "/admin/session-history": [loadAdminPanel],
  "/admin/sms-log": [loadAdminPanel],
};

const dedupeLoaders = (loaders: RouteLoader[]) => Array.from(new Set(loaders));

export const getRoleRouteLoaders = (role?: UserRole | null) => {
  const loaders: RouteLoader[] = [];

  if (role === "agent" || isAdminRole(role)) {
    return loaders;
  }

  if (role !== "seo") {
    loaders.push(loadDashboardHome, loadCallsPage);
  }

  if (role === "agent") {
    loaders.push(loadFollowUpsPage, loadBranchesPage);
  }

  if (isAdminRole(role) || role === "qc" || role === "seo") {
    loaders.push(loadReportsPage);
  }

  if (isAdminRole(role) || role === "seo") {
    loaders.push(loadMDDashboard, loadSeoMarketingLeadDashboard);
  }

  if (role === "seo") {
    loaders.push(loadAdminPanel, loadCallsPage);
  }

  return dedupeLoaders(loaders);
};

export const preloadRoleRoutes = async (role?: UserRole | null) => {
  const loaders = getRoleRouteLoaders(role);
  if (!loaders.length) return;
  await Promise.allSettled(loaders.map((loader) => loader()));
};

export const preloadRouteForPath = async (path: string) => {
  const loaders = dedupeLoaders(routeLoadersByPath[path] || []);
  if (!loaders.length) return;
  await Promise.allSettled(loaders.map((loader) => loader()));
};
