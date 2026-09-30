import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, Coffee, PhoneCall, PhoneForwarded, RefreshCw, Users } from "lucide-react";
import { api, type LiveAgentRecord, type LiveWaitingQueueSnapshot } from "@/lib/api";
import type { CallRecord } from "@/data/mockData";
import { getAgentStatusLabel, isBreakStatus } from "@/lib/agentStatus";
import { getBusinessDateString } from "@/lib/businessDate";
import { isAgentCurrentlyOnCall, isOpenLiveCallRecord } from "@/lib/liveCallState";

const REFRESH_MS = 30000;
const QUEUE_LANGUAGES = ["English", "Kannada", "Tamil", "Telugu", "Hindi"];
const OUTBOUND_WORK_MODES = new Set(["outbound-auto", "follow-up"]);

const emptyQueueSnapshot: LiveWaitingQueueSnapshot = {
  generatedAt: "",
  totalWaiting: 0,
  queues: [],
};

type LoadState = {
  agents: LiveAgentRecord[];
  queue: LiveWaitingQueueSnapshot;
  liveCalls: CallRecord[];
  incomingToday: IncomingTodayMetrics;
  outgoingToday: WorkModeTodayMetrics;
  followUpToday: WorkModeTodayMetrics;
  loading: boolean;
  error: string;
  lastSync: string;
};

type IncomingTodayMetrics = {
  total: number;
  answered: number;
  missed: number;
  unique: number;
};

type WorkModeTodayMetrics = {
  total: number;
  queue: number;
  dialed: number;
  answered: number;
  unique: number;
  uniqueAnswered: number;
};

type AgentGroup = {
  incomingLive: LiveAgentRecord[];
  incomingIdle: LiveAgentRecord[];
  incomingBreak: LiveAgentRecord[];
  outboundLive: LiveAgentRecord[];
  outboundIdle: LiveAgentRecord[];
  outboundBreak: LiveAgentRecord[];
  followUpLive: LiveAgentRecord[];
  followUpIdle: LiveAgentRecord[];
  followUpBreak: LiveAgentRecord[];
};

function normalizeText(value?: string | null) {
  return String(value || "").trim();
}

function normalizeStatus(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function readNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function buildIncomingTodayMetrics(stats: Record<string, unknown> | null | undefined): IncomingTodayMetrics {
  const row = stats || {};
  return {
    total: readNumber(row.incomingTotal ?? row.inbound),
    answered: readNumber(row.incomingAnswered ?? row.answered),
    missed: readNumber(row.incomingMissed ?? row.missed),
    unique: readNumber(row.incomingUnique ?? row.uniqueIncoming),
  };
}

function buildWorkModeTodayMetrics(
  stats: Record<string, unknown> | null | undefined,
  prefix: "outgoing" | "followUp",
): WorkModeTodayMetrics {
  const row = stats || {};
  const dialed = readNumber(row[`${prefix}Dialed`]);
  return {
    total: readNumber(row[`${prefix}Total`] ?? dialed),
    queue: readNumber(row[`${prefix}Queue`]),
    dialed,
    answered: readNumber(row[`${prefix}Answered`]),
    unique: readNumber(row[`${prefix}Unique`]),
    uniqueAnswered: readNumber(row[`${prefix}UniqueAnswered`]),
  };
}

function hasActiveCall(agent: LiveAgentRecord) {
  const status = normalizeStatus(agent.status);
  const sipStatus = normalizeStatus(agent.sipStatus);
  return (
    Number(agent.activeCalls || 0) > 0
    || Number(agent.activeAutoDialCount || 0) > 0
    || status === "on-call"
    || status === "ringing"
    || status === "dialing"
    || sipStatus === "ringing"
  );
}

function isAgentOnBreak(agent: LiveAgentRecord) {
  return Boolean(agent.onBreak) || isBreakStatus(agent.status) || isBreakStatus(agent.workMode);
}

function isOutboundFollowUpMode(agent: LiveAgentRecord) {
  return OUTBOUND_WORK_MODES.has(normalizeStatus(agent.workMode)) || OUTBOUND_WORK_MODES.has(normalizeStatus(agent.status));
}

function isOutboundMode(agent: LiveAgentRecord) {
  return normalizeStatus(agent.workMode) === "outbound-auto" || normalizeStatus(agent.status) === "outbound-auto";
}

function isFollowUpMode(agent: LiveAgentRecord) {
  return normalizeStatus(agent.workMode) === "follow-up" || normalizeStatus(agent.status) === "follow-up";
}

function isLoggedInAgent(agent: LiveAgentRecord) {
  return agent.isLoggedIn === true;
}

function canWorkIncoming(agent: LiveAgentRecord) {
  const workMode = normalizeStatus(agent.workMode);
  const status = normalizeStatus(agent.status);
  return agent.incomingAccess !== false && (workMode === "active" || status === "active" || status === "available" || Boolean(agent.queueMemberships?.length));
}

function canWorkOutboundFollowUp(agent: LiveAgentRecord) {
  return (
    isOutboundFollowUpMode(agent) ||
    Boolean(agent.outgoingAccess) ||
    Boolean(agent.followUpAccess)
  );
}

function hasIdlePresence(agent: LiveAgentRecord) {
  if (hasActiveCall(agent) || isAgentOnBreak(agent) || agent.queuePaused) return false;
  const status = normalizeStatus(agent.status);
  const sipStatus = normalizeStatus(agent.sipStatus);
  return status === "available" || status === "active" || status === "outbound-auto" || status === "follow-up" || sipStatus === "not in use";
}

function isIncomingIdleAgent(agent: LiveAgentRecord) {
  return hasIdlePresence(agent);
}

function isOutboundFollowUpIdleAgent(agent: LiveAgentRecord) {
  if (hasActiveCall(agent) || isAgentOnBreak(agent)) return false;
  const status = normalizeStatus(agent.status);
  const workMode = normalizeStatus(agent.workMode);
  const sipStatus = normalizeStatus(agent.sipStatus);
  return (
    Boolean(agent.canReceiveAutoDialAssignments) ||
    status === "outbound-auto" ||
    status === "follow-up" ||
    workMode === "outbound-auto" ||
    workMode === "follow-up" ||
    sipStatus === "not in use"
  );
}

function getAgentDisplayName(agent: LiveAgentRecord) {
  const name = normalizeText(agent.agentName);
  return name || agent.agentId;
}

function getAgentLanguageLabel(agent: LiveAgentRecord) {
  const languages = Array.isArray(agent.languages)
    ? agent.languages.map((language) => normalizeText(language)).filter(Boolean)
    : [];
  return languages.length > 0 ? languages.join(", ") : "No language assigned";
}

function getAgentDisplayStatusLabel(agent: LiveAgentRecord) {
  const sipStatus = normalizeStatus(agent.sipStatus);
  if (sipStatus === "ringing") return "Ringing";
  if (Number(agent.activeAutoDialCount || 0) > 0 && Number(agent.activeCalls || 0) === 0) {
    return "Dialing";
  }
  return getAgentStatusLabel(agent.status);
}

function formatSyncTime(value?: string) {
  if (!value) return "Not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced";
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function groupAgents(agents: LiveAgentRecord[], liveCallAgentIds: Set<string>): AgentGroup {
  return agents.filter(isLoggedInAgent).reduce<AgentGroup>((groups, agent) => {
    const onCall = liveCallAgentIds.has(agent.agentId) || hasActiveCall(agent);
    const onBreak = isAgentOnBreak(agent);
    const outboundAgent = isOutboundMode(agent) || (!isFollowUpMode(agent) && !canWorkIncoming(agent) && Boolean(agent.outgoingAccess));
    const followUpAgent = isFollowUpMode(agent) || (!outboundAgent && !canWorkIncoming(agent) && Boolean(agent.followUpAccess));
    const incomingAgent = canWorkIncoming(agent) && !outboundAgent && !followUpAgent;

    if (incomingAgent) {
      if (onCall) groups.incomingLive.push(agent);
      else if (onBreak) groups.incomingBreak.push(agent);
      else if (isIncomingIdleAgent(agent)) groups.incomingIdle.push(agent);
    }

    if (outboundAgent) {
      if (onCall) groups.outboundLive.push(agent);
      else if (onBreak) groups.outboundBreak.push(agent);
      else if (isOutboundFollowUpIdleAgent(agent)) groups.outboundIdle.push(agent);
    }

    if (followUpAgent) {
      if (onCall) groups.followUpLive.push(agent);
      else if (onBreak) groups.followUpBreak.push(agent);
      else if (isOutboundFollowUpIdleAgent(agent)) groups.followUpIdle.push(agent);
    }

    return groups;
  }, {
    incomingLive: [],
    incomingIdle: [],
    incomingBreak: [],
    outboundLive: [],
    outboundIdle: [],
    outboundBreak: [],
    followUpLive: [],
    followUpIdle: [],
    followUpBreak: [],
  });
}

function buildLanguageRows(queue: LiveWaitingQueueSnapshot) {
  const totals = new Map<string, {
    language: string;
    waiting: number;
    available: number;
    paused: number;
    callers: string[];
  }>();

  QUEUE_LANGUAGES.forEach((language) => {
    totals.set(language.toLowerCase(), {
      language,
      waiting: 0,
      available: 0,
      paused: 0,
      callers: [],
    });
  });

  queue.queues.forEach((record) => {
    const language = normalizeText(record.language || record.queueName) || "Unknown";
    const key = language.toLowerCase();
    const existing = totals.get(key) || {
      language,
      waiting: 0,
      available: 0,
      paused: 0,
      callers: [],
    };

    existing.waiting += Number(record.waitingCalls || 0);
    existing.available += Number(record.availableMembers || 0);
    existing.paused += Number(record.pausedMembers || 0);
    existing.callers.push(...record.callers.map((caller) => caller.customerNumber).filter(Boolean));
    totals.set(key, existing);
  });

  return Array.from(totals.values()).sort((a, b) => {
    const leftIndex = QUEUE_LANGUAGES.indexOf(a.language);
    const rightIndex = QUEUE_LANGUAGES.indexOf(b.language);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return a.language.localeCompare(b.language);
  });
}

function MetricCard({
  title,
  value,
  icon,
  tone,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: ReactNode;
  tone: "blue" | "green" | "amber" | "violet" | "slate";
  subtitle?: string;
}) {
  const toneClasses = {
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
    slate: "border-slate-200 bg-white text-slate-900",
  };

  return (
    <div className={`min-w-0 rounded-lg border p-2 shadow-sm sm:p-2.5 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[clamp(0.58rem,0.62vw,0.7rem)] font-semibold uppercase tracking-[0.1em] opacity-70">{title}</p>
          <p className="mt-1 text-[clamp(1.35rem,1.8vw,2rem)] font-bold leading-none">{value}</p>
        </div>
        <div className="shrink-0 rounded-md bg-white/70 p-1 shadow-sm">{icon}</div>
      </div>
      {subtitle ? <p className="mt-1 truncate text-[10px] font-medium opacity-75">{subtitle}</p> : null}
    </div>
  );
}

function TinyMetricPill({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "amber" | "blue" }) {
  const toneClasses = {
    slate: "border-slate-200 bg-white text-slate-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold shadow-sm ${toneClasses[tone]}`}>
      <span className="text-[10px] uppercase tracking-wide opacity-65">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

function AgentList({
  title,
  agents,
  emptyLabel,
}: {
  title: string;
  agents: LiveAgentRecord[];
  emptyLabel: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{agents.length}</span>
      </div>
      {agents.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {agents.map((agent) => (
            <div key={agent.agentId} className="flex items-center justify-between gap-1.5 rounded-md bg-slate-50 px-2 py-1">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900">{getAgentDisplayName(agent)}</p>
                <p className="text-[11px] text-slate-500">{agent.agentId}{agent.extension ? ` - Ext ${agent.extension}` : ""}</p>
                <p className="truncate text-[10px] font-medium text-slate-400">{getAgentLanguageLabel(agent)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {getAgentDisplayStatusLabel(agent)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs text-slate-500">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

export default function StatusDashboardPage() {
  const loadInFlightRef = useRef(false);
  const [state, setState] = useState<LoadState>({
    agents: [],
    queue: emptyQueueSnapshot,
    liveCalls: [],
    incomingToday: { total: 0, answered: 0, missed: 0, unique: 0 },
    outgoingToday: { total: 0, queue: 0, dialed: 0, answered: 0, unique: 0, uniqueAnswered: 0 },
    followUpToday: { total: 0, queue: 0, dialed: 0, answered: 0, unique: 0, uniqueAnswered: 0 },
    loading: true,
    error: "",
    lastSync: "",
  });

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const silent = options?.silent ?? false;
    if (!silent) {
      setState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const today = getBusinessDateString(new Date());
      const [agentsResult, queueResult, statsResult, liveCallsResult] = await Promise.all([
        api.getLiveAgentsSnapshot(),
        api.getLiveWaitingQueueSnapshot(),
        api.getStatsSnapshot(),
        api.getAllCallsSnapshot({ date: today, status: "live", limit: 300, dedupe: false }),
      ]);
      setState((current) => ({
        agents: agentsResult.ok ? agentsResult.data : current.agents,
        queue: queueResult.ok ? queueResult.data : current.queue,
        liveCalls: liveCallsResult.ok ? liveCallsResult.data.results : current.liveCalls,
        incomingToday: statsResult.ok ? buildIncomingTodayMetrics(statsResult.data) : current.incomingToday,
        outgoingToday: statsResult.ok ? buildWorkModeTodayMetrics(statsResult.data, "outgoing") : current.outgoingToday,
        followUpToday: statsResult.ok ? buildWorkModeTodayMetrics(statsResult.data, "followUp") : current.followUpToday,
        loading: false,
        error: agentsResult.ok && queueResult.ok && statsResult.ok && liveCallsResult.ok
          ? ""
          : "Live display refresh had a temporary issue. Showing last good values.",
        lastSync: new Date().toISOString(),
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Status dashboard could not be loaded.",
        lastSync: new Date().toISOString(),
      }));
    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const interval = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  const liveCallAgentIds = useMemo(() => {
    const agentById = new Map(state.agents.map((agent) => [agent.agentId, agent]));
    return new Set(
      state.liveCalls
        .filter((call) => isOpenLiveCallRecord(call))
        .filter((call) => isAgentCurrentlyOnCall(agentById.get(call.agentId)))
        .map((call) => call.agentId)
        .filter(Boolean),
    );
  }, [state.agents, state.liveCalls]);
  const agentGroups = useMemo(() => groupAgents(state.agents, liveCallAgentIds), [liveCallAgentIds, state.agents]);
  const loggedInAgents = useMemo(() => state.agents.filter(isLoggedInAgent), [state.agents]);
  const languageRows = useMemo(() => buildLanguageRows(state.queue), [state.queue]);
  const totalIncomingWaiting = languageRows.reduce((sum, row) => sum + row.waiting, 0);
  const incomingToday = state.incomingToday;
  const outgoingToday = state.outgoingToday;
  const followUpToday = state.followUpToday;

  return (
    <div className="h-full max-h-screen min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden bg-slate-100 p-2 text-slate-950 xl:overflow-hidden sm:p-3">
      <div className="mb-2 flex min-h-14 min-w-0 items-center justify-between gap-2 rounded-xl bg-slate-950 px-3 py-2 pr-2 text-white shadow-sm lg:pr-64">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">Status Dashboard</p>
          <h1 className="mt-0.5 truncate text-[clamp(1rem,1.35vw,1.25rem)] font-bold">Live Operations Display</h1>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-[11px]">
          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
            Logged in agents: {loggedInAgents.length}
          </span>
          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
            Last sync: {formatSyncTime(state.lastSync || state.queue.generatedAt)}
          </span>
          <span className="hidden rounded-full border border-white/15 bg-white/10 px-2.5 py-1 sm:inline-flex">
            Auto refresh: {Math.round(REFRESH_MS / 1000)} sec
          </span>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            <RefreshCw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid min-h-[calc(100%-4rem)] min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-2 xl:h-[calc(100%-4rem)] xl:min-h-0 xl:overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/55 p-2 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 1</p>
              <h2 className="truncate text-base font-bold text-slate-950">Incoming Calls</h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              <TinyMetricPill label="Total" value={incomingToday.total} tone="blue" />
              <TinyMetricPill label="Answered" value={incomingToday.answered} tone="green" />
              <TinyMetricPill label="Missed" value={incomingToday.missed} tone="amber" />
              <TinyMetricPill label="Unique" value={incomingToday.unique} />
              <TinyMetricPill label="Waiting" value={totalIncomingWaiting} />
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(4.8rem,1fr))] gap-1.5">
            {languageRows.map((row) => (
              <MetricCard
                key={row.language}
                title={`${row.language} Queue`}
                value={row.waiting}
                icon={<PhoneCall className="h-5 w-5" />}
                tone={row.waiting > 0 ? "amber" : "slate"}
              />
            ))}
          </div>

          <div className="mt-1.5 grid grid-cols-[repeat(auto-fit,minmax(5.6rem,1fr))] gap-1.5">
            <MetricCard
              title="Agents in Live Call"
              value={agentGroups.incomingLive.length}
              icon={<Activity className="h-5 w-5" />}
              tone="blue"
            />
            <MetricCard
              title="Agents in Idle"
              value={agentGroups.incomingIdle.length}
              icon={<Users className="h-5 w-5" />}
              tone="green"
            />
            <MetricCard
              title="Agents on Break"
              value={agentGroups.incomingBreak.length}
              icon={<Coffee className="h-5 w-5" />}
              tone="amber"
              subtitle="On Break, Lunch Break, Restroom Break"
            />
          </div>

          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-1.5">
            <AgentList title="Incoming Live Call" agents={agentGroups.incomingLive} emptyLabel="No incoming agents are on live call." />
            <AgentList title="Incoming Idle" agents={agentGroups.incomingIdle} emptyLabel="No incoming idle agents right now." />
            <AgentList title="Incoming Break" agents={agentGroups.incomingBreak} emptyLabel="No incoming agents are on break." />
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/55 p-2 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 2</p>
              <h2 className="truncate text-base font-bold text-slate-950">Outgoing</h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              <TinyMetricPill label="Total" value={outgoingToday.total} tone="blue" />
              <TinyMetricPill label="Queue" value={outgoingToday.queue} tone="blue" />
              <TinyMetricPill label="Dialed" value={outgoingToday.dialed} />
              <TinyMetricPill label="Answered" value={outgoingToday.answered} tone="green" />
              <TinyMetricPill label="Unique" value={outgoingToday.unique} />
              <TinyMetricPill label="Unique Answered" value={outgoingToday.uniqueAnswered} tone="green" />
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(5.6rem,1fr))] gap-1.5">
            <MetricCard
              title="Agents on Call"
              value={agentGroups.outboundLive.length}
              icon={<PhoneForwarded className="h-5 w-5" />}
              tone="violet"
            />
            <MetricCard
              title="Agents in Idle"
              value={agentGroups.outboundIdle.length}
              icon={<Users className="h-5 w-5" />}
              tone="green"
            />
            <MetricCard
              title="Agents on Break"
              value={agentGroups.outboundBreak.length}
              icon={<Coffee className="h-5 w-5" />}
              tone="amber"
              subtitle="On Break, Lunch Break, Restroom Break"
            />
          </div>

          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-1.5">
            <AgentList title="Outgoing Call" agents={agentGroups.outboundLive} emptyLabel="No outgoing agents are on call." />
            <AgentList title="Outgoing Idle" agents={agentGroups.outboundIdle} emptyLabel="No outgoing idle agents right now." />
            <AgentList title="Outgoing Break" agents={agentGroups.outboundBreak} emptyLabel="No outgoing agents are on break." />
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/55 p-2 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Section 3</p>
              <h2 className="truncate text-base font-bold text-slate-950">Follow-Up</h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
              <TinyMetricPill label="Total" value={followUpToday.total} tone="blue" />
              <TinyMetricPill label="Queue" value={followUpToday.queue} tone="blue" />
              <TinyMetricPill label="Dialed" value={followUpToday.dialed} />
              <TinyMetricPill label="Answered" value={followUpToday.answered} tone="green" />
              <TinyMetricPill label="Unique" value={followUpToday.unique} />
              <TinyMetricPill label="Unique Answered" value={followUpToday.uniqueAnswered} tone="green" />
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(5.6rem,1fr))] gap-1.5">
            <MetricCard
              title="Agents on Call"
              value={agentGroups.followUpLive.length}
              icon={<PhoneForwarded className="h-5 w-5" />}
              tone="violet"
            />
            <MetricCard
              title="Agents in Idle"
              value={agentGroups.followUpIdle.length}
              icon={<Users className="h-5 w-5" />}
              tone="green"
            />
            <MetricCard
              title="Agents on Break"
              value={agentGroups.followUpBreak.length}
              icon={<Coffee className="h-5 w-5" />}
              tone="amber"
              subtitle="On Break, Lunch Break, Restroom Break"
            />
          </div>

          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-1.5">
            <AgentList title="Follow-Up Call" agents={agentGroups.followUpLive} emptyLabel="No follow-up agents are on call." />
            <AgentList title="Follow-Up Idle" agents={agentGroups.followUpIdle} emptyLabel="No follow-up idle agents right now." />
            <AgentList title="Follow-Up Break" agents={agentGroups.followUpBreak} emptyLabel="No follow-up agents are on break." />
          </div>
        </section>
      </div>

      {state.error ? (
        <div className="fixed bottom-3 left-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-lg">
          {state.error}
        </div>
      ) : null}
    </div>
  );
}
