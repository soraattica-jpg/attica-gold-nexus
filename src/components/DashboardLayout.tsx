import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Phone } from "lucide-react";
import { useLocation } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import IncomingCallModal from "@/components/IncomingCallModal";
import FollowUpReminderModal from "@/components/FollowUpReminderModal";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { rateTicker } = useCallCenter();
  const location = useLocation();
  const tickerItems = [...rateTicker, ...rateTicker, ...rateTicker];

  return (
    <div className="app-shell min-h-screen flex w-full">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 px-4 pt-4">
          <div className="premium-header header-glow rounded-t-2xl px-6 py-3 text-primary-foreground">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card/15 backdrop-blur">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Attica Gold Callcenter</h1>
                  <p className="text-xs text-primary-foreground/80">Premium financial call center operations</p>
                </div>
              </div>
              <div className="hidden items-center gap-2 rounded-xl border border-card/25 bg-card/10 px-3 py-1 text-sm text-primary-foreground/90 md:inline-flex">
                <Phone className="h-4 w-4" />
                {user?.name}
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

        <main className="flex-1 overflow-auto p-4">
          <div className="mx-auto max-w-[1600px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <IncomingCallModal />
      <FollowUpReminderModal />
    </div>
  );
}
