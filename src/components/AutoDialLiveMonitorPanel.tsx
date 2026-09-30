import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Ear, PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter, type ManagedCall } from "@/contexts/CallCenterContext";
import LiveMonitorModal, { type LiveMonitorModalStatus } from "@/components/LiveMonitorModal";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { api, type AutoDialLeadRecord, type LiveAgentRecord, type LiveCallMonitorMode } from "@/lib/api";
import { buildActiveAutoDialCallRows } from "@/lib/autoDialLiveCalls";
import { getCallDisplayCustomerName, getCallDisplayType } from "@/lib/callDisplay";
import { getBusinessDateString } from "@/lib/businessDate";
import { mergeCallsForDate } from "@/lib/dashboardCalls";
import { clearPendingLiveMonitorRequest, LIVE_MONITOR_PENDING_TTL_MS, queuePendingLiveMonitorRequest } from "@/lib/liveMonitor";
import { isAdminRole } from "@/lib/roles";

type LiveMonitorDialogState = {
  call: ManagedCall;
  mode: LiveCallMonitorMode;
  status: LiveMonitorModalStatus;
  error?: string;
};

const normalizeText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export default function AutoDialLiveMonitorPanel({ leads }: { leads: AutoDialLeadRecord[] }) {
  const { user } = useAuth();
  const { resolveAgentName } = useAgentDirectory();
  const { calls, callPhase, callTimer, endCall, sipRegistered, sipStatusReason } = useCallCenter();
  const [liveAgents, setLiveAgents] = useState<LiveAgentRecord[]>([]);
  const [dashboardCalls, setDashboardCalls] = useState<ManagedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [liveMonitorRequestKey, setLiveMonitorRequestKey] = useState<string | null>(null);
  const [liveMonitorDialog, setLiveMonitorDialog] = useState<LiveMonitorDialogState | null>(null);
  const hasLoadedCallsRef = useRef(false);
  const today = getBusinessDateString(new Date());

  const refreshLiveData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent && !hasLoadedCallsRef.current) {
      setLoading(true);
    }
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const [nextLiveAgents, result] = await Promise.all([
        api.getLiveAgents(),
        api.getCallsByDate(today),
      ]);

      if (Array.isArray(nextLiveAgents)) {
        setLiveAgents(nextLiveAgents);
      }

      const nextCalls = Array.isArray(result.results) ? result.results : [];
      setDashboardCalls(nextCalls);
      hasLoadedCallsRef.current = true;
      setLastSync(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (error) {
      console.error("Failed to refresh live auto-call monitor data:", error);
      if (!silent) {
        toast.error("Failed to refresh live auto calls");
      }
    } finally {
      setLoading(false);
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, [today]);

  useEffect(() => {
    if (!user?.id || !isAdminRole(user.role)) {
      setLiveAgents([]);
      setDashboardCalls([]);
      setLoading(false);
      return;
    }

    void refreshLiveData();
    const interval = window.setInterval(() => {
      void refreshLiveData({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshLiveData, user?.id, user?.role]);

  const todayCalls = useMemo(
    () => mergeCallsForDate(dashboardCalls, calls, today),
    [calls, dashboardCalls, today],
  );

  const activeAutoDialCalls = useMemo(
    () => buildActiveAutoDialCallRows(leads, todayCalls, liveAgents),
    [leads, liveAgents, todayCalls],
  );

  const liveAgentById = useMemo(
    () => new Map(liveAgents.map((agent) => [agent.agentId, agent])),
    [liveAgents],
  );

  useEffect(() => {
    if (!liveMonitorDialog) return;

    if (callPhase === "connected") {
      setLiveMonitorDialog((current) => {
        if (!current || current.status === "connected") return current;
        return { ...current, status: "connected", error: undefined };
      });
      return;
    }

    if (callPhase === "dialing") {
      setLiveMonitorDialog((current) => {
        if (!current || current.status === "connecting" || current.status === "connected") return current;
        return { ...current, status: "connecting", error: undefined };
      });
      return;
    }

    if (callPhase === "idle") {
      setLiveMonitorDialog((current) => {
        if (!current) return current;
        if (current.status === "connecting" || current.status === "connected") {
          return { ...current, status: "ended", error: undefined };
        }
        return current;
      });
    }
  }, [callPhase, liveMonitorDialog]);

  useEffect(() => {
    if (!liveMonitorDialog || !["requesting", "waiting"].includes(liveMonitorDialog.status)) return;

    const timeoutId = window.setTimeout(() => {
      setLiveMonitorDialog((current) => {
        if (
          !current
          || current.call.id !== liveMonitorDialog.call.id
          || current.mode !== liveMonitorDialog.mode
          || !["requesting", "waiting"].includes(current.status)
        ) {
          return current;
        }

        clearPendingLiveMonitorRequest();
        return {
          ...current,
          status: "failed",
          error: "No live monitor session reached your web phone. Check SIP registration and the live monitor route.",
        };
      });
    }, LIVE_MONITOR_PENDING_TTL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [liveMonitorDialog]);

  const handleLiveMonitorRequest = useCallback(async (call: ManagedCall, mode: LiveCallMonitorMode) => {
    const failRequest = (message: string) => {
      setLiveMonitorDialog({ call, mode, status: "failed", error: message });
      toast.error(message);
    };

    setLiveMonitorDialog({ call, mode, status: "requesting" });

    if (!user?.id || !isAdminRole(user.role)) {
      failRequest("Only admin users can monitor live calls");
      return;
    }

    if (!normalizeText(user.extension)) {
      failRequest("Admin extension is missing");
      return;
    }

    if (!sipRegistered) {
      failRequest(`Your web phone is not ready. ${sipStatusReason}`);
      return;
    }

    if (callPhase !== "idle") {
      failRequest("Finish the current phone session before starting live listening or barging.");
      return;
    }

    if (!call.agentId) {
      failRequest("Agent details are missing for this call");
      return;
    }

    const targetAgent = liveAgentById.get(call.agentId);
    if (!normalizeText(targetAgent?.extension)) {
      failRequest("Target agent extension is not available");
      return;
    }

    const requestKey = `${call.id}:${mode}`;
    setLiveMonitorRequestKey(requestKey);
    queuePendingLiveMonitorRequest({
      mode,
      targetAgentId: call.agentId,
    });

    try {
      const result = await api.startLiveCallMonitor({
        requestedById: user.id,
        targetAgentId: call.agentId,
        mode,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to start live call monitor");
      }

      setLiveMonitorDialog((current) => {
        if (!current || current.call.id !== call.id || current.mode !== mode) return current;
        return { ...current, status: "waiting", error: undefined };
      });
      toast.success(
        mode === "listen"
          ? "Live listening is connecting to your web phone"
          : "Call barging is connecting to your web phone",
      );
    } catch (error) {
      clearPendingLiveMonitorRequest();
      failRequest(error instanceof Error ? error.message : "Failed to start live call monitor");
    } finally {
      setLiveMonitorRequestKey((current) => (current === requestKey ? null : current));
    }
  }, [callPhase, liveAgentById, sipRegistered, user?.extension, user?.id, user?.role]);

  const hasActiveLiveMonitorDialog = Boolean(
    liveMonitorDialog && !["ended", "failed"].includes(liveMonitorDialog.status),
  );

  return (
    <>
      <div className="surface-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-destructive" />
              <h2 className="text-lg font-semibold">Live Auto Calls</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Monitor connected auto-dial calls and jump into live listening or barging without leaving this tab.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastSync ? <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span> : null}
            <button
              type="button"
              className="action-outline"
              onClick={() => void refreshLiveData()}
              disabled={refreshing}
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="done-badge">{activeAutoDialCalls.length} live</span>
          <span className="text-muted-foreground">
            Only connected auto-dial calls with agents currently marked on-call appear here.
          </span>
        </div>

        <div className="space-y-3">
          {loading && activeAutoDialCalls.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Loading live auto calls...
            </div>
          ) : activeAutoDialCalls.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No live auto calls right now.
            </div>
          ) : activeAutoDialCalls.map(({ lead, call }) => {
            const agentName = resolveAgentName(call.agentId, lead.assignedAgentName || call.agentName);
            const listenRequestKey = `${call.id}:listen`;
            const bargeRequestKey = `${call.id}:barge`;

            return (
              <div key={lead.id} className="rounded-2xl border border-border bg-background/70 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{getCallDisplayCustomerName({
                        ...call,
                        customerName: lead.customerName || call.customerName,
                      })}</p>
                      <span className="success-badge capitalize">{call.status}</span>
                      <span className="done-badge">{getCallDisplayType(call)}</span>
                    </div>
                    <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                      <p><span className="font-medium text-foreground">Phone:</span> {call.callerId || lead.mobileNumber || "—"}</p>
                      <p><span className="font-medium text-foreground">Agent:</span> {agentName}</p>
                      <p><span className="font-medium text-foreground">Duration:</span> {call.duration || "00:00"}</p>
                      <p><span className="font-medium text-foreground">Connected:</span> {formatDateTime(call.answeredAt || call.ringStartedAt)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="action-outline"
                      disabled={liveMonitorRequestKey !== null || hasActiveLiveMonitorDialog}
                      onClick={() => void handleLiveMonitorRequest(call, "listen")}
                    >
                      <Ear className="h-4 w-4" />
                      {liveMonitorRequestKey === listenRequestKey ? "Starting..." : "Live Listening"}
                    </button>
                    <button
                      type="button"
                      className="action-gold"
                      disabled={liveMonitorRequestKey !== null || hasActiveLiveMonitorDialog}
                      onClick={() => void handleLiveMonitorRequest(call, "barge")}
                    >
                      <PhoneCall className="h-4 w-4" />
                      {liveMonitorRequestKey === bargeRequestKey ? "Starting..." : "Call Barging"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LiveMonitorModal
        open={Boolean(liveMonitorDialog)}
        call={liveMonitorDialog?.call || null}
        mode={liveMonitorDialog?.mode || null}
        status={liveMonitorDialog?.status || "requesting"}
        error={liveMonitorDialog?.error}
        agentName={resolveAgentName(liveMonitorDialog?.call.agentId, liveMonitorDialog?.call.agentName)}
        phoneLabel={liveMonitorDialog?.call.callerId || ""}
        callTimer={callTimer}
        onClose={() => setLiveMonitorDialog(null)}
        onEnd={endCall}
      />
    </>
  );
}
