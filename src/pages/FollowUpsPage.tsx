import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bell, CalendarClock, CheckCircle2, PhoneCall, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useRealBranches } from "@/hooks/useRealBranches";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { isOpenFollowUpStatus } from "@/lib/followUpReminders";
import { hidePhoneDisplay } from "@/lib/phone";

const getFollowUpSourceStatus = (item: { id?: string; sourceStatus?: string; notes?: string; outcome?: string }) => {
  if (item.sourceStatus?.trim()) return item.sourceStatus.trim();

  const followUpId = String(item.id || "").toUpperCase();
  const notes = String(item.notes || "").toLowerCase();
  const outcome = String(item.outcome || "").toLowerCase();

  if (followUpId.startsWith("AUTO-") || notes.includes("auto-scheduled from missed call")) {
    return "Missed Call / Auto Follow-Up";
  }
  if (followUpId.startsWith("RNR-") || notes.includes("auto-created from rnr outbound call") || outcome === "rnr") {
    return "RNR / Auto Follow-Up";
  }
  if (followUpId.startsWith("STATUS-")) {
    return "Status Follow-Up";
  }
  return "";
};

const getUrgency = (followUpAt: string) => {
  const target = new Date(followUpAt);
  const today = new Date();
  const isSameDay = target.toDateString() === today.toDateString();

  if (target.getTime() < today.getTime()) return { label: "Overdue", className: "danger-badge" };
  if (isSameDay) return { label: "Due Today", className: "warning-badge" };
  return { label: "Upcoming", className: "success-badge" };
};

const toDateTimeInputValue = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
};

const getVisibleCustomerName = (customerName: string, phone: string, shouldMaskPhone: boolean) => {
  const trimmedName = customerName.trim();
  if (!trimmedName) {
    return shouldMaskPhone ? hidePhoneDisplay(phone) : phone;
  }
  return shouldMaskPhone && trimmedName.replace(/\D/g, "").length >= 7
    ? hidePhoneDisplay(trimmedName)
    : trimmedName;
};

export default function FollowUpsPage() {
  const { user } = useAuth();
  const shouldMaskPhone = user?.role === "agent";
  const { resolveAgentName } = useAgentDirectory();
  const { branches: realBranchList } = useRealBranches();
  const { followUps, branches, addFollowUp, markFollowUpStatus, prefillDialedNumber } = useCallCenter();
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    branch: branches[0]?.name ?? "",
    followUpAt: "2026-03-18T17:30",
    notes: "",
  });

  const visibleFollowUps = useMemo(() => {
    if (user?.role === "agent") return followUps.filter((item) => item.agentId === user.id);
    return followUps;
  }, [followUps, user]);

  const handleMarkCalled = (id: string, currentOutcome?: string) => {
    const response = window.prompt("What happened with the customer after the follow-up?", currentOutcome ?? "");
    if (response === null) return;

    const outcome = response.trim();
    if (!outcome) {
      toast.error("Enter the follow-up outcome before marking it called.");
      return;
    }

    markFollowUpStatus(id, { status: "Called", outcome });
  };

  const handleReschedule = (id: string, currentFollowUpAt: string, currentOutcome?: string) => {
    const outcomeResponse = window.prompt("Why is this follow-up being rescheduled?", currentOutcome ?? "");
    if (outcomeResponse === null) return;

    const followUpAtResponse = window.prompt(
      "Enter the next follow-up date and time in YYYY-MM-DDTHH:MM format",
      toDateTimeInputValue(currentFollowUpAt),
    );
    if (followUpAtResponse === null) return;

    const followUpAt = followUpAtResponse.trim();
    if (!followUpAt) {
      toast.error("Enter the next follow-up date and time.");
      return;
    }

    const parsedDate = new Date(followUpAt);
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error("Invalid follow-up date and time.");
      return;
    }

    markFollowUpStatus(id, {
      status: "Rescheduled",
      outcome: outcomeResponse.trim(),
      followUpAt: parsedDate.toISOString(),
    });
  };

  const handleCallNow = (phone: string) => {
    prefillDialedNumber(phone);
    toast.info("Number loaded in the dialer. Save the outcome after the call.");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Follow-Up Module</p>
          <h1 className="text-3xl font-semibold tracking-tight">Customer Follow-Ups</h1>
        </div>
        <div className="warning-badge">
          <Bell className="h-4 w-4" />
          {visibleFollowUps.filter((item) => isOpenFollowUpStatus(item.status)).length} open items
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
              {(realBranchList.length > 0 ? realBranchList : branches).map((branch) => (
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

          <div className="divide-y divide-border">
            {visibleFollowUps.map((item) => {
              const urgency = getUrgency(item.followUpAt);
              const sourceStatus = getFollowUpSourceStatus(item);
              return (
                <div key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{getVisibleCustomerName(item.customerName, item.phone, shouldMaskPhone)}</h3>
                      <span className={urgency.className}>{urgency.label}</span>
                      {sourceStatus ? (
                        <span className="warning-badge">
                          {sourceStatus}
                        </span>
                      ) : null}
                      <span className={item.status === "Called" ? "success-badge" : item.status === "Rescheduled" ? "warning-badge" : "done-badge"}>
                        {item.status}
                      </span>
                    </div>
                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                      <span>{shouldMaskPhone ? hidePhoneDisplay(item.phone) : item.phone}</span>
                      <span>{item.branch}</span>
                      <span>{new Date(item.followUpAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
                      <span>{resolveAgentName(item.agentId, item.agentName)}</span>
                    </div>
                    {item.notes ? (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Reminder:</span> {item.notes}
                      </p>
                    ) : null}
                    {item.outcome ? (
                      <p className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-foreground">
                        <span className="font-medium">What happened:</span> {item.outcome}
                      </p>
                    ) : null}
                    {item.updatedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Last updated: {new Date(item.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <button className="action-outline" onClick={() => handleMarkCalled(item.id, item.outcome)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Called
                    </button>
                    <button className="action-outline" onClick={() => handleReschedule(item.id, item.followUpAt, item.outcome)}>
                      <RotateCcw className="h-4 w-4" />
                      Reschedule
                    </button>
                    <button className="action-gold" onClick={() => handleCallNow(item.phone)}>
                      <PhoneCall className="h-4 w-4" />
                      Call Now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
