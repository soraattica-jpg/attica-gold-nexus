import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CallCenterProvider } from "@/contexts/CallCenterContext";
import LoginPage from "@/pages/LoginPage";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardHome from "@/pages/DashboardHome";
import CallsPage from "@/pages/CallsPage";
import ReportsPage from "@/pages/ReportsPage";
import AdminPanel from "@/pages/AdminPanel";
import FollowUpsPage from "@/pages/FollowUpsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) return <LoginPage />;

  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/calls/incoming" element={<CallsPage direction="incoming" />} />
        <Route path="/calls/outgoing" element={<CallsPage direction="outgoing" />} />

        {(user?.role === "admin" || user?.role === "qc") && <Route path="/reports" element={<ReportsPage />} />}
        {user?.role === "agent" && <Route path="/agent/follow-ups" element={<FollowUpsPage />} />}

        {user?.role === "admin" && (
          <>
            <Route path="/admin/users" element={<AdminPanel initialTab={0} />} />
            <Route path="/admin/languages" element={<AdminPanel initialTab={1} />} />
            <Route path="/admin/qc-groups" element={<AdminPanel initialTab={2} />} />
            <Route path="/admin/branches" element={<AdminPanel initialTab={3} />} />
            <Route path="/admin/shifts" element={<AdminPanel initialTab={4} />} />
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
      <AuthProvider>
        <CallCenterProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </CallCenterProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
