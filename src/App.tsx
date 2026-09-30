import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CallCenterProvider } from "@/contexts/CallCenterContext";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import DashboardLayout from "@/components/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import {
  loadAdminPanel,
  loadBranchesPage,
  loadCallsPage,
  loadDashboardHome,
  loadFollowUpsPage,
  loadMDDashboard,
  loadSeoMarketingLeadDashboard,
  preloadRoleRoutes,
  loadReportsPage,
  loadAgentStatusBoardSwitcherPage,
} from "@/lib/routePreload";
import { isAdminRole } from "@/lib/roles";
import NotFound from "./pages/NotFound";

function RouteLoadFailure({ label }: { label: string }) {
  return (
    <div className="surface-panel w-full p-8 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.24em] text-destructive">Route failed</p>
      <p className="mt-3 text-lg font-semibold text-foreground">{label} could not load.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="action-gold mt-5 justify-center"
      >
        Reload
      </button>
    </div>
  );
}

const lazyRoute = <P extends Record<string, unknown>>(
  label: string,
  loader: () => Promise<{ default?: ComponentType<P> }>
) => lazy(async () => {
  try {
    const module = await loader();
    if (module?.default) {
      return { default: module.default };
    }
    console.error(`Route module missing default export: ${label}`);
  } catch (error) {
    console.error(`Route module failed to load: ${label}`, error);
  }

  const FallbackRoute = () => <RouteLoadFailure label={label} />;
  return { default: FallbackRoute as ComponentType<P> };
});

const DashboardHome = lazyRoute("Dashboard", loadDashboardHome);
const CallsPage = lazyRoute("Calls", loadCallsPage);
const ReportsPage = lazyRoute("Reports", loadReportsPage);
const AdminPanel = lazyRoute("Admin panel", loadAdminPanel);
const FollowUpsPage = lazyRoute("Follow-up", loadFollowUpsPage);
const MDDashboard = lazyRoute("MD dashboard", loadMDDashboard);
const SeoMarketingLeadDashboard = lazyRoute("SEO & Marketing Lead Dashboard", loadSeoMarketingLeadDashboard);
const BranchesPage = lazyRoute("Branches", loadBranchesPage);
const AgentStatusBoardSwitcherPage = lazyRoute("Agent status board", loadAgentStatusBoardSwitcherPage);

const queryClient = new QueryClient();

function AppPageLoader() {
  return (
    <div className="surface-panel w-full p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Attica Gold</p>
        <p className="mt-3 text-lg font-semibold text-foreground">Loading page...</p>
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<AppPageLoader />}>{children}</Suspense>;
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const isAgentStatusBoardRoute = location.pathname === "/agent-status-board";

  useEffect(() => {
    if (!isAuthenticated || !user?.role) return;
    if (user.role !== "agent") return;

    const preload = () => {
      void preloadRoleRoutes(user.role);
    };

    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(preload, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(preload, 600);
    }

    return () => {
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isAuthenticated, user?.role]);

  if (isAgentStatusBoardRoute) {
    return (
      <Routes>
        <Route
          path="/agent-status-board"
          element={(
            <LazyPage>
              <AgentStatusBoardSwitcherPage />
            </LazyPage>
          )}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  const isAdminUser = isAdminRole(user?.role);
  const canAccessOperationalRoutes = isAdminUser || user?.role === "agent" || user?.role === "qc" || user?.role === "seo";
  const canAccessReports = isAdminUser || user?.role === "qc" || user?.role === "seo";
  const canAccessMdDashboard = isAdminUser || user?.role === "seo";
  const canAccessSourceLeadDashboards = isAdminUser || user?.role === "seo";
  const canAccessSeoMarketingDashboard = user?.role === "superadmin" || user?.role === "seo";

  return (
    <DashboardLayout>
      <Routes>
        <Route
          path="/"
          element={
            user?.role === "seo" ? (
              <Navigate to="/seo-marketing-leads" replace />
            ) : (
              <LazyPage>
                <DashboardHome />
              </LazyPage>
            )
          }
        />

        {canAccessOperationalRoutes && (
          <>
            <Route
              path="/calls/incoming"
              element={(
                <LazyPage>
                  <CallsPage direction="incoming" />
                </LazyPage>
              )}
            />
            <Route
              path="/calls/outgoing"
              element={(
                <LazyPage>
                  <CallsPage direction="outgoing" />
                </LazyPage>
              )}
            />
          </>
        )}

        {canAccessReports && (
          <Route
            path="/reports"
            element={(
              <LazyPage>
                <ReportsPage />
              </LazyPage>
            )}
          />
        )}
        {user?.role === "agent" && (
          <Route
            path="/branches"
            element={(
              <LazyPage>
                <BranchesPage />
              </LazyPage>
            )}
          />
        )}
        {user?.role === "agent" && (
          <Route
            path="/agent/follow-ups"
            element={(
              <LazyPage>
                <FollowUpsPage />
              </LazyPage>
            )}
          />
        )}

        {canAccessMdDashboard && (
          <Route
            path="/md-dashboard"
            element={(
              <LazyPage>
                <MDDashboard />
              </LazyPage>
            )}
          />
        )}
        {canAccessSeoMarketingDashboard && (
          <Route
            path="/seo-marketing-leads"
            element={(
              <LazyPage>
                <SeoMarketingLeadDashboard />
              </LazyPage>
            )}
          />
        )}
        {canAccessSourceLeadDashboards && (
          <>
            <Route
              path="/admin/justdial-leads"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={11} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/website-leads"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={12} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/meta-leads"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={13} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/google-leads"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={15} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/blog-leads"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={16} />
                </LazyPage>
              )}
            />
          </>
        )}

        {isAdminUser && (
          <>
            <Route
              path="/admin/users"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={0} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/languages"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={1} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/branches"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={2} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/shifts"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={3} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/rates"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={4} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/break-logs"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={5} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/incoming-call-queue"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={6} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/missed-calls"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={7} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/auto-dial"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={8} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/status-follow-ups"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={9} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/customer-data"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={10} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/status-dashboard"
              element={<Navigate to="/agent-status-board" replace />}
            />
            <Route
              path="/admin/session-history"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={14} />
                </LazyPage>
              )}
            />
            <Route
              path="/admin/sms-log"
              element={(
                <LazyPage>
                  <AdminPanel initialTab={17} />
                </LazyPage>
              )}
            />
          </>
        )}

        <Route path="*" element={<NotFound />} />
      </Routes>
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner richColors closeButton />
      <AppErrorBoundary>
        <AuthProvider>
          <CallCenterProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </CallCenterProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
