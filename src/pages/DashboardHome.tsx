import { api, type BreakLogRecord, type LiveAgentRecord, type LiveCallMonitorMode, type StatsRecord } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, PhoneOff, Trophy, CalendarClock, PhoneCall, TrendingUp, Coffee } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DialerPanel from "@/components/DialerPanel";
import AutoFollowUpQueuePanel from "@/components/AutoFollowUpQueuePanel";
import LiveMonitorModal, { type LiveMonitorModalStatus } from "@/components/LiveMonitorModal";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import TablePagination from "@/components/TablePagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter, type ManagedCall } from "@/contexts/CallCenterContext";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { isBoardScopedAgentId, partitionBoardScopedCalls } from "@/lib/agentBoardScope";
import { useClientPagination } from "@/hooks/useClientPagination";
import { getAgentStatusBadgeClass, getAgentStatusLabel, getFollowUpDuration } from "@/lib/agentStatus";
import { buildAgentActivityRows } from "@/lib/agentActivity";
import { formatCallDurationFromSeconds } from "@/lib/callDuration";
import { getCallDisplayCustomerName, getCallDisplayType, getCallResolvedCustomerName } from "@/lib/callDisplay";
import { clearPendingLiveMonitorRequest, LIVE_MONITOR_PENDING_TTL_MS, queuePendingLiveMonitorRequest } from "@/lib/liveMonitor";
import { isDueFollowUp } from "@/lib/followUpReminders";
import { isAgentCurrentlyOnCall, isOpenLiveCallRecord } from "@/lib/liveCallState";
import { hidePhoneDisplay } from "@/lib/phone";
import { getBusinessDateString } from "@/lib/businessDate";
import { getCallHourBucket } from "@/lib/callDateTime";
import { parseDurationToSeconds } from "@/lib/agentSession";
import { dedupeCallInteractions, getAgentCallMetricsByAgent, isConnectedCall, isCountableIncomingCall, isInboundMissedCall, isOpenInboundMissedCall } from "@/lib/callMetrics";
import { toast } from "sonner";
import { isAdminRole } from "@/lib/roles";

const getFollowUpSourceStatus = (item: { id?: string; sourceStatus?: string; notes?: string; outcome?: string }) => {
  const sourceStatus = typeof item.sourceStatus === "string" ? item.sourceStatus.trim() : "";
  if (sourceStatus) return sourceStatus;

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

const normalizeText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const normalizePhoneKey = (value: unknown) => normalizeText(value).replace(/\D/gu, "").slice(-10);

const isNoAgentLabel = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "no agent" || normalized === "none" || normalized === "unknown";
};

const isSystemUnassignedCall = (call: Pick<ManagedCall, "agentId" | "agentName">) => {
  const agentId = normalizeText(call.agentId).toLowerCase();
  const agentName = normalizeText(call.agentName).toLowerCase();
  return (
    agentId === "ivr" ||
    agentId === "system" ||
    agentId === "queue" ||
    agentName === "ivr abandoned" ||
    agentName === "duplicate removed" ||
    agentName === "no agent" ||
    agentName === "unknown"
  );
};

const formatSafeTime = (value: unknown) => {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseBreakDurationToSeconds = (value: string | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return 0;

  const minuteMatch = normalized.match(/^(\d+)\s*min(?:ute)?s?$/);
  if (minuteMatch) {
    return Number(minuteMatch[1] || 0) * 60;
  }

  const timeParts = normalized.split(":").map((part) => Number(part));
  if (timeParts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (timeParts.length === 2) {
    const [mins = 0, secs = 0] = timeParts;
    return mins * 60 + secs;
  }

  if (timeParts.length === 3) {
    const [hours = 0, mins = 0, secs = 0] = timeParts;
    return (hours * 3600) + (mins * 60) + secs;
  }

  return 0;
};

const formatDurationSeconds = (value: number) => {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const getVisibleCustomerName = (customerName: unknown, phone: string | undefined, shouldMaskPhone: boolean) => {
  const trimmedName = normalizeText(customerName);
  if (!trimmedName) {
    return shouldMaskPhone ? hidePhoneDisplay(phone) : (phone || "—");
  }
  return shouldMaskPhone && trimmedName.replace(/\D/g, "").length >= 7
    ? hidePhoneDisplay(trimmedName)
    : trimmedName;
};

const getBreakLogBusinessDate = (log: BreakLogRecord) => (
  log.breakDate || (log.startedAt ? getBusinessDateString(new Date(log.startedAt)) : "")
);

const getBreakLogDurationSeconds = (log: BreakLogRecord, nowMs: number) => {
  const startedAtMs = log.startedAt ? new Date(log.startedAt).getTime() : Number.NaN;
  const endedAtMs = log.endedAt ? new Date(log.endedAt).getTime() : Number.NaN;

  if (!Number.isNaN(startedAtMs)) {
    if (!Number.isNaN(endedAtMs)) {
      return Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
    }
    if (!log.endTime) {
      return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    }
  }

  return parseBreakDurationToSeconds(log.duration);
};

type LiveMonitorDialogState = {
  call: ManagedCall;
  mode: LiveCallMonitorMode;
  status: LiveMonitorModalStatus;
  error?: string;
};

type DashboardFeedLoadState = "loading" | "ready" | "refreshing" | "retrying";
type AgentPanelTab = "dialer" | "queue" | "live" | "missed" | "followups" | "breaks";

const getDashboardRetryLabel = (state: DashboardFeedLoadState) => (
  state === "retrying" ? "Retrying..." : "Loading..."
);

const readStatsNumber = (stats: StatsRecord | null | undefined, key: string) => {
  const value = Number(stats?.[key]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

const normalizeHourlyBuckets = (rows: Array<{ hour: string; calls: number }>) => {
  const hourlyByLabel = new Map(rows.map((row) => [row.hour, Number(row.calls) || 0]));
  return Array.from({ length: 24 }, (_, hour) => {
    const label = `${String(hour).padStart(2, "0")}:00`;
    return {
      hour: label,
      calls: hourlyByLabel.get(label) || 0,
    };
  });
};

const readStatsHourlyRows = (stats: StatsRecord | null | undefined) => {
  const rows = stats?.hourly;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is { hour?: unknown; calls?: unknown } => Boolean(row) && typeof row === "object")
    .map((row) => ({
      hour: String(row.hour || ""),
      calls: Number(row.calls) || 0,
    }))
    .filter((row) => /^\d{2}:00$/.test(row.hour));
};

export default function DashboardHome() {
  const { user } = useAuth();
  const isAdminUser = isAdminRole(user?.role);
  const currentUserId = user?.id ?? "";
  const currentUserRole = user?.role;
  const shouldMaskPhone = user?.role === "agent";
  const { agents: directoryAgents, resolveAgentName } = useAgentDirectory();
  const [liveAgents, setLiveAgents] = useState<LiveAgentRecord[]>([]);
  const [dashboardStats, setDashboardStats] = useState<StatsRecord | null>(null);
  const [dashboardCalls, setDashboardCalls] = useState<ManagedCall[]>([]);
  const [dashboardBreakLogs, setDashboardBreakLogs] = useState<BreakLogRecord[]>([]);
  const [notesDate, setNotesDate] = useState(() => getBusinessDateString(new Date()));
  const [showActiveNowDetails, setShowActiveNowDetails] = useState(false);
  const [selectedActiveCallId, setSelectedActiveCallId] = useState<string | null>(null);
  const [liveMonitorRequestKey, setLiveMonitorRequestKey] = useState<string | null>(null);
  const [liveMonitorDialog, setLiveMonitorDialog] = useState<LiveMonitorDialogState | null>(null);
  const hasLoadedDashboardCallsRef = useRef(false);
  const hasLoadedLiveAgentsRef = useRef(false);
  const [hasDashboardSnapshot, setHasDashboardSnapshot] = useState(false);
  const [hasLiveAgentSnapshot, setHasLiveAgentSnapshot] = useState(false);
  const [dashboardCallsLoadState, setDashboardCallsLoadState] = useState<DashboardFeedLoadState>("loading");
  const [liveAgentsLoadState, setLiveAgentsLoadState] = useState<DashboardFeedLoadState>("loading");
  const [agentPanelTab, setAgentPanelTab] = useState<AgentPanelTab>("dialer");
  const liveAgentsRefreshInFlightRef = useRef(false);
  const statsRefreshInFlightRef = useRef(false);
  const dashboardCallsRefreshInFlightRef = useRef(false);
  const today = getBusinessDateString(new Date());
  const scopedAgentId = currentUserRole === "agent" ? currentUserId : undefined;
  const [statusClock, setStatusClock] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setStatusClock(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentUserRole !== "agent" || !currentUserId) {
      setDashboardBreakLogs([]);
      return;
    }

    let cancelled = false;
    const loadBreakLogs = async () => {
      const records = await api.getBreaks({ agentId: currentUserId, limit: 40 }).catch((error) => {
        console.error("Agent break timing load failed:", error);
        return [];
      });
      if (!cancelled) {
        setDashboardBreakLogs(records);
      }
    };

    void loadBreakLogs();
    const interval = window.setInterval(loadBreakLogs, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId, currentUserRole]);

  useEffect(() => {
    if (!currentUserId || !currentUserRole) {
      hasLoadedLiveAgentsRef.current = false;
      setHasLiveAgentSnapshot(false);
      setLiveAgentsLoadState("loading");
      setLiveAgents([]);
      return;
    }

    let cancelled = false;
    const loadLive = async () => {
      if (liveAgentsRefreshInFlightRef.current) return;
      liveAgentsRefreshInFlightRef.current = true;
      if (!cancelled) {
        setLiveAgentsLoadState(hasLoadedLiveAgentsRef.current ? "refreshing" : "loading");
      }

      const result = await api.getLiveAgentsSnapshot();
      liveAgentsRefreshInFlightRef.current = false;
      if (cancelled) return;

      const hasUsableSnapshot = Array.isArray(result.data);
      if (hasUsableSnapshot && (result.ok || !hasLoadedLiveAgentsRef.current)) {
        setLiveAgents(result.data);
        hasLoadedLiveAgentsRef.current = true;
        setHasLiveAgentSnapshot(true);
      }

      if (result.ok) {
        setLiveAgentsLoadState("ready");
        return;
      }

      setLiveAgentsLoadState("retrying");
    };

    void loadLive();
    const interval = setInterval(loadLive, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUserId, currentUserRole]);

  useEffect(() => {
    if (!isAdminUser) {
      setDashboardStats(null);
      return;
    }

    let cancelled = false;
    const loadStats = async () => {
      if (statsRefreshInFlightRef.current) return;
      statsRefreshInFlightRef.current = true;
      const statsResult = await api.getStatsSnapshot();
      statsRefreshInFlightRef.current = false;
      if (cancelled) return;
      if (statsResult.ok && statsResult.data) {
        setDashboardStats(statsResult.data);
      }
    };

    void loadStats();
    const interval = window.setInterval(loadStats, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAdminUser, today]);

  const { calls, followUps, breakLogs, prefillDialedNumber, callPhase, callTimer, endCall, sipRegistered, sipStatusReason } = useCallCenter();

  useEffect(() => {
    let cancelled = false;

    const loadDashboardCalls = async () => {
      if (dashboardCallsRefreshInFlightRef.current) return;
      if (!currentUserId || !currentUserRole) {
        if (!cancelled) {
          hasLoadedDashboardCallsRef.current = false;
          setHasDashboardSnapshot(false);
          setDashboardCallsLoadState("loading");
          setDashboardCalls([]);
        }
        return;
      }

      if (!cancelled) {
        setDashboardCallsLoadState(hasLoadedDashboardCallsRef.current ? "refreshing" : "loading");
      }

      dashboardCallsRefreshInFlightRef.current = true;
      const result = await api.getAllCallsSnapshot({
        date: today,
        agentId: currentUserRole === "agent" ? currentUserId : undefined,
        limit: currentUserRole === "agent" ? 80 : 50,
        dedupe: false,
      });
      dashboardCallsRefreshInFlightRef.current = false;
      if (!cancelled) {
        const hasUsableSnapshot = Array.isArray(result.data.results);
        if (hasUsableSnapshot && (result.ok || !hasLoadedDashboardCallsRef.current)) {
          setDashboardCalls(result.data.results);
          hasLoadedDashboardCallsRef.current = true;
          setHasDashboardSnapshot(true);
        }

        if (result.ok) {
          setDashboardCallsLoadState("ready");
          return;
        }

        setDashboardCallsLoadState("retrying");
      }
    };

    const initialDelay = currentUserRole === "agent" ? 2500 : 0;
    const initialLoad = window.setTimeout(() => {
      void loadDashboardCalls();
    }, initialDelay);
    const interval = window.setInterval(loadDashboardCalls, currentUserRole === "agent" ? 45000 : 60000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [currentUserId, currentUserRole, today]);

  const mergedTodayCalls = useMemo(() => (
    dedupeCallInteractions([
      ...dashboardCalls,
      ...calls.filter((call) => (
        call.date === today
        && (!scopedAgentId || call.agentId === scopedAgentId)
      )),
    ])
  ), [calls, dashboardCalls, scopedAgentId, today]);
  const snapshotTodayCalls = useMemo(() => (
    currentUserRole === "agent"
      ? dashboardCalls.filter((call) => call.agentId === currentUserId)
      : dashboardCalls
  ), [currentUserId, currentUserRole, dashboardCalls]);
  const { assigned: assignedSnapshotTodayCalls, unassigned: unassignedSnapshotTodayCalls } = useMemo(
    () => partitionBoardScopedCalls(snapshotTodayCalls),
    [snapshotTodayCalls],
  );
  const dashboardSummaryCalls = isAdminUser ? assignedSnapshotTodayCalls : snapshotTodayCalls;
  const liveAgentById = useMemo(
    () => new Map(liveAgents.map((agent) => [agent.agentId, agent])),
    [liveAgents],
  );
  const liveSnapshotCallCounts = useMemo(() => {
    if (!hasLiveAgentSnapshot) return null;

    if (currentUserRole === "agent") {
      const liveAgent = currentUserId ? liveAgentById.get(currentUserId) : undefined;
      if (!liveAgent) return null;
      return {
        total: Math.max(0, Number(liveAgent.callsToday) || 0),
        inbound: Math.max(0, Number(liveAgent.inboundToday) || 0),
        outbound: Math.max(0, Number(liveAgent.outboundToday) || 0),
        answered: Math.max(0, Number(liveAgent.answeredToday) || 0),
        missed: Math.max(0, Number(liveAgent.missedToday) || 0),
      };
    }

    if (isAdminRole(currentUserRole)) {
      return liveAgents
        .filter((agent) => isBoardScopedAgentId(agent.agentId))
        .reduce((totals, agent) => ({
          total: totals.total + Math.max(0, Number(agent.callsToday) || 0),
          inbound: totals.inbound + Math.max(0, Number(agent.inboundToday) || 0),
          outbound: totals.outbound + Math.max(0, Number(agent.outboundToday) || 0),
          answered: totals.answered + Math.max(0, Number(agent.answeredToday) || 0),
          missed: totals.missed + Math.max(0, Number(agent.missedToday) || 0),
        }), { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0 });
    }

    return null;
  }, [currentUserId, currentUserRole, hasLiveAgentSnapshot, liveAgentById, liveAgents]);
  const statsSnapshotCallCounts = useMemo(() => {
    if (!isAdminUser || !dashboardStats) return null;
    return {
      total: readStatsNumber(dashboardStats, "total"),
      inbound: readStatsNumber(dashboardStats, "inbound"),
      outbound: readStatsNumber(dashboardStats, "outbound"),
      answered: readStatsNumber(dashboardStats, "answered"),
      missed: readStatsNumber(dashboardStats, "missed"),
    };
  }, [dashboardStats, isAdminUser]);
  const kpiSnapshot = currentUserRole === "agent" ? liveSnapshotCallCounts : statsSnapshotCallCounts;
  const totalCallsToday = kpiSnapshot?.total ?? dashboardSummaryCalls.length;
  const inbound = kpiSnapshot?.inbound ?? dashboardSummaryCalls.filter(isCountableIncomingCall).length;
  const outbound = kpiSnapshot?.outbound ?? dashboardSummaryCalls.filter((call) => call.direction === "outgoing").length;
  const answered = kpiSnapshot?.answered ?? dashboardSummaryCalls.filter(isConnectedCall).length;
  const missed = kpiSnapshot?.missed ?? dashboardSummaryCalls.filter(isOpenInboundMissedCall).length;
  const agentCallMetricsById = useMemo(
    () => getAgentCallMetricsByAgent(dashboardSummaryCalls, { dedupe: false }),
    [dashboardSummaryCalls],
  );
  const liveAgentActivityRows = useMemo(
    () => buildAgentActivityRows(directoryAgents, liveAgents, agentCallMetricsById),
    [agentCallMetricsById, directoryAgents, liveAgents],
  );
  const activeCalls = useMemo(() => {
    const latestLiveCallByAgentId = new Map<string, ManagedCall>();

    for (const call of mergedTodayCalls) {
      if (!isOpenLiveCallRecord(call) || !call.agentId) continue;
      if (currentUserRole === "agent" && currentUserId && call.agentId !== currentUserId) continue;

      const isAgentStillOnCall = isAgentCurrentlyOnCall(liveAgentById.get(call.agentId));
      const isCurrentAgentCall = currentUserRole === "agent" && call.agentId === currentUserId && callPhase === "connected";
      if (!isAgentStillOnCall && !isCurrentAgentCall) continue;
      if (latestLiveCallByAgentId.has(call.agentId)) continue;

      latestLiveCallByAgentId.set(call.agentId, call);
    }

    return Array.from(latestLiveCallByAgentId.values());
  }, [callPhase, currentUserId, currentUserRole, liveAgentById, mergedTodayCalls]);
  const dashboardStatusNotice = useMemo(() => {
    if (!hasDashboardSnapshot) {
      return {
        title: getDashboardRetryLabel(dashboardCallsLoadState),
        detail: "Waiting for a valid dashboard response before showing totals.",
      };
    }

    if (dashboardCallsLoadState === "retrying" || liveAgentsLoadState === "retrying") {
      return {
        title: "Retrying...",
        detail: "Showing the last valid numbers until fresh data arrives.",
      };
    }

    if (!hasLiveAgentSnapshot) {
      return {
        title: getDashboardRetryLabel(liveAgentsLoadState),
        detail: "Live agent status is still loading. Call totals remain available.",
      };
    }

    return null;
  }, [
    dashboardCallsLoadState,
    hasDashboardSnapshot,
    hasLiveAgentSnapshot,
    liveAgentsLoadState,
  ]);
  const liveAgentPanelStatusLabel = !hasLiveAgentSnapshot
    ? getDashboardRetryLabel(liveAgentsLoadState)
    : liveAgentsLoadState === "retrying"
      ? "Retrying..."
      : "";
  const activeNowValue: number | string = hasLiveAgentSnapshot
    ? activeCalls.length
    : getDashboardRetryLabel(liveAgentsLoadState);
  const isInitialDashboardLoading = !hasDashboardSnapshot && dashboardCallsLoadState === "loading";

  useEffect(() => {
    if (!selectedActiveCallId) return;
    if (!activeCalls.some((call) => call.id === selectedActiveCallId)) {
      setSelectedActiveCallId(null);
    }
  }, [activeCalls, selectedActiveCallId]);

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

  const topAgents = useMemo(() => {
    const agentMap: Record<string, { name: string; calls: number; totalDurationSeconds: number; answeredCalls: number }> = {};
    dashboardSummaryCalls.forEach((call) => {
      if (!call.agentId) return;
      if (!agentMap[call.agentId]) {
        agentMap[call.agentId] = {
          name: resolveAgentName(call.agentId, call.agentName),
          calls: 0,
          totalDurationSeconds: 0,
          answeredCalls: 0,
        };
      }
      agentMap[call.agentId].calls++;
      if (isConnectedCall(call)) {
        agentMap[call.agentId].answeredCalls++;
        agentMap[call.agentId].totalDurationSeconds += parseDurationToSeconds(call.duration);
      }
    });
    return Object.entries(agentMap)
      .map(([id, data]) => ({
        id,
        name: data.name,
        callsToday: data.calls,
        avgHandleTime: data.answeredCalls > 0
          ? formatCallDurationFromSeconds(Math.round(data.totalDurationSeconds / data.answeredCalls))
          : "00:00",
      }))
      .sort((a, b) => b.callsToday - a.callsToday)
      .slice(0, 5);
  }, [dashboardSummaryCalls, resolveAgentName]);

  const computedHourly = useMemo(() => {
    const statsHourlyRows = isAdminUser ? readStatsHourlyRows(dashboardStats) : [];
    if (statsHourlyRows.length > 0) {
      return normalizeHourlyBuckets(statsHourlyRows);
    }

    const hours: Record<string, number> = {};
    for (let h = 0; h <= 23; h++) hours[String(h).padStart(2, "0") + ":00"] = 0;
    dashboardSummaryCalls.forEach(c => {
      const hourBucket = getCallHourBucket(c);
      if (hourBucket && hours[hourBucket] !== undefined) hours[hourBucket]++;
    });
    return Object.entries(hours)
      .map(([hour, count]) => ({ hour, calls: count }))
      .sort((left, right) => Number(left.hour.slice(0, 2)) - Number(right.hour.slice(0, 2)));
  }, [dashboardStats, dashboardSummaryCalls, isAdminUser]);

  const actionableUnassignedSnapshotTodayCalls = useMemo(
    () => unassignedSnapshotTodayCalls.filter((call) => !isSystemUnassignedCall(call)),
    [unassignedSnapshotTodayCalls],
  );
  const unassignedCallCounts = useMemo(() => ({
    total: actionableUnassignedSnapshotTodayCalls.length,
    inbound: actionableUnassignedSnapshotTodayCalls.filter(isCountableIncomingCall).length,
    outbound: actionableUnassignedSnapshotTodayCalls.filter((call) => call.direction === "outgoing").length,
  }), [actionableUnassignedSnapshotTodayCalls]);
  const scopedFollowUpDueCount = useMemo(() => {
    const now = new Date();
    const relevant = user?.role === "agent" ? followUps.filter((item) => item.agentId === user.id) : followUps;
    return relevant.filter((item) => isDueFollowUp(item, now.getTime())).length;
  }, [followUps, user?.id, user?.role]);
  const visibleBreakLogs = useMemo(() => {
    const byId = new Map<string, BreakLogRecord>();
    [...breakLogs, ...dashboardBreakLogs].forEach((log) => {
      const id = normalizeText(log.id);
      if (!id) return;
      byId.set(id, log);
    });
    return Array.from(byId.values());
  }, [breakLogs, dashboardBreakLogs]);

  const scopedBreakDurationToday = useMemo(() => {
    if (user?.role !== "agent" || !user.id) return "00:00";

    const breakSecondsByKey = new Map<string, number>();

    visibleBreakLogs.forEach((log) => {
      if (
        log.agentId !== user.id ||
        getBreakLogBusinessDate(log) !== today
      ) {
        return;
      }

      const dedupeKey = [
        log.agentId,
        new Date(log.createdAt).toISOString(),
        log.startTime || "",
      ].join("|");
      const durationSeconds = getBreakLogDurationSeconds(log, statusClock);
      const currentDurationSeconds = breakSecondsByKey.get(dedupeKey) || 0;

      if (durationSeconds > currentDurationSeconds) {
        breakSecondsByKey.set(dedupeKey, durationSeconds);
      }
    });

    const totalSeconds = Array.from(breakSecondsByKey.values()).reduce((sum, seconds) => sum + seconds, 0);

    return formatDurationSeconds(totalSeconds);
  }, [statusClock, today, user?.id, user?.role, visibleBreakLogs]);

  const myBreakLogs = useMemo(() => {
    if (user?.role !== "agent" || !user.id) return [];

    const timestampFor = (value: typeof breakLogs[number]) => {
      const candidate = value.startedAt || value.createdAt || value.breakDate || "";
      const timestamp = new Date(candidate).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    return visibleBreakLogs
      .filter((log) => log.agentId === user.id && getBreakLogBusinessDate(log) === today)
      .sort((left, right) => timestampFor(right) - timestampFor(left));
  }, [today, user?.id, user?.role, visibleBreakLogs]);

  const myFollowUps = useMemo(() => {
    const now = new Date();
    const relevant = user?.role === "agent" ? followUps.filter((item) => item.agentId === user.id) : followUps;

    return relevant
      .filter((item) => {
        if (item.status === "Called") return false;
        const followUpDate = new Date(item.followUpAt);
        return !Number.isNaN(followUpDate.getTime()) && followUpDate.toDateString() === now.toDateString();
      })
      .sort((a, b) => new Date(a.followUpAt).getTime() - new Date(b.followUpAt).getTime());
  }, [followUps, user]);

  const kpis = [
    {
      label: "Total Calls Today",
      value: totalCallsToday,
      note: isAdminUser
        ? (unassignedCallCounts.total > 0 ? `${unassignedCallCounts.total} calls need agent mapping` : undefined)
        : undefined,
    },
    { label: "Inbound", value: inbound },
    { label: "Outbound", value: outbound },
    { label: "Answered", value: answered },
    { label: "Missed", value: missed },
    ...(isAdminUser ? [{
      label: "Active Now",
      value: activeNowValue,
      isInteractive: hasLiveAgentSnapshot,
      note: !hasLiveAgentSnapshot ? liveAgentPanelStatusLabel : undefined,
    }] : []),
    { label: "Follow-Ups Due", value: scopedFollowUpDueCount },
    ...(user?.role === "agent" ? [{ label: "Break Today", value: scopedBreakDurationToday }] : []),
  ];

  const missedCallRows = useMemo(
    () => snapshotTodayCalls.filter(isOpenInboundMissedCall),
    [snapshotTodayCalls],
  );
  const followUpByCallId = useMemo(() => {
    const map = new Map<string, typeof followUps[number]>();
    followUps.forEach((item) => {
      const id = normalizeText(item.id);
      if (!id.startsWith("AUTO-")) return;
      map.set(id.slice(5), item);
    });
    return map;
  }, [followUps]);
  const followUpByPhone = useMemo(() => {
    const map = new Map<string, typeof followUps[number]>();
    followUps.forEach((item) => {
      const phoneKey = normalizePhoneKey(item.phone);
      if (!phoneKey || item.status === "Called") return;
      const current = map.get(phoneKey);
      if (!current || new Date(item.followUpAt).getTime() > new Date(current.followUpAt).getTime()) {
        map.set(phoneKey, item);
      }
    });
    return map;
  }, [followUps]);
  const getMissedCallFollowUp = (call: ManagedCall) => (
    followUpByCallId.get(call.id) || followUpByPhone.get(normalizePhoneKey(call.callerId)) || null
  );
  const getMissedCallAgentLabel = (call: ManagedCall) => {
    const followUp = getMissedCallFollowUp(call);
    if (
      (followUp?.agentId && !isNoAgentLabel(followUp.agentId))
      || (followUp?.agentName && !isNoAgentLabel(followUp.agentName))
    ) {
      return resolveAgentName(followUp.agentId, followUp.agentName);
    }
    if (call.agentId && !isNoAgentLabel(call.agentId) && !isNoAgentLabel(call.agentName)) {
      return resolveAgentName(call.agentId, call.agentName);
    }
    return "";
  };
  const notesRows = useMemo(
    () => calls.filter((call) => call.date === notesDate && (call.notes || call.callbackStatus)),
    [calls, notesDate],
  );
  const missedCallsPager = useClientPagination(missedCallRows, {
    pageSize: 5,
    resetKey: `${today}|${missedCallRows.length}`,
  });
  const liveCallsPager = useClientPagination(activeCalls, {
    pageSize: 5,
    resetKey: `${today}|${currentUserId}|${activeCalls.map((call) => call.id).join("|")}`,
  });
  const followUpsPager = useClientPagination(myFollowUps, {
    pageSize: 5,
    resetKey: `${today}|${currentUserId}|${myFollowUps.length}`,
  });
  const breakLogsPager = useClientPagination(myBreakLogs, {
    pageSize: 5,
    resetKey: `${today}|${currentUserId}|${myBreakLogs.map((log) => `${log.id}:${log.endTime || ""}:${log.duration || ""}`).join("|")}`,
  });
  const notesPager = useClientPagination(notesRows, {
    pageSize: 10,
    resetKey: `${notesDate}|${notesRows.length}`,
  });

  const handleLiveMonitorRequest = async (call: ManagedCall, mode: LiveCallMonitorMode) => {
    const failRequest = (message: string) => {
      setLiveMonitorDialog({ call, mode, status: "failed", error: message });
      toast.error(message);
    };

    setLiveMonitorDialog({ call, mode, status: "requesting" });

    if (!user?.id || !isAdminUser) {
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

      setSelectedActiveCallId(null);
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
  };

  const handleCloseLiveMonitorDialog = () => {
    setLiveMonitorDialog(null);
  };

  const hasActiveLiveMonitorDialog = Boolean(
    liveMonitorDialog && !["ended", "failed"].includes(liveMonitorDialog.status),
  );
  const widgetResetKey = [
    callPhase,
    callTimer,
    snapshotTodayCalls.length,
    activeCalls.length,
    followUps.length,
    liveAgents.length,
    selectedActiveCallId || "",
  ].join("|");

  const renderLiveCallCard = (call: ManagedCall, options?: { compact?: boolean }) => {
    const compact = options?.compact ?? false;
    const isSelected = selectedActiveCallId === call.id;
    const listenRequestKey = `${call.id}:listen`;
    const bargeRequestKey = `${call.id}:barge`;
    const resolvedCustomerName = getCallResolvedCustomerName(call) || "Unknown Customer";

    return (
      <div
        key={call.id}
        className={`rounded-xl border border-border transition ${isSelected ? "bg-accent/5" : ""} ${compact ? "p-3" : "p-4"}`}
      >
        <button
          type="button"
          className={`w-full text-left ${compact ? "flex items-center justify-between gap-3" : ""}`}
          onClick={() => setSelectedActiveCallId((current) => (current === call.id ? null : call.id))}
        >
          <div>
            <p className="font-medium">{compact ? resolvedCustomerName : resolveAgentName(call.agentId, call.agentName)}</p>
            <p className="text-sm text-muted-foreground">
              {compact
                ? `${resolveAgentName(call.agentId, call.agentName)} · ${getCallDisplayType(call)}`
                : `${resolvedCustomerName} · ${((shouldMaskPhone ? hidePhoneDisplay(call.callerId) : call.callerId) || "—")}`}
            </p>
          </div>
          <div className={`flex flex-wrap items-center gap-2 text-sm ${compact ? "justify-end" : ""}`}>
            {!compact ? <span className="done-badge">{getCallDisplayType(call)}</span> : null}
            <span className={`status-dot ${call.status === "active" ? "status-live" : "status-hold"}`} />
            <span className="capitalize text-muted-foreground">{call.status}</span>
          </div>
        </button>

        {isSelected ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            <button
              type="button"
              className="action-outline text-sm"
              disabled={liveMonitorRequestKey !== null || hasActiveLiveMonitorDialog}
              onClick={() => void handleLiveMonitorRequest(call, "listen")}
            >
              {liveMonitorRequestKey === listenRequestKey ? "Starting..." : "Call Live Listening"}
            </button>
            <button
              type="button"
              className="action-gold text-sm"
              disabled={liveMonitorRequestKey !== null || hasActiveLiveMonitorDialog}
              onClick={() => void handleLiveMonitorRequest(call, "barge")}
            >
              {liveMonitorRequestKey === bargeRequestKey ? "Starting..." : "Call Barging"}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderBreakLogCard = (log: typeof myBreakLogs[number], options?: { compact?: boolean }) => {
    const compact = options?.compact ?? false;
    const breakDateLabel = getBreakLogBusinessDate(log);
    const startLabel = log.startTime || (log.startedAt ? formatSafeTime(log.startedAt) : "—");
    const endLabel = log.endTime || (log.endedAt ? formatSafeTime(log.endedAt) : "Active");
    const durationLabel = formatDurationSeconds(getBreakLogDurationSeconds(log, statusClock));

    return (
      <div key={log.id} className={`rounded-md border border-border ${compact ? "p-1.5" : "p-2.5"}`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{getAgentStatusLabel(log.breakType || "on-break")}</p>
            <p className="truncate text-[10px] text-muted-foreground">{breakDateLabel || "—"}</p>
          </div>
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
            {durationLabel}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
          <div className="rounded bg-muted/40 px-1.5 py-1">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Start</p>
            <p className="font-medium leading-tight">{startLabel}</p>
          </div>
          <div className="rounded bg-muted/40 px-1.5 py-1">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">End</p>
            <p className="font-medium leading-tight">{endLabel}</p>
          </div>
        </div>
      </div>
    );
  };

  if (isInitialDashboardLoading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6 2xl:grid-cols-7">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>;
  }

  if (!hasDashboardSnapshot) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Operations Overview</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back, {user?.name}</h1>
        </div>
        <div className="surface-panel p-8 text-center">
          <p className="text-lg font-semibold">{dashboardStatusNotice?.title || "Loading..."}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {dashboardStatusNotice?.detail || "Waiting for a valid dashboard response before showing totals."}
          </p>
        </div>
      </motion.div>
    );
  }

  if (user?.role === "agent") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-full min-h-0 w-full max-w-full flex-col gap-2 overflow-hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Agent Panel</p>
            <h1 className="truncate text-lg font-semibold tracking-tight">Welcome back, {user?.name}</h1>
          </div>
          <span className={`${getAgentStatusBadgeClass(user?.status || "active")} shrink-0`}>
            {getAgentStatusLabel(user?.status || "active")}
          </span>
        </div>

        {dashboardStatusNotice ? (
          <div className="surface-panel shrink-0 px-3 py-2">
            <p className="text-xs font-semibold">{dashboardStatusNotice.title}</p>
            <p className="text-xs text-muted-foreground">{dashboardStatusNotice.detail}</p>
          </div>
        ) : null}

        <SectionErrorBoundary
          resetKey={`agent-kpis:${widgetResetKey}`}
          title="Dashboard summary failed to render"
          description="Other dashboard widgets are still available."
        >
          <div className="grid min-w-0 shrink-0 gap-2 sm:grid-cols-4 2xl:grid-cols-7">
            {kpis.map((item, index) => (
              <motion.div
                key={item.label}
                className="min-w-0 rounded-xl border border-border bg-card p-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <p className="truncate text-[11px] text-muted-foreground">{item.label}</p>
                <p className={`mt-1 font-semibold ${typeof item.value === "string" ? "text-lg" : "text-2xl"}`}>{item.value}</p>
              </motion.div>
            ))}
          </div>
        </SectionErrorBoundary>

        <SectionErrorBoundary
          resetKey={`agent-break-timing-strip:${widgetResetKey}`}
          title="Break timings failed to render"
          description="Other dashboard widgets are still available."
        >
          <div className="surface-panel shrink-0 px-2 py-1.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Coffee className="h-3.5 w-3.5 shrink-0 text-accent" />
                <h2 className="truncate text-xs font-semibold">Break Timings</h2>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{scopedBreakDurationToday}</span>
            </div>
            {myBreakLogs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                No break timings recorded yet.
              </div>
            ) : (
              <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                {myBreakLogs.slice(0, 3).map((log) => renderBreakLogCard(log, { compact: true }))}
              </div>
            )}
          </div>
        </SectionErrorBoundary>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 xl:hidden">
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {[
              { key: "dialer", label: "Dialer" },
              { key: "queue", label: "Queue" },
              { key: "live", label: "Live" },
              { key: "missed", label: "Missed" },
              { key: "followups", label: "Follow-Ups" },
              { key: "breaks", label: "Breaks" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAgentPanelTab(tab.key as AgentPanelTab)}
                className={agentPanelTab === tab.key
                  ? "action-gold px-3 py-1.5 text-xs"
                  : "action-outline px-3 py-1.5 text-xs"}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {agentPanelTab === "dialer" ? (
              <SectionErrorBoundary
                resetKey={`agent-tab-dialer:${widgetResetKey}`}
                title="Dialer panel failed to render"
                description="The rest of the dashboard is still available while the call state recovers."
              >
                <div className="h-full min-h-0 overflow-y-auto pr-1">
                  <DialerPanel compact />
                </div>
              </SectionErrorBoundary>
            ) : null}

            {agentPanelTab === "queue" ? (
              <SectionErrorBoundary
                resetKey={`agent-tab-auto-follow-up-queue:${widgetResetKey}`}
                title="Auto follow-up queue failed to render"
                description="The dialer is still available while the queue reloads."
              >
                <div className="h-full min-h-0 overflow-hidden">
                  <AutoFollowUpQueuePanel compact />
                </div>
              </SectionErrorBoundary>
            ) : null}

            {agentPanelTab === "live" ? (
              <SectionErrorBoundary
                resetKey={`agent-tab-live-feed:${widgetResetKey}`}
                title="Live calls feed failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <Activity className="h-4 w-4 text-destructive" />
                    <h2 className="text-base font-semibold">Live Calls Feed</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {!hasLiveAgentSnapshot ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        {liveAgentPanelStatusLabel} live agent status before showing the live feed.
                      </div>
                    ) : activeCalls.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No live calls right now.
                      </div>
                    ) : liveCallsPager.pageItems.map((call) => renderLiveCallCard(call, { compact: true }))}
                  </div>
                  <TablePagination
                    page={liveCallsPager.page}
                    totalPages={liveCallsPager.totalPages}
                    totalItems={liveCallsPager.totalItems}
                    pageSize={liveCallsPager.pageSize}
                    onPageChange={liveCallsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>
            ) : null}

            {agentPanelTab === "missed" ? (
              <SectionErrorBoundary
                resetKey={`agent-tab-missed-alerts:${widgetResetKey}`}
                title="Missed call alerts failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <PhoneOff className="h-4 w-4 text-destructive" />
                    <h2 className="text-base font-semibold">Missed Call Alerts</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {missedCallRows.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No missed calls today.
                      </div>
                    ) : missedCallsPager.pageItems.map((call) => {
                      const missedCallAgentLabel = getMissedCallAgentLabel(call);
                      return (
                        <div key={call.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{getCallDisplayCustomerName(call, { maskPhone: shouldMaskPhone })}</p>
                              <p className="truncate text-xs text-muted-foreground">{(shouldMaskPhone ? hidePhoneDisplay(call.callerId) : call.callerId) || "—"} · {call.branch}</p>
                              {missedCallAgentLabel ? (
                                <p className="mt-0.5 truncate text-[11px] font-medium text-accent">Assigned: {missedCallAgentLabel}</p>
                              ) : null}
                            </div>
                            <button className="action-gold shrink-0 px-2 py-1 text-xs" onClick={() => prefillDialedNumber(call.callerId)}>
                              <PhoneCall className="h-3.5 w-3.5" />
                              Callback
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <TablePagination
                    page={missedCallsPager.page}
                    totalPages={missedCallsPager.totalPages}
                    totalItems={missedCallsPager.totalItems}
                    pageSize={missedCallsPager.pageSize}
                    onPageChange={missedCallsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>
            ) : null}

            {agentPanelTab === "followups" ? (
              <SectionErrorBoundary
                resetKey={`agent-tab-followups:${widgetResetKey}`}
                title="Follow-ups panel failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-accent" />
                    <h2 className="text-base font-semibold">Today's Follow-Ups</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {myFollowUps.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No real follow-ups due today.
                      </div>
                    ) : followUpsPager.pageItems.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{getVisibleCustomerName(item.customerName, item.phone, shouldMaskPhone)}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.branch}</p>
                            {getFollowUpSourceStatus(item) ? (
                              <p className="mt-0.5 truncate text-[11px] font-medium text-accent">{getFollowUpSourceStatus(item)}</p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right text-xs text-muted-foreground">{formatSafeTime(item.followUpAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <TablePagination
                    page={followUpsPager.page}
                    totalPages={followUpsPager.totalPages}
                    totalItems={followUpsPager.totalItems}
                    pageSize={followUpsPager.pageSize}
                    onPageChange={followUpsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>
            ) : null}

            {agentPanelTab === "breaks" ? (
              <SectionErrorBoundary
                resetKey={`agent-tab-break-logs:${widgetResetKey}`}
                title="Break timings panel failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <Coffee className="h-4 w-4 text-accent" />
                    <h2 className="text-base font-semibold">Break Timings</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {myBreakLogs.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No break timings recorded yet.
                      </div>
                    ) : breakLogsPager.pageItems.map((log) => renderBreakLogCard(log, { compact: true }))}
                  </div>
                  <TablePagination
                    page={breakLogsPager.page}
                    totalPages={breakLogsPager.totalPages}
                    totalItems={breakLogsPager.totalItems}
                    pageSize={breakLogsPager.pageSize}
                    onPageChange={breakLogsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>
            ) : null}
          </div>
        </div>

        <div className="grid hidden min-h-0 min-w-0 flex-1 gap-2 xl:grid xl:grid-cols-[minmax(290px,0.72fr)_minmax(0,1.28fr)]">
          <SectionErrorBoundary
            resetKey={`agent-dialer:${widgetResetKey}`}
            title="Dialer panel failed to render"
            description="The rest of the dashboard is still available while the call state recovers."
          >
            <DialerPanel compact />
          </SectionErrorBoundary>

          <div className="grid min-h-0 min-w-0 gap-2 xl:grid-rows-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
            <SectionErrorBoundary
              resetKey={`agent-auto-follow-up-queue:${widgetResetKey}`}
              title="Auto follow-up queue failed to render"
              description="The dialer is still available while the queue reloads."
            >
              <AutoFollowUpQueuePanel compact />
            </SectionErrorBoundary>

            <div className="grid min-h-0 min-w-0 gap-2 xl:grid-cols-4">
              <SectionErrorBoundary
                resetKey={`agent-live-feed:${widgetResetKey}`}
                title="Live calls feed failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <Activity className="h-4 w-4 text-destructive" />
                    <h2 className="text-base font-semibold">Live Calls Feed</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {!hasLiveAgentSnapshot ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        {liveAgentPanelStatusLabel} live agent status before showing the live feed.
                      </div>
                    ) : activeCalls.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No live calls right now.
                      </div>
                    ) : liveCallsPager.pageItems.map((call) => renderLiveCallCard(call, { compact: true }))}
                  </div>
                  <TablePagination
                    page={liveCallsPager.page}
                    totalPages={liveCallsPager.totalPages}
                    totalItems={liveCallsPager.totalItems}
                    pageSize={liveCallsPager.pageSize}
                    onPageChange={liveCallsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>

              <SectionErrorBoundary
                resetKey={`agent-missed-alerts:${widgetResetKey}`}
                title="Missed call alerts failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <PhoneOff className="h-4 w-4 text-destructive" />
                    <h2 className="text-base font-semibold">Missed Call Alerts</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {missedCallRows.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No missed calls today.
                      </div>
                    ) : missedCallsPager.pageItems.map((call) => {
                      const missedCallAgentLabel = getMissedCallAgentLabel(call);
                      return (
                        <div key={call.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{getCallDisplayCustomerName(call, { maskPhone: shouldMaskPhone })}</p>
                              <p className="truncate text-xs text-muted-foreground">{(shouldMaskPhone ? hidePhoneDisplay(call.callerId) : call.callerId) || "—"} · {call.branch}</p>
                              {missedCallAgentLabel ? (
                                <p className="mt-0.5 truncate text-[11px] font-medium text-accent">Assigned: {missedCallAgentLabel}</p>
                              ) : null}
                            </div>
                            <button className="action-gold shrink-0 px-2 py-1 text-xs" onClick={() => prefillDialedNumber(call.callerId)}>
                              <PhoneCall className="h-3.5 w-3.5" />
                              Callback
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <TablePagination
                    page={missedCallsPager.page}
                    totalPages={missedCallsPager.totalPages}
                    totalItems={missedCallsPager.totalItems}
                    pageSize={missedCallsPager.pageSize}
                    onPageChange={missedCallsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>

              <SectionErrorBoundary
                resetKey={`agent-followups:${widgetResetKey}`}
                title="Follow-ups panel failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-accent" />
                    <h2 className="text-base font-semibold">Today's Follow-Ups</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {myFollowUps.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No real follow-ups due today.
                      </div>
                    ) : followUpsPager.pageItems.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{getVisibleCustomerName(item.customerName, item.phone, shouldMaskPhone)}</p>
                            <p className="truncate text-xs text-muted-foreground">{item.branch}</p>
                            {getFollowUpSourceStatus(item) ? (
                              <p className="mt-0.5 truncate text-[11px] font-medium text-accent">{getFollowUpSourceStatus(item)}</p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right text-xs text-muted-foreground">{formatSafeTime(item.followUpAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <TablePagination
                    page={followUpsPager.page}
                    totalPages={followUpsPager.totalPages}
                    totalItems={followUpsPager.totalItems}
                    pageSize={followUpsPager.pageSize}
                    onPageChange={followUpsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>

              <SectionErrorBoundary
                resetKey={`agent-break-logs:${widgetResetKey}`}
                title="Break timings panel failed to render"
                description="Other dashboard widgets are still available."
              >
                <div className="surface-panel flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
                  <div className="mb-2 flex shrink-0 items-center gap-1.5">
                    <Coffee className="h-4 w-4 text-accent" />
                    <h2 className="text-base font-semibold">Break Timings</h2>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {myBreakLogs.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No break timings recorded yet.
                      </div>
                    ) : breakLogsPager.pageItems.map((log) => renderBreakLogCard(log, { compact: true }))}
                  </div>
                  <TablePagination
                    page={breakLogsPager.page}
                    totalPages={breakLogsPager.totalPages}
                    totalItems={breakLogsPager.totalItems}
                    pageSize={breakLogsPager.pageSize}
                    onPageChange={breakLogsPager.setPage}
                    compact
                  />
                </div>
              </SectionErrorBoundary>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Operations Overview</p>
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back, {user?.name}</h1>
      </div>

      {dashboardStatusNotice ? (
        <div className="surface-panel flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-semibold">{dashboardStatusNotice.title}</p>
            <p className="text-sm text-muted-foreground">{dashboardStatusNotice.detail}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6 2xl:grid-cols-7">
        <SectionErrorBoundary
          resetKey={`kpis:${widgetResetKey}`}
          title="Dashboard summary failed to render"
          description="Other dashboard widgets are still available."
        >
          <div className="contents">
            {kpis.map((item, index) => (
              item.isInteractive ? (
                <motion.button
                  key={item.label}
                  type="button"
                  className="kpi-card text-left transition hover:border-accent/40 hover:bg-accent/5"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setShowActiveNowDetails((current) => !current)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className={`mt-4 font-semibold ${typeof item.value === "string" ? "text-2xl" : "text-4xl"}`}>{item.value}</p>
                      {item.note ? <p className="mt-2 text-xs text-muted-foreground">{item.note}</p> : null}
                    </div>
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
                      {showActiveNowDetails ? "Hide" : "View"}
                    </span>
                  </div>
                </motion.button>
              ) : (
                <motion.div key={item.label} className="kpi-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className={`mt-4 font-semibold ${typeof item.value === "string" ? "text-2xl" : "text-4xl"}`}>{item.value}</p>
                  {item.note ? <p className="mt-2 text-xs text-muted-foreground">{item.note}</p> : null}
                </motion.div>
              )
            ))}
          </div>
        </SectionErrorBoundary>
      </div>

      {isAdminUser && showActiveNowDetails && (
        <SectionErrorBoundary
          resetKey={`active-details:${widgetResetKey}`}
          title="Active calls panel failed to render"
          description="The rest of the dashboard is still available."
        >
          <div className="surface-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Active Calls</p>
                <h2 className="text-xl font-semibold">Agents currently on call</h2>
              </div>
              <div className="done-badge">{activeCalls.length} live</div>
            </div>
            <div className="space-y-3">
              {!hasLiveAgentSnapshot ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {liveAgentPanelStatusLabel} live agent status before showing active calls.
                </div>
              ) : activeCalls.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No agents are on a live call right now.
                </div>
              ) : activeCalls.map((call) => renderLiveCallCard(call))}
            </div>
          </div>
        </SectionErrorBoundary>
      )}

      <div className={user?.role === "agent"
        ? "grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)_minmax(300px,0.85fr)]"
        : "grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_420px]"}>
        <SectionErrorBoundary
          resetKey={`hourly-volume:${widgetResetKey}`}
          title="Call volume chart failed to render"
          description="Other dashboard widgets are still available."
        >
          <div className="surface-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Volume</p>
                <h2 className="text-xl font-semibold">Calls per hour</h2>
              </div>
              <div className="success-badge"><TrendingUp className="h-4 w-4" /> Stable flow</div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={computedHourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16 }} />
                <Bar dataKey="calls" fill="hsl(var(--accent))" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionErrorBoundary>

        {user?.role === "agent" ? (
          <SectionErrorBoundary
            resetKey={`dialer:${widgetResetKey}`}
            title="Dialer panel failed to render"
            description="The rest of the dashboard is still available while the call state recovers."
          >
            <DialerPanel />
          </SectionErrorBoundary>
        ) : (
          <SectionErrorBoundary
            resetKey={`top-agents:${widgetResetKey}`}
            title="Top agents panel failed to render"
            description="Other dashboard widgets are still available."
          >
            <div className="surface-panel p-5">
              <div className="mb-4 flex items-center gap-2"><Trophy className="h-5 w-5 text-accent" /><h2 className="text-xl font-semibold">Top Agents</h2></div>
              <div className="space-y-3">
                {topAgents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No call activity is available for the selected day yet.
                  </div>
                ) : topAgents.map((agent, index) => (
                  <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 font-semibold text-accent">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{agent.name}</p>
                      <p className="text-sm text-muted-foreground">{agent.callsToday} calls</p>
                    </div>
                    <div className="done-badge">{agent.avgHandleTime}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionErrorBoundary>
        )}

        {user?.role === "agent" ? (
          <SectionErrorBoundary
            resetKey={`auto-follow-up-queue:${widgetResetKey}`}
            title="Auto follow-up queue failed to render"
            description="The dialer is still available while the queue reloads."
          >
            <AutoFollowUpQueuePanel />
          </SectionErrorBoundary>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionErrorBoundary
          resetKey={`live-feed:${widgetResetKey}`}
          title="Live calls feed failed to render"
          description="Other dashboard widgets are still available."
        >
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-destructive" /><h2 className="text-xl font-semibold">Live Calls Feed</h2></div>
          <div className="space-y-3">
            {!hasLiveAgentSnapshot ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                {liveAgentPanelStatusLabel} live agent status before showing the live feed.
              </div>
            ) : activeCalls.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No live calls right now.
              </div>
            ) : liveCallsPager.pageItems.map((call) => renderLiveCallCard(call, { compact: true }))}
          </div>
          <TablePagination
            page={liveCallsPager.page}
            totalPages={liveCallsPager.totalPages}
            totalItems={liveCallsPager.totalItems}
            pageSize={liveCallsPager.pageSize}
            onPageChange={liveCallsPager.setPage}
          />
        </div>
        </SectionErrorBoundary>

        <SectionErrorBoundary
          resetKey={`missed-alerts:${widgetResetKey}`}
          title="Missed call alerts failed to render"
          description="Other dashboard widgets are still available."
        >
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2"><PhoneOff className="h-5 w-5 text-destructive" /><h2 className="text-xl font-semibold">Missed Call Alerts</h2></div>
          <div className="space-y-3">
            {missedCallRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No missed calls today.
              </div>
            ) : missedCallsPager.pageItems.map((call) => {
              const missedCallAgentLabel = getMissedCallAgentLabel(call);
              return (
                <div key={call.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{getCallDisplayCustomerName(call, { maskPhone: shouldMaskPhone })}</p>
                      <p className="text-sm text-muted-foreground">{(shouldMaskPhone ? hidePhoneDisplay(call.callerId) : call.callerId) || "—"} · {call.branch}</p>
                      {missedCallAgentLabel ? (
                        <p className="mt-1 text-xs font-medium text-accent">Assigned: {missedCallAgentLabel}</p>
                      ) : null}
                    </div>
                    <button className="action-gold" onClick={() => prefillDialedNumber(call.callerId)}>
                      <PhoneCall className="h-4 w-4" />
                      Callback
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <TablePagination
            page={missedCallsPager.page}
            totalPages={missedCallsPager.totalPages}
            totalItems={missedCallsPager.totalItems}
            pageSize={missedCallsPager.pageSize}
            onPageChange={missedCallsPager.setPage}
          />
        </div>
        </SectionErrorBoundary>

        <SectionErrorBoundary
          resetKey={`followups:${widgetResetKey}`}
          title="Follow-ups panel failed to render"
          description="Other dashboard widgets are still available."
        >
        <div className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-accent" /><h2 className="text-xl font-semibold">Today's Follow-Ups</h2></div>
          <div className="space-y-3">
            {myFollowUps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                No real follow-ups due today.
              </div>
            ) : followUpsPager.pageItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{getVisibleCustomerName(item.customerName, item.phone, shouldMaskPhone)}</p>
                    <p className="text-sm text-muted-foreground">{item.branch}</p>
                    {getFollowUpSourceStatus(item) ? (
                        <p className="mt-1 text-xs font-medium text-accent">{getFollowUpSourceStatus(item)}</p>
                      ) : null}
                    </div>
                  <div className="text-right text-sm text-muted-foreground">{formatSafeTime(item.followUpAt)}</div>
                </div>
              </div>
            ))}
          </div>
          <TablePagination
            page={followUpsPager.page}
            totalPages={followUpsPager.totalPages}
            totalItems={followUpsPager.totalItems}
            pageSize={followUpsPager.pageSize}
            onPageChange={followUpsPager.setPage}
          />
        </div>
        </SectionErrorBoundary>
      </div>


        {/* Recent Call Notes/Remarks - Admin only */}
        {isAdminUser && (
          <SectionErrorBoundary
            resetKey={`notes:${widgetResetKey}:${notesDate}`}
            title="Call notes panel failed to render"
            description="Other dashboard widgets are still available."
          >
          <div className="col-span-full surface-panel p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Call Notes & Remarks</h2>
              <input type="date" value={notesDate} onChange={e => setNotesDate(e.target.value)} className="control-field text-sm w-40" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2">Disposition</th>
                    <th className="px-3 py-2">Notes / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {notesPager.pageItems.map(c => {
                    const missedCallAgentLabel = isInboundMissedCall(c) ? getMissedCallAgentLabel(c) : "";
                    return (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-3 py-2 text-xs font-mono">{c.time}</td>
                        <td className="px-3 py-2 font-medium">{getCallDisplayCustomerName(c)}</td>
                        <td className="px-3 py-2 text-xs">{c.callerId}</td>
                        <td className="px-3 py-2">
                          {isInboundMissedCall(c) ? (missedCallAgentLabel || "—") : resolveAgentName(c.agentId, c.agentName)}
                        </td>
                        <td className="px-3 py-2">{c.branch || "—"}</td>
                        <td className="px-3 py-2">{c.callbackStatus ? <span className="done-badge text-xs">{c.callbackStatus}</span> : "—"}</td>
                        <td className="px-3 py-2 max-w-[300px]">{c.notes || "—"}</td>
                      </tr>
                    );
                  })}
                  {notesRows.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No call notes yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={notesPager.page}
              totalPages={notesPager.totalPages}
              totalItems={notesPager.totalItems}
              pageSize={notesPager.pageSize}
              onPageChange={notesPager.setPage}
            />
          </div>
          </SectionErrorBoundary>
        )}

        {/* Live Agent Activity */}
        {isAdminUser && liveAgents.length > 0 && (
          <SectionErrorBoundary
            resetKey={`live-agents:${widgetResetKey}`}
            title="Live agent activity failed to render"
            description="Other dashboard widgets are still available."
          >
          <div className="col-span-full surface-panel p-5">
            <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />Live Agent Activity
              <span className="ml-2 text-sm font-normal text-muted-foreground">Updates every 5s</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Ext</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Status Time</th>
                    <th className="px-3 py-2">Calls Today</th>
                    <th className="px-3 py-2">Inbound</th>
                    <th className="px-3 py-2">Outbound</th>
                    <th className="px-3 py-2">Follow-Ups</th>
                  </tr>
                </thead>
                <tbody>
                  {liveAgentActivityRows.map((row) => (
                    <tr key={row.agentId} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{row.agentName}</td>
                      <td className="px-3 py-2 font-mono">{row.extension}</td>
                      <td className="px-3 py-2">
                        <span className={getAgentStatusBadgeClass(row.status)}>{getAgentStatusLabel(row.status)}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.status === "follow-up" ? getFollowUpDuration(row.followUpStartedAt, row.followUpDuration) : "—"}
                      </td>
                      <td className="px-3 py-2">{row.totalCalls}</td>
                      <td className="px-3 py-2">{row.inboundCalls}</td>
                      <td className="px-3 py-2">{row.outboundCalls}</td>
                      <td className="px-3 py-2">{row.followUpsPending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </SectionErrorBoundary>
        )}

      <LiveMonitorModal
        open={Boolean(liveMonitorDialog)}
        call={liveMonitorDialog?.call || null}
        mode={liveMonitorDialog?.mode || null}
        status={liveMonitorDialog?.status || "requesting"}
        error={liveMonitorDialog?.error}
        agentName={liveMonitorDialog ? resolveAgentName(liveMonitorDialog.call.agentId, liveMonitorDialog.call.agentName) : ""}
        phoneLabel={liveMonitorDialog ? ((shouldMaskPhone ? hidePhoneDisplay(liveMonitorDialog.call.callerId) : liveMonitorDialog.call.callerId) || "—") : "—"}
        callTimer={callTimer}
        onClose={handleCloseLiveMonitorDialog}
        onEnd={() => { void endCall(); }}
      />

    </motion.div>
  );
}
