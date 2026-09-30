import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coffee, LogOut, Phone } from "lucide-react";
import { useLocation } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import AutoDialAlertModal from "@/components/AutoDialAlertModal";
import IncomingCallModal from "@/components/IncomingCallModal";
import PendingIntakeRecovery from "@/components/PendingIntakeRecovery";
import AudioDeviceSelector from "@/components/AudioDeviceSelector";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { getAgentStatusBadgeClass, getAgentStatusLabel, isBreakStatus } from "@/lib/agentStatus";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { rateTicker, sipRegistered, sipStatusLabel, sipStatusReason, agentStatus, agentStatusTimer, setAgentWorkStatus } = useCallCenter();
  const location = useLocation();
  const tickerItems = [...rateTicker, ...rateTicker, ...rateTicker];
  const isDashboardRoute = location.pathname === "/";
  const shellClassName = "app-shell flex h-screen min-h-0 w-full overflow-hidden";
  const bodyColumnClassName = "flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
  const mainClassName = "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4";

  return (
    <div className={shellClassName}>
      <AppSidebar />
      <div className={bodyColumnClassName}>
        <header className="z-30 shrink-0 px-4 pt-4">
          <div className="premium-header header-glow rounded-t-2xl px-6 py-3 text-primary-foreground">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
                  <img src={BRAND_LOGO_SRC} alt="Attica Gold" className="h-full w-full rounded-md object-contain" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Attica Gold Callcenter</h1>
                  <p className="text-xs text-primary-foreground/80">Premium financial call center operations</p>
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                {/* SIP Status */}
                <div className="inline-flex items-center gap-2 rounded-xl border border-card/25 bg-card/10 px-3 py-1 text-sm" title={sipStatusReason}>
                  <span className={`inline-block h-2 w-2 rounded-full ${sipRegistered ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"}`} />
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs text-primary-foreground/70">{sipStatusLabel}</span>
                    <span className="max-w-[16rem] truncate text-[10px] text-primary-foreground/55">{sipStatusReason}</span>
                  </div>
                </div>
                {/* Agent Status (agents only) */}
                {user?.role === "agent" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setAgentWorkStatus(isBreakStatus(agentStatus) ? "active" : "on-break")}
                      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                        isBreakStatus(agentStatus)
                          ? "border border-amber-400/50 bg-amber-500/20 text-amber-300"
                          : "border border-card/25 bg-card/10 text-primary-foreground/80 hover:bg-card/20"
                      }`}
                    >
                      <Coffee className="h-4 w-4" />
                      Break
                    </button>
                    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1 text-xs font-medium ${getAgentStatusBadgeClass(agentStatus)}`}>
                      {getAgentStatusLabel(agentStatus)} {agentStatus !== "active" && agentStatus !== "outbound-auto" && agentStatus !== "manual-outgoing" ? agentStatusTimer : ""}
                    </span>
                  </div>
                )}
                {/* Audio Device Selector */}
                <div className="min-w-[180px] flex-1 sm:flex-none">
                  <AudioDeviceSelector />
                </div>
                {/* User */}
                <div className="inline-flex items-center gap-2 rounded-xl border border-card/25 bg-card/10 px-3 py-1 text-sm text-primary-foreground/90">
                  <Phone className="h-4 w-4" />
                  <span className="max-w-[140px] truncate sm:max-w-none">{user?.name}</span>
                </div>
                {user?.role === "agent" && (
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center gap-2 rounded-xl border border-card/25 bg-card/10 px-3 py-1.5 text-sm font-medium text-primary-foreground/90 transition hover:bg-card/20"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="ticker-wrap">
            <div className="ticker-track">
              {tickerItems.map((item, index) => {
                const [label, value] = item.split("₹");
                return (
                  <span key={`${item}-${index}`} className="ticker-item">
                    <span>{label}</span>
                    <span className="ticker-value">₹{value}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </header>
        <main className={mainClassName}>
          <div className={isDashboardRoute ? "min-h-full w-full min-w-0" : "mx-auto w-full max-w-[1600px] min-w-0"}>
            <SectionErrorBoundary
              resetKey={location.pathname}
              title="This page failed to render"
              description="The dashboard shell is still running. Reload the page if this section does not recover."
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  className={isDashboardRoute ? "min-h-full" : undefined}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </SectionErrorBoundary>
          </div>
        </main>
      </div>
      <SectionErrorBoundary
        floating
        resetKey={location.pathname}
        title="Auto-dial alert failed"
        description="The rest of the dashboard is still available. Reload if the alert panel does not recover."
      >
        <AutoDialAlertModal />
      </SectionErrorBoundary>
      <SectionErrorBoundary
        floating
        resetKey={location.pathname}
        title="Incoming call panel failed"
        description="The rest of the dashboard is still available. Reload if the incoming call panel does not recover."
      >
        <IncomingCallModal />
      </SectionErrorBoundary>
      <SectionErrorBoundary floating resetKey={location.pathname} title="Pending intake could not open"
        description="Your saved draft remains on the server. Retry when idle.">
        <PendingIntakeRecovery />
      </SectionErrorBoundary>
    </div>
  );
}
