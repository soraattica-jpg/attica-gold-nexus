import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bell, CalendarClock, CheckCircle2, PhoneCall, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";

const getUrgency = (followUpAt: string) => {
  const target = new Date(followUpAt);
  const today = new Date();
  const isSameDay = target.toDateString() === today.toDateString();

  if (target.getTime() < today.getTime()) return { label: "Overdue", className: "danger-badge" };
  if (isSameDay) return { label: "Due Today", className: "warning-badge" };
  return { label: "Upcoming", className: "success-badge" };
};

export default function FollowUpsPage() {
  const { user } = useAuth();
  const { followUps, branches, addFollowUp, markFollowUpStatus } = useCallCenter();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    branch: branches[0]?.name ?? "",
    followUpAt: "2026-03-18T17:30",
    notes: "",
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 650);
    return () => window.clearTimeout(timeout);
  }, []);

  const visibleFollowUps = useMemo(() => {
    if (user?.role === "agent") return followUps.filter((item) => item.agentId === user.id);
    return followUps;
  }, [followUps, user]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Follow-Up Module</p>
          <h1 className="text-3xl font-semibold tracking-tight">Customer Follow-Ups</h1>
        </div>
        <div className="warning-badge">
          <Bell className="h-4 w-4" />
          {visibleFollowUps.filter((item) => item.status === "Pending").length} open items
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="surface-panel p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Add Follow-Up</h2>
            <p className="text-sm text-muted-foreground">Schedule reminders directly from a customer interaction.</p>
          </div>
          <div className="space-y-3">
            <input
              value={form.customerName}
              onChange={(event) => setForm((prev) => ({ ...prev, customerName: event.target.value }))}
              placeholder="Customer name"
              className="control-field"
            />
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone number"
              className="control-field"
            />
            <select
              value={form.branch}
              onChange={(event) => setForm((prev) => ({ ...prev, branch: event.target.value }))}
              className="control-field"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={form.followUpAt}
              onChange={(event) => setForm((prev) => ({ ...prev, followUpAt: event.target.value }))}
              className="control-field"
            />
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Reminder notes"
              className="control-field min-h-28 resize-none"
            />
            <button
              className="action-gold w-full justify-center"
              onClick={() => addFollowUp(form)}
              disabled={!form.customerName.trim() || !form.phone.trim()}
            >
              <CalendarClock className="h-4 w-4" />
              Add Follow-Up
            </button>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold">Follow-Up Queue</h2>
          </div>

          {loading ? (
            <div className="space-y-4 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleFollowUps.map((item) => {
                const urgency = getUrgency(item.followUpAt);
                return (
                  <div key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{item.customerName}</h3>
                        <span className={urgency.className}>{urgency.label}</span>
                        <span className={item.status === "Called" ? "success-badge" : item.status === "Rescheduled" ? "warning-badge" : "done-badge"}>
                          {item.status}
                        </span>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                        <span>{item.phone}</span>
                        <span>{item.branch}</span>
                        <span>{new Date(item.followUpAt).toLocaleString("en-IN")}</span>
                        <span>{item.agentName}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.notes}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button className="action-outline" onClick={() => markFollowUpStatus(item.id, "Called")}>
                        <CheckCircle2 className="h-4 w-4" />
                        Called
                      </button>
                      <button className="action-outline" onClick={() => markFollowUpStatus(item.id, "Rescheduled")}>
                        <RotateCcw className="h-4 w-4" />
                        Reschedule
                      </button>
                      <button className="action-gold" onClick={() => markFollowUpStatus(item.id, "Called")}>
                        <PhoneCall className="h-4 w-4" />
                        Call Now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
