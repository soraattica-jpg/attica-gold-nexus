import { useCallback, useEffect, useState } from "react";
import { BarChart3, Calendar, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { api, type IncomingFiveOfTenGateStatus } from "@/lib/api";
import { getBusinessDateString } from "@/lib/businessDate";
import { useAuth } from "@/contexts/AuthContext";
import MdCallReport from "@/components/MdCallReport";
import SeoMarketingLeadDashboard from "@/pages/SeoMarketingLeadDashboard";

export default function MDDashboard() {
  const { user } = useAuth();
  const isMasterAdmin = user?.role === "superadmin";
  const [fromDate, setFromDate] = useState(() => getBusinessDateString(new Date()));
  const [toDate, setToDate] = useState(() => getBusinessDateString(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeDashboardTab, setActiveDashboardTab] = useState<"overview" | "ten-day" | "seo-marketing">("overview");
  const [incomingGateStatus, setIncomingGateStatus] = useState<IncomingFiveOfTenGateStatus | null>(null);
  const [incomingGateLoading, setIncomingGateLoading] = useState(false);
  const [incomingGateUpdating, setIncomingGateUpdating] = useState(false);
  const [incomingGateStopLimitInput, setIncomingGateStopLimitInput] = useState("20");
  const [incomingGateRateMinutesInput, setIncomingGateRateMinutesInput] = useState("2");

  const loadIncomingGateStatus = useCallback(async () => {
    if (!isMasterAdmin) {
      setIncomingGateStatus(null);
      return;
    }

    setIncomingGateLoading(true);
    try {
      const status = await api.getIncomingTwoOfFiveGateStatus(user?.role);
      setIncomingGateStatus(status);
    } catch (error) {
      console.error("Incoming 2-of-5 gate status failed:", error);
      setIncomingGateStatus(null);
    } finally {
      setIncomingGateLoading(false);
    }
  }, [isMasterAdmin, user?.role]);

  const toggleIncomingGate = useCallback(async () => {
    if (!isMasterAdmin) return;
    const shouldEnable = !incomingGateStatus?.active;
    setIncomingGateUpdating(true);
    try {
      const status = await api.setIncomingTwoOfFiveGateEnabled(shouldEnable, user?.role);
      setIncomingGateStatus(status);
      toast.success(`Incoming 2-of-5 gate ${status.active ? "activated" : "disabled"}`);
    } catch (error) {
      console.error("Incoming 2-of-5 gate update failed:", error);
      toast.error("Incoming gate update failed");
    } finally {
      setIncomingGateUpdating(false);
    }
  }, [incomingGateStatus?.active, isMasterAdmin, user?.role]);

  const updateIncomingGateStopLimit = useCallback(async () => {
    if (!isMasterAdmin) return;
    const stopLimit = Math.max(0, Math.trunc(Number(incomingGateStopLimitInput) || 0));
    setIncomingGateUpdating(true);
    try {
      const status = incomingGateStatus?.active
        ? await api.setIncomingTwoOfFiveGateStopLimit(stopLimit, user?.role, true)
        : await api.setIncomingTwoOfFiveGateEnabled(true, user?.role, { stopLimit, resetStopCount: true });
      setIncomingGateStatus(status);
      setIncomingGateStopLimitInput(String(status.stopLimit || stopLimit));
      toast.success(stopLimit > 0 ? `Incoming gate will hard-block after ${stopLimit} calls` : "Incoming gate stop limit disabled");
    } catch (error) {
      console.error("Incoming gate stop limit update failed:", error);
      toast.error("Incoming gate stop limit update failed");
    } finally {
      setIncomingGateUpdating(false);
    }
  }, [incomingGateStatus?.active, incomingGateStopLimitInput, isMasterAdmin, user?.role]);

  const updateIncomingGateRateLimit = useCallback(async () => {
    if (!isMasterAdmin) return;
    const rateMinutes = Math.max(0, Number(incomingGateRateMinutesInput) || 0);
    const rateSeconds = Math.max(0, Math.round(rateMinutes * 60));
    setIncomingGateUpdating(true);
    try {
      const status = incomingGateStatus?.active
        ? await api.setIncomingTwoOfFiveGateRateLimit(rateSeconds, user?.role, true)
        : await api.setIncomingTwoOfFiveGateEnabled(true, user?.role, { resetStopCount: true });
      const nextStatus = incomingGateStatus?.active
        ? status
        : await api.setIncomingTwoOfFiveGateRateLimit(rateSeconds, user?.role, true);
      setIncomingGateStatus(nextStatus);
      setIncomingGateRateMinutesInput(String((nextStatus.rateLimitSeconds || rateSeconds) / 60));
      toast.success(rateSeconds > 0 ? `Incoming gate allows 1 call every ${rateMinutes} minute${rateMinutes === 1 ? "" : "s"}` : "Incoming rate limit disabled");
    } catch (error) {
      console.error("Incoming gate rate limit update failed:", error);
      toast.error("Incoming gate rate limit update failed");
    } finally {
      setIncomingGateUpdating(false);
    }
  }, [incomingGateRateMinutesInput, incomingGateStatus?.active, isMasterAdmin, user?.role]);

  useEffect(() => {
    if (incomingGateStatus) {
      setIncomingGateStopLimitInput(String(incomingGateStatus.stopLimit || 0));
      setIncomingGateRateMinutesInput(String((incomingGateStatus.rateLimitSeconds || 0) / 60));
    }
  }, [incomingGateStatus?.rateLimitSeconds, incomingGateStatus?.stopLimit]);

  useEffect(() => {
    if (!isMasterAdmin) {
      setIncomingGateStatus(null);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadIncomingGateStatus();
    };

    void load();
    const interval = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isMasterAdmin, loadIncomingGateStatus]);


  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <h1 className="flex items-center gap-2 text-3xl font-semibold"><BarChart3 className="h-7 w-7 text-accent"/>MD Dashboard</h1>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">Start Date<input aria-label="Start Date" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="control-field mt-1 block"/></label>
        <label className="text-xs">End Date<input aria-label="End Date" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="control-field mt-1 block"/></label>
        <button onClick={()=>setRefreshKey(key=>key+1)} className="action-gold"><RefreshCw className="h-4 w-4"/>Refresh Report</button>
      </div>
    </header>
    <nav className="flex flex-wrap gap-2" aria-label="MD dashboard views">
      <button className={activeDashboardTab==="overview"?"action-gold":"action-outline"} onClick={()=>setActiveDashboardTab("overview")}><BarChart3 className="h-4 w-4"/>Overview</button>
      <button className={activeDashboardTab==="ten-day"?"action-gold":"action-outline"} onClick={()=>setActiveDashboardTab("ten-day")}><Calendar className="h-4 w-4"/>Daily Blocks</button>
      {isMasterAdmin&&<button className={activeDashboardTab==="seo-marketing"?"action-gold":"action-outline"} onClick={()=>setActiveDashboardTab("seo-marketing")}><TrendingUp className="h-4 w-4"/>SEO &amp; Marketing</button>}
    </nav>
      {isMasterAdmin ? (
        <div className="surface-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Master Admin Only</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck className="h-5 w-5 text-accent" />
                Incoming 2-of-5 Test Gate
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  incomingGateStatus?.active
                    ? "success-badge text-xs"
                    : incomingGateStatus?.expired || incomingGateStatus?.pending
                      ? "warning-badge text-xs"
                      : "done-badge text-xs"
                }
              >
                {incomingGateStatus?.statusLabel || "Checking"}
              </span>
              <button
                type="button"
                onClick={() => void toggleIncomingGate()}
                className={incomingGateStatus?.active ? "action-outline" : "action-gold"}
                disabled={incomingGateUpdating || incomingGateLoading}
              >
                {incomingGateUpdating ? "Updating..." : incomingGateStatus?.active ? "Disable" : "Activate"}
              </button>
              <button type="button" onClick={() => void loadIncomingGateStatus()} className="action-outline" disabled={incomingGateLoading}>
                <RefreshCw className={`h-4 w-4 ${incomingGateLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-1 text-xl font-semibold">{incomingGateStatus?.statusLabel || "Unknown"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">IST Today</p>
              <p className="mt-1 text-xl font-semibold">{incomingGateStatus?.todayIst || "—"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Test Date</p>
              <p className="mt-1 text-xl font-semibold">{incomingGateStatus?.targetDate || "Disabled"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Current Position</p>
              <p className="mt-1 text-xl font-semibold">
                {incomingGateStatus?.active && incomingGateStatus.rateLimitActive
                  ? "Timer"
                  : incomingGateStatus?.active
                  ? `${incomingGateStatus.counter}/${incomingGateStatus.cycleSize || 5}`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total Rejected</p>
              <p className="mt-1 text-xl font-semibold text-red-500">
                {incomingGateStatus?.active ? incomingGateStatus.totalRejectedCount : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total Count</p>
              <p className={incomingGateStatus?.hardStopActive ? "mt-1 text-xl font-semibold text-red-500" : "mt-1 text-xl font-semibold"}>
                {incomingGateStatus?.active && incomingGateStatus.stopLimit > 0
                  ? `${incomingGateStatus.stopCount}/${incomingGateStatus.stopLimit}`
                  : incomingGateStatus?.active
                  ? incomingGateStatus.stopCount
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className={incomingGateStatus?.hardStopActive ? "mt-1 text-xl font-semibold text-red-500" : "mt-1 text-xl font-semibold"}>
                {incomingGateStatus?.active && incomingGateStatus.stopLimit > 0
                  ? incomingGateStatus.stopRemaining
                  : "Off"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Next Call</p>
              <p className={incomingGateStatus?.nextAction === "disconnect" ? "mt-1 text-xl font-semibold text-red-500" : "mt-1 text-xl font-semibold text-green-600"}>
                {incomingGateStatus?.active && incomingGateStatus.hardStopActive
                  ? "Hard Block"
                  : incomingGateStatus?.active && incomingGateStatus.rateLimitRemainingSeconds > 0
                  ? `${incomingGateStatus.rateLimitRemainingSeconds}s`
                  : incomingGateStatus?.active
                  ? `${incomingGateStatus.nextPosition}: ${incomingGateStatus.nextAction === "disconnect" ? "Disconnect" : "Route"}`
                  : "Normal routing"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(incomingGateStatus?.pattern || []).map((step) => (
              <div key={step.position} className={`rounded-lg border p-2 text-center ${step.action === "disconnect" ? "border-red-200 bg-red-500/5 text-red-600" : "border-green-200 bg-green-500/5 text-green-700"}`}>
                <p className="text-xs text-muted-foreground">Call {step.position}</p>
                <p className="text-sm font-semibold">{step.action === "disconnect" ? "Disconnect" : "Route"}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
            <label className="min-w-[180px]">
              <span className="text-xs text-muted-foreground">Rate limit minutes</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="control-field mt-1 w-full"
                value={incomingGateRateMinutesInput}
                onChange={(event) => setIncomingGateRateMinutesInput(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="action-gold"
              onClick={() => void updateIncomingGateRateLimit()}
              disabled={incomingGateUpdating || incomingGateLoading}
            >
              {incomingGateUpdating ? "Updating..." : "Apply Timer"}
            </button>
            <label className="min-w-[180px]">
              <span className="text-xs text-muted-foreground">Hard block after calls</span>
              <input
                type="number"
                min={0}
                step={1}
                className="control-field mt-1 w-full"
                value={incomingGateStopLimitInput}
                onChange={(event) => setIncomingGateStopLimitInput(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="action-gold"
              onClick={() => void updateIncomingGateStopLimit()}
              disabled={incomingGateUpdating || incomingGateLoading}
            >
              {incomingGateUpdating ? "Updating..." : "Apply Count"}
            </button>
            <p className="max-w-xl text-xs text-muted-foreground">
              Set rate limit to `2` so only one valid IVR-selected incoming call lands every 2 minutes. Extra calls disconnect before queue. Set hard block to `0` unless you also want to stop all calls after a fixed total count.
            </p>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {incomingGateStatus?.rateLimitActive
              ? "Timer mode is active: one valid IVR-selected call lands in the selected language queue per rate window. Extra calls disconnect before queue entry and should not create app records, missed calls, follow-ups, recordings, SMS, or WhatsApp events."
              : "Positions 1 and 3 land in the selected language queue. Positions 2, 4 and 5 disconnect before queue entry and should not create app records, missed calls, follow-ups, recordings, SMS, or WhatsApp events."}
            Last checked: {incomingGateStatus?.updatedAt ? new Date(incomingGateStatus.updatedAt).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }) : "—"} IST
          </p>
        </div>
      ) : null}


    {activeDashboardTab==="seo-marketing"&&isMasterAdmin?<SeoMarketingLeadDashboard/>:
      <MdCallReport fromDate={fromDate} toDate={toDate} refreshKey={refreshKey} daily={activeDashboardTab==="ten-day"}/>}
  </div>;
}
