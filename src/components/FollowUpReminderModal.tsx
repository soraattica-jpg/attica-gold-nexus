import { AnimatePresence, motion } from "framer-motion";
import { BellRing, CalendarCheck, PhoneCall, X } from "lucide-react";
import { useCallCenter } from "@/contexts/CallCenterContext";

export default function FollowUpReminderModal() {
  const { reminderFollowUp, closeReminder, markFollowUpStatus } = useCallCenter();

  return (
    <AnimatePresence>
      {reminderFollowUp && (
        <motion.div
          className="fixed bottom-5 right-5 z-50 w-[min(95vw,420px)]"
          initial={{ opacity: 0, y: 30, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 240, damping: 20 }}
        >
          <div className="surface-panel overflow-hidden border-destructive/25">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="inline-flex items-center gap-2 text-sm font-medium">
                <BellRing className="h-4 w-4 text-destructive live-pulse" />
                Follow-Up Reminder
              </div>
              <button onClick={closeReminder} className="text-muted-foreground hover:text-foreground" aria-label="Close reminder">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <p className="text-base font-semibold">{reminderFollowUp.customerName}</p>
              <p className="text-muted-foreground">{reminderFollowUp.phone}</p>
              <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                <CalendarCheck className="h-3.5 w-3.5" />
                {new Date(reminderFollowUp.followUpAt).toLocaleString("en-IN")}
              </div>
              <p className="text-muted-foreground">{reminderFollowUp.branch}</p>
            </div>
            <div className="flex gap-2 border-t border-border px-4 py-3">
              <button
                className="action-gold flex-1 justify-center"
                onClick={() => markFollowUpStatus(reminderFollowUp.id, "Called")}
              >
                <PhoneCall className="h-4 w-4" />
                Mark Called
              </button>
              <button className="action-outline" onClick={closeReminder}>
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
