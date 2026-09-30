import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { LogIn, LogOut, PhoneCall, ShieldCheck, Trophy, Users } from "lucide-react";
import { api, type AgentRecord, type LiveAgentRecord } from "@/lib/api";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { buildAgentActivityRows, type AgentActivityRow } from "@/lib/agentActivity";
import { isBoardScopedAgentId } from "@/lib/agentBoardScope";
import { getBusinessDateString, normalizeBusinessDateValue } from "@/lib/businessDate";
import { getAgentCallMetricsByAgent } from "@/lib/callMetrics";
import type { CallRecord, MetalRate } from "@/data/mockData";
import {
  grantAgentStatusBoardAccess,
  hasAgentStatusBoardAccess,
  isAgentStatusBoardCredential,
  revokeAgentStatusBoardAccess,
} from "@/lib/agentStatusBoardAuth";

type RankedAgentStatusRow = AgentActivityRow & {
  rank: number;
  performanceScore: number;
};

type BoardViewMode = "live" | "overall";

type BoardSnapshot = {
  liveRows: AgentActivityRow[];
  allRows: AgentActivityRow[];
  callsToday: CallRecord[];
  syncedAt: string;
};

const BOARD_REFRESH_MS = 30_000;

const normalizeBoardText = (value: unknown) => String(value || "").trim().toLowerCase();

const getPositiveCount = (value: unknown) => Math.max(0, Number(value) || 0);

const getGridRowCount = (itemCount: number, columnCount: number) => (
  Math.max(1, Math.ceil(Math.max(0, itemCount) / columnCount))
);

const isLiveAgentRecord = (agent: LiveAgentRecord | undefined) => {
  if (!agent?.agentId) return false;
  const status = normalizeBoardText(agent.status);
  const sipStatus = normalizeBoardText(agent.sipStatus);
  const hasLiveCall = (
    getPositiveCount(agent.activeCalls) > 0
    || getPositiveCount(agent.activeAutoDialCount) > 0
    || status === "on-call"
    || status === "ringing"
    || status === "dialing"
    || sipStatus === "ringing"
  );
  if (hasLiveCall) return true;
  if (agent.isLoggedIn !== true) return false;
  return !["", "offline", "inactive", "logged out", "logged-out", "unavailable"].includes(status);
};

const isLiveAgentRow = (row: AgentActivityRow, agent: LiveAgentRecord | undefined) => {
  if (!isLiveAgentRecord(agent)) return false;

  const status = normalizeBoardText(agent?.status);
  const sipStatus = normalizeBoardText(agent?.sipStatus);
  if (
    status === "on-call"
    || status === "ringing"
    || status === "dialing"
    || sipStatus === "ringing"
    || getPositiveCount(agent?.activeCalls) > 0
    || getPositiveCount(agent?.activeAutoDialCount) > 0
  ) return true;
  if (agent?.queuePaused === true || sipStatus === "unavailable") return agent.isLoggedIn === true;

  return row.isLoggedIn || agent?.isLoggedIn === true;
};

const getStatusBadgeClassName = (status: string) => {
  const normalized = normalizeBoardText(status);
  if (normalized === "on-call" || normalized === "ringing" || normalized === "dialing") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "available" || normalized === "follow-up") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized.includes("break") || normalized.includes("pause")) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

const getStatusDotClassName = (status: string) => {
  const normalized = normalizeBoardText(status);
  if (normalized === "on-call" || normalized === "ringing" || normalized === "dialing") return "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.14)]";
  if (normalized === "available" || normalized === "follow-up") return "bg-emerald-500 shadow-[0_0_0_4px_rgba(34,197,94,0.14)]";
  if (normalized.includes("break") || normalized.includes("pause")) return "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.14)]";
  return "bg-slate-400 shadow-[0_0_0_4px_rgba(100,116,139,0.14)]";
};

const getCallTimestamp = (call: Pick<CallRecord, "createdAt" | "date" | "time">) => {
  const createdAtTimestamp = call.createdAt ? new Date(call.createdAt).getTime() : Number.NaN;
  if (!Number.isNaN(createdAtTimestamp)) return createdAtTimestamp;
  const normalizedDate = normalizeBusinessDateValue(call.date || "");
  if (!normalizedDate) return 0;

  const parsed = new Date(`${normalizedDate}T${String(call.time || "00:00:00").trim() || "00:00:00"}`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

function buildTodayAgentRows(
  directoryAgents: AgentRecord[],
  liveAgents: LiveAgentRecord[],
  agentCallMetricsById: Map<string, { agentId: string; totalCalls: number; inboundCalls: number; outboundCalls: number }>,
  sourceCalls: CallRecord[],
) {
  const rowsById = new Map(
    buildAgentActivityRows(
      directoryAgents,
      liveAgents,
      agentCallMetricsById,
      { agentIdPrefix: "AG0", includeSeedAgents: false },
    )
      .filter((row) => isBoardScopedAgentId(row.agentId))
      .map((row) => [row.agentId, row] as const),
  );

  const callNameByAgentId = new Map<string, string>();
  sourceCalls.forEach((call) => {
    const agentId = String(call.agentId || "").trim();
    const agentName = String(call.agentName || "").trim();
    if (isBoardScopedAgentId(agentId) && agentName && !callNameByAgentId.has(agentId)) {
      callNameByAgentId.set(agentId, agentName);
    }
  });

  agentCallMetricsById.forEach((metrics, agentIdValue) => {
    const agentId = String(agentIdValue || metrics.agentId || "").trim();
    if (!isBoardScopedAgentId(agentId) || rowsById.has(agentId)) return;

    rowsById.set(agentId, {
      agentId,
      agentName: callNameByAgentId.get(agentId) || agentId,
      extension: "",
      totalCalls: getPositiveCount(metrics.totalCalls),
      inboundCalls: getPositiveCount(metrics.inboundCalls),
      outboundCalls: getPositiveCount(metrics.outboundCalls),
      isLoggedIn: false,
      status: "offline",
      followUpsPending: 0,
    });
  });

  return Array.from(rowsById.values());
}

function StatusBoardLogin({ onSuccess }: { onSuccess: () => void }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (!isAgentStatusBoardCredential(loginId, password)) {
      setError("Invalid login ID or password");
      return;
    }

    grantAgentStatusBoardAccess();
    setError("");
    onSuccess();
  };

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px] items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Administration</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Agent Status
            </h1>
          </div>

          <div className="surface-panel border-primary/15 p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
                <img src={BRAND_LOGO_SRC} alt="Attica Gold" className="h-full w-full rounded-md object-contain" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">View Access</p>
                <h2 className="text-2xl font-semibold tracking-tight">Board Login</h2>
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Login ID</label>
                <input
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  placeholder="Enter page login ID"
                  className="control-field w-full"
                  onKeyDown={(event) => event.key === "Enter" && handleLogin()}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="control-field w-full"
                  onKeyDown={(event) => event.key === "Enter" && handleLogin()}
                />
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

            <button
              onClick={handleLogin}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg, hsl(var(--success)), hsl(var(--primary)))" }}
            >
              <LogIn className="h-4 w-4" />
              Open Agent Status Board
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function AgentStatusBoardPage() {
  const [isAuthorized, setIsAuthorized] = useState(() => hasAgentStatusBoardAccess());
  const [boardMode, setBoardMode] = useState<BoardViewMode>("live");
  const [boardSnapshot, setBoardSnapshot] = useState<BoardSnapshot>({
    liveRows: [],
    allRows: [],
    callsToday: [],
    syncedAt: "",
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [boardRates, setBoardRates] = useState<MetalRate[]>([]);
  const boardLoadSeq = useRef(0);
  const boardLoadInFlight = useRef(false);
  const tickerItems = useMemo(() => [...boardRates, ...boardRates, ...boardRates], [boardRates]);

  const loadBoardRates = useCallback(async () => {
    try {
      const ratesData = await api.getRates();
      if (Array.isArray(ratesData)) {
        setBoardRates(ratesData.filter((rate) => String(rate.label || "").trim() && String(rate.value || "").trim()));
      }
    } catch (error) {
      console.error("Agent status board rates refresh failed:", error);
    }
  }, []);

  const loadBoardSnapshot = useCallback(async (options?: { silent?: boolean }) => {
    if (boardLoadInFlight.current) return;

    const silent = options?.silent ?? false;
    const loadSeq = boardLoadSeq.current + 1;
    boardLoadSeq.current = loadSeq;
    boardLoadInFlight.current = true;

    if (!silent) setLoading(true);
    if (silent) setSyncing(true);

    try {
      const today = getBusinessDateString(new Date());
      const [directoryAgentsResult, liveAgentsResult, callsByDate] = await Promise.all([
        api.getAgentsSnapshot(),
        // Use the backend's short live-agent cache for routine board refreshes.
        // A forced Asterisk snapshot on every board tick multiplied PBX work
        // when several agent/admin panels were open at once.
        api.getLiveAgentsSnapshot(),
        api.getAllCallsSnapshot({ date: today, limit: 1000 }),
      ]);
      if (!directoryAgentsResult.ok || !liveAgentsResult.ok || !callsByDate.ok) {
        console.error("Agent status board refresh kept last good snapshot:", {
          agentsOk: directoryAgentsResult.ok,
          liveAgentsOk: liveAgentsResult.ok,
          callsOk: callsByDate.ok,
        });
        return;
      }
      const directoryAgents = directoryAgentsResult.data;
      const liveAgents = liveAgentsResult.data;
      const liveById = new Map(
        (Array.isArray(liveAgents) ? liveAgents : [])
          .filter((agent) => isBoardScopedAgentId(agent.agentId))
          .map((agent) => [agent.agentId, agent]),
      );
      const sourceCalls = Array.isArray(callsByDate.data.results) ? callsByDate.data.results : [];
      const agentCallMetricsById = getAgentCallMetricsByAgent(
        sourceCalls,
      );

      const allRows = buildTodayAgentRows(
        Array.isArray(directoryAgents) ? directoryAgents : [],
        Array.isArray(liveAgents) ? liveAgents : [],
        agentCallMetricsById,
        sourceCalls,
      );
      const liveRows = allRows.filter((row) => isLiveAgentRow(row, liveById.get(row.agentId)));
      const syncedAt = new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      if (loadSeq !== boardLoadSeq.current) return;

      setBoardSnapshot((previous) => ({
        liveRows,
        allRows,
        callsToday: sourceCalls,
        syncedAt,
      }));
    } catch (error) {
      console.error("Agent status board refresh failed; keeping last good snapshot:", error);
    } finally {
      if (loadSeq === boardLoadSeq.current) {
        if (!silent) setLoading(false);
        setSyncing(false);
      }
      boardLoadInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    void loadBoardRates();
    void loadBoardSnapshot();
    const boardInterval = window.setInterval(() => {
      void loadBoardRates();
      void loadBoardSnapshot({ silent: true });
    }, BOARD_REFRESH_MS);
    return () => {
      window.clearInterval(boardInterval);
    };
  }, [isAuthorized, loadBoardRates, loadBoardSnapshot]);

  const buildRankedRows = useCallback((sourceRows: AgentActivityRow[], includeIdleRows: boolean) => {
    return sourceRows.map((row) => {
      const convertedBills = getPositiveCount(row.convertedBills);
      const enquiryToday = getPositiveCount(row.enquiryToday);
      const releaseToday = getPositiveCount(row.releaseToday);
      const convertedTotal = convertedBills + enquiryToday + releaseToday;

      return {
        ...row,
        convertedBills,
        enquiryToday,
        releaseToday,
        convertedTotal,
        performanceScore: (
          (convertedTotal * 1000)
          + (getPositiveCount(row.totalCalls) * 10)
          + (convertedBills * 50)
        ),
      };
    })
    .filter((row) => (
      includeIdleRows
      || row.totalCalls > 0
      || row.convertedTotal > 0
    ))
    .sort((left, right) => (
      right.performanceScore - left.performanceScore
      || right.convertedTotal - left.convertedTotal
      || right.convertedBills - left.convertedBills
      || right.totalCalls - left.totalCalls
      || right.enquiryToday - left.enquiryToday
      || right.releaseToday - left.releaseToday
      || left.agentName.localeCompare(right.agentName)
    ))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  }, []);

  const rankedRows = useMemo<RankedAgentStatusRow[]>(() => (
    buildRankedRows(boardMode === "live" ? boardSnapshot.liveRows : boardSnapshot.allRows, boardMode === "live")
  ), [boardMode, boardSnapshot.allRows, boardSnapshot.liveRows, buildRankedRows]);

  const summaryRows = useMemo(() => (
    boardMode === "live" ? boardSnapshot.liveRows : boardSnapshot.allRows
  ), [boardMode, boardSnapshot.allRows, boardSnapshot.liveRows]);

  const summaryAgentIds = useMemo(() => (
    new Set(summaryRows.map((row) => row.agentId))
  ), [summaryRows]);

  const summary = useMemo(() => {
    const conversionRows = boardSnapshot.allRows;
    const conversionCounts = conversionRows.reduce((totals, row) => {
      totals.convertedBills += getPositiveCount(row.convertedBills);
      totals.enquiryToday += getPositiveCount(row.enquiryToday);
      totals.releaseToday += getPositiveCount(row.releaseToday);
      return totals;
    }, {
      convertedBills: 0,
      enquiryToday: 0,
      releaseToday: 0,
    });

    return {
      agentCount: summaryAgentIds.size,
      totalCalls: summaryRows.reduce((total, row) => total + getPositiveCount(row.totalCalls), 0),
      inboundCalls: summaryRows.reduce((total, row) => total + getPositiveCount(row.inboundCalls), 0),
      outboundCalls: summaryRows.reduce((total, row) => total + getPositiveCount(row.outboundCalls), 0),
      ...conversionCounts,
      convertedTotal: conversionCounts.convertedBills + conversionCounts.enquiryToday + conversionCounts.releaseToday,
    };
  }, [boardSnapshot.allRows, summaryAgentIds, summaryRows]);

  const isOverallMode = boardMode === "overall";
  const agentCountLabel = isOverallMode ? "Agents Today" : "Live Agents";
  const agentCountSubtitle = isOverallMode ? "All AG0 agents with activity today" : "Only visible live AG0 agents";
  const callSummarySubtitle = isOverallMode ? "All displayed agents for today" : "Calls for visible live agents only";
  const inboundSummarySubtitle = isOverallMode ? "Inbound calls for displayed agents" : "Visible live-agent inbound only";
  const outboundSummarySubtitle = isOverallMode ? "Outbound calls for displayed agents" : "Visible live-agent outbound only";
  const conversionSummarySubtitle = "All attributed agents for today";
  const emptyStateText = isOverallMode ? "No AG0 agent activity found for today." : "No live AG0 agents found.";
  const gridRowStyle = useMemo(() => ({
    "--agent-board-rows-1": String(getGridRowCount(rankedRows.length, 1)),
    "--agent-board-rows-2": String(getGridRowCount(rankedRows.length, 2)),
    "--agent-board-rows-4": String(getGridRowCount(rankedRows.length, 4)),
    "--agent-board-rows-8": String(getGridRowCount(rankedRows.length, 8)),
  }) as CSSProperties, [rankedRows.length]);
  const agentGridClassName = `agent-status-board-grid ${
    boardMode === "live" ? "agent-status-board-grid--live" : "agent-status-board-grid--fit"
  }`;

  const handleLogout = () => {
    revokeAgentStatusBoardAccess();
    setIsAuthorized(false);
  };

  if (!isAuthorized) {
    return <StatusBoardLogin onSuccess={() => setIsAuthorized(true)} />;
  }

  return (
    <div className="app-shell h-screen overflow-hidden">
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <header className="shrink-0 px-2 pt-2 sm:px-3">
          <div className="premium-header header-glow rounded-t-xl px-4 py-2 text-primary-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
                  <img src={BRAND_LOGO_SRC} alt="Attica Gold" className="h-full w-full rounded-md object-contain" />
                </div>
                <div>
                  <h1 className="text-base font-semibold leading-tight">Attica Gold Callcenter</h1>
                  <p className="text-[11px] leading-tight text-primary-foreground/80">Agent Status Board</p>
                </div>
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                <div className="inline-flex rounded-lg border border-card/25 bg-card/10 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setBoardMode("live")}
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      boardMode === "live"
                        ? "bg-card text-primary"
                        : "text-primary-foreground/75 hover:bg-card/10 hover:text-primary-foreground"
                    }`}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardMode("overall")}
                    className={`rounded-md px-2 py-0.5 font-medium transition ${
                      boardMode === "overall"
                        ? "bg-card text-primary"
                        : "text-primary-foreground/75 hover:bg-card/10 hover:text-primary-foreground"
                    }`}
                  >
                    Overall Day
                  </button>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-card/25 bg-card/10 px-2 py-0.5 text-xs">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
                  <span className="text-xs text-primary-foreground/70">Synced every 30s</span>
                </div>
                {boardSnapshot.syncedAt ? (
                  <div className="hidden items-center gap-1.5 rounded-lg border border-card/25 bg-card/10 px-2 py-0.5 text-xs sm:inline-flex">
                    <span className="text-xs text-primary-foreground/70">{syncing ? "Syncing" : "Data synced at"}</span>
                    <span className="text-xs font-medium text-primary-foreground">{boardSnapshot.syncedAt}</span>
                  </div>
                ) : null}
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-card/25 bg-card/10 px-2 py-0.5 text-xs text-primary-foreground/90 transition hover:bg-card/20"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </button>
              </div>
            </div>
          </div>
          <div className="ticker-wrap">
            <div className="ticker-track !gap-6 !px-4 !py-1 !text-xs">
              {tickerItems.map((item, index) => {
                return (
                  <span key={`${item.label}-${item.value}-${index}`} className="ticker-item">
                    <span>Today's {item.label}</span>
                    <span className="ticker-value">{item.value}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5 pt-1.5 sm:p-2 sm:pt-2">
          <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
            <div className="grid shrink-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
              <div className="surface-panel border-primary/20 bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),white_72%)] px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[clamp(1.25rem,1.8vw,1.9rem)] font-semibold leading-none text-primary">{summary.agentCount}</p>
                    <p className="mt-1 text-[clamp(0.72rem,0.85vw,0.95rem)] font-medium leading-tight text-primary/75">{agentCountLabel}</p>
                  </div>
                  <Users className="h-6 w-6 text-primary/70" />
                </div>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{agentCountSubtitle}</p>
              </div>
              <div className="surface-panel border-amber-200 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),white_72%)] px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[clamp(1.25rem,1.8vw,1.9rem)] font-semibold leading-none text-amber-700">{summary.totalCalls}</p>
                    <p className="mt-1 text-[clamp(0.72rem,0.85vw,0.95rem)] font-medium leading-tight text-amber-800/75">Total Calls Today</p>
                  </div>
                  <PhoneCall className="h-6 w-6 text-amber-700/70" />
                </div>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{callSummarySubtitle}</p>
              </div>
              <div className="surface-panel border-amber-200 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),white_72%)] px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[clamp(1.25rem,1.8vw,1.9rem)] font-semibold leading-none text-amber-700">{summary.inboundCalls}</p>
                    <p className="mt-1 text-[clamp(0.72rem,0.85vw,0.95rem)] font-medium leading-tight text-amber-800/75">Inbound Today</p>
                  </div>
                  <PhoneCall className="h-6 w-6 text-amber-700/70" />
                </div>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{inboundSummarySubtitle}</p>
              </div>
              <div className="surface-panel border-sky-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),white_72%)] px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[clamp(1.25rem,1.8vw,1.9rem)] font-semibold leading-none text-sky-700">{summary.outboundCalls}</p>
                    <p className="mt-1 text-[clamp(0.72rem,0.85vw,0.95rem)] font-medium leading-tight text-sky-800/75">Outbound Today</p>
                  </div>
                  <PhoneCall className="h-6 w-6 text-sky-700/70" />
                </div>
                <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{outboundSummarySubtitle}</p>
              </div>
              <div className="surface-panel border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),white_72%)] px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[clamp(1.25rem,1.8vw,1.9rem)] font-semibold leading-none text-emerald-700">{summary.convertedTotal}</p>
                    <p className="mt-1 text-[clamp(0.72rem,0.85vw,0.95rem)] font-medium leading-tight text-emerald-800/75">Total Converted Today</p>
                  </div>
                  <Trophy className="h-6 w-6 text-emerald-700/70" />
                </div>
                <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
                  {syncing ? "Syncing customer API..." : boardSnapshot.syncedAt ? `${conversionSummarySubtitle} | Customer API ${boardSnapshot.syncedAt}` : conversionSummarySubtitle}
                </p>
                <div className="mt-0.5 grid grid-cols-3 gap-1 text-center text-[9px] font-semibold leading-tight text-emerald-800">
                  <span className="rounded bg-emerald-50 px-1 py-0.5">Bills {summary.convertedBills}</span>
                  <span className="rounded bg-amber-50 px-1 py-0.5">Enquiry {summary.enquiryToday}</span>
                  <span className="rounded bg-sky-50 px-1 py-0.5">Release {summary.releaseToday}</span>
                </div>
              </div>
            </div>

          {rankedRows.length === 0 && !loading ? (
            <div className="surface-panel flex min-h-0 flex-1 items-center justify-center text-base text-muted-foreground">
              {emptyStateText}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl p-0 pr-1">
              <div className={agentGridClassName} style={gridRowStyle}>
                {rankedRows.map((row) => (
                  <div key={row.agentId} className="agent-status-board-card rounded-lg border border-primary/15 bg-[linear-gradient(180deg,hsl(var(--primary)/0.06),transparent_44%),white] p-2.5 shadow-sm">
                    <div className="agent-status-board-card-header">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="inline-flex shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold leading-tight text-primary-foreground">#{row.rank}</span>
                        <span
                          className={`agent-status-board-status-badge ${getStatusBadgeClassName(row.status)}`}
                          title={row.status.replace(/-/g, " ")}
                        >
                          {row.status.replace(/-/g, " ")}
                        </span>
                      </div>
                      <div className="mt-2 flex min-w-0 items-center gap-1.5">
                        <span
                          className={`live-pulse inline-block h-3 w-3 shrink-0 rounded-full ${getStatusDotClassName(row.status)}`}
                          title={row.status.replace(/-/g, " ")}
                        />
                        <p className="agent-status-board-agent-name" title={row.agentName}>{row.agentName}</p>
                      </div>
                      <p className="agent-status-board-agent-id font-mono text-primary">{row.agentId}</p>
                    </div>
                    <div className="agent-status-board-card-metrics">
                      <div className="agent-status-board-metric-wide border-primary/15 bg-primary/5">
                        <p className="agent-status-board-metric-label text-primary/70">Calls Today</p>
                        <p className="agent-status-board-call-value text-primary">{row.totalCalls}</p>
                      </div>
                      <div className="agent-status-board-metric-grid">
                        <div className="agent-status-board-metric-box border-amber-200 bg-amber-50">
                          <p className="agent-status-board-metric-label text-amber-700">Incoming</p>
                          <p className="agent-status-board-metric-value text-amber-800">{row.inboundCalls}</p>
                        </div>
                        <div className="agent-status-board-metric-box border-sky-200 bg-sky-50">
                          <p className="agent-status-board-metric-label text-sky-700">Outgoing</p>
                          <p className="agent-status-board-metric-value text-sky-800">{row.outboundCalls}</p>
                        </div>
                        <div className="agent-status-board-metric-box border-emerald-200 bg-emerald-50">
                          <p className="agent-status-board-metric-label text-emerald-700">Conversion</p>
                          <p className="agent-status-board-metric-value text-emerald-800">{row.convertedBills}</p>
                        </div>
                        <div className="agent-status-board-metric-box border-muted bg-muted/35">
                          <p className="agent-status-board-metric-label text-muted-foreground">Release</p>
                          <p className="agent-status-board-metric-value text-foreground">{row.releaseToday}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
