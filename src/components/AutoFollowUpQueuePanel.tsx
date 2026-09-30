import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Languages, PhoneCall, RefreshCw, Search } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { api, type AutoDialLeadRecord } from "@/lib/api";
import { getAutoDialLeadSourceLabel } from "@/lib/callDisplay";
import { hidePhoneDisplay, normalizePhoneNumber } from "@/lib/phone";

type LoadState = "loading" | "ready" | "retrying";
type LeadHistoryNote = {
  id: string;
  note: string;
  when: string;
  agent: string;
  status: string;
};

const formatScheduledTime = (value?: string) => {
  if (!value) return "Ready now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Ready now";
  return parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
};

const normalizeText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const getPhoneKey = (value: unknown) => normalizeText(value).replace(/\D/g, "").slice(-10);

const getHistoryTimestamp = (value: { createdAt?: string; endedAt?: string; date?: string; time?: string }) => {
  const endedAt = new Date(value.endedAt || "").getTime();
  if (Number.isFinite(endedAt)) return endedAt;
  const createdAt = new Date(value.createdAt || "").getTime();
  if (Number.isFinite(createdAt)) return createdAt;
  const combined = new Date(`${value.date || ""}T${value.time || ""}`).getTime();
  return Number.isFinite(combined) ? combined : 0;
};

const formatHistoryTime = (value: { createdAt?: string; endedAt?: string; date?: string; time?: string }) => {
  const timestamp = getHistoryTimestamp(value);
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getLocationLabel = (lead: AutoDialLeadRecord) => {
  return [normalizeText(lead.area), normalizeText(lead.state || lead.sourceState)].filter(Boolean).join(", ") || "—";
};

const getAutoFollowUpSourcePriority = (lead: AutoDialLeadRecord) => {
  if (isFollowUpLead(lead)) return 0;
  const normalized = normalizeText(lead.sourceFile).toLowerCase();
  if (normalized.includes("website")) return 1;
  if (normalized.includes("justdial")) return 2;
  return 3;
};

const getFollowUpSignalText = (lead: AutoDialLeadRecord) => [
  lead.sourceFile,
  lead.lastError,
  lead.queueExitReason,
  lead.id,
  lead.type,
].map((value) => normalizeText(value).toLowerCase()).join(" | ");

const isFollowUpLead = (lead: AutoDialLeadRecord) => {
  const normalized = getFollowUpSignalText(lead);
  return normalized.includes("missed call")
    || normalized.includes("auto follow-up")
    || normalized.includes("status follow")
    || normalized.includes("follow-up")
    || normalized.includes("rnr")
    || normalized.includes("no answer")
    || normalized.includes("did not connect")
    || normalized.includes("failed leads");
};

const getFollowUpQueueSourceLabel = (lead: AutoDialLeadRecord) => {
  const normalized = getFollowUpSignalText(lead);
  if (
    normalized.includes("missed call")
    || normalized.includes("rnr")
    || normalized.includes("no answer")
    || normalized.includes("did not connect")
  ) {
    return "Auto Follow-Up";
  }
  if (normalized.includes("status follow")) return "Status Follow-Up";
  if (normalized.includes("follow-up")) return "Follow-Up";
  return getAutoDialLeadSourceLabel(lead.sourceFile);
};

const getLeadStatusBadgeClass = (lead: AutoDialLeadRecord, options: { isLoaded: boolean; isActive: boolean }) => {
  if (options.isActive) return "success-badge";
  if (options.isLoaded) return "done-badge";
  switch (lead.status) {
    case "pending":
      return "warning-badge";
    case "assigned":
      return "done-badge";
    case "dialing":
      return "warning-badge";
    case "completed":
      return "success-badge";
    case "failed":
      return "danger-badge";
    default:
      return "done-badge";
  }
};

const getLeadStatusLabel = (lead: AutoDialLeadRecord, options: { isLoaded: boolean; isActive: boolean }) => {
  if (options.isActive) return "In Progress";
  if (options.isLoaded) return "Loaded";
  switch (lead.status) {
    case "pending":
      return "Pending";
    case "assigned":
      return "Reserved";
    case "dialing":
      return "Dialing";
    case "completed":
      return "Completed";
    case "failed":
      return lead.queueExitReason || "Closed";
    default:
      return lead.status || "Queued";
  }
};

const isLeadDueNow = (lead: AutoDialLeadRecord, now = Date.now()) => {
  const scheduledAt = lead.scheduledFor ? new Date(lead.scheduledFor).getTime() : Number.NaN;
  return !Number.isFinite(scheduledAt) || scheduledAt <= now + 1000;
};

export default function AutoFollowUpQueuePanel({ compact = false }: { compact?: boolean } = {}) {
  const { user } = useAuth();
  const {
    callPhase,
    callWrapUpPending,
    currentAutoDialLead,
    queuedAutoDialLead,
    agentStatus,
    sipRegistered,
    sipStatusReason,
    loadAutoDialLeadIntoDialer,
  } = useCallCenter();

  const [rows, setRows] = useState<AutoDialLeadRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadingLeadId, setLoadingLeadId] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [search, setSearch] = useState("");
  const [usingGlobalFallback, setUsingGlobalFallback] = useState(false);
  const [historyNotesByPhone, setHistoryNotesByPhone] = useState<Record<string, LeadHistoryNote[]>>({});
  const [freshAutoConnectEnabled, setFreshAutoConnectEnabled] = useState(false);
  const [freshAutoConnectIntervalSeconds, setFreshAutoConnectIntervalSeconds] = useState(10);
  const hasLoadedRef = useRef(false);
  const requestedHistoryPhonesRef = useRef(new Set<string>());
  const currentUserId = user?.id || "";
  const shouldUseAgentScopedQueue = user?.role === "agent" && Boolean(currentUserId);
  const queueMode = agentStatus === "outbound-auto" ? "outbound-auto" : agentStatus === "follow-up" ? "follow-up" : null;

  const loadRows = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadState(hasLoadedRef.current ? "ready" : "loading");
    }

    let usingFallback = false;
    const readyQueueOptions = queueMode ? { readyOnly: true, workMode: queueMode } : { readyOnly: true };
    let result = await api.getAutoDialLeadsSnapshot(
      shouldUseAgentScopedQueue
        ? { agentId: currentUserId, ...readyQueueOptions }
        : undefined,
    );
    if (shouldUseAgentScopedQueue && result.ok && result.data.length === 0) {
      result = await api.getAutoDialLeadsSnapshot(readyQueueOptions);
      usingFallback = result.ok;
    }
    if (result.ok) {
      hasLoadedRef.current = true;
      setUsingGlobalFallback(usingFallback);
      setRows(result.data);
      setLoadState("ready");
      setLastSync(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      return;
    }

    if (!hasLoadedRef.current) {
      setRows([]);
    }
    setUsingGlobalFallback(false);
    setLoadState("retrying");
  }, [currentUserId, queueMode, shouldUseAgentScopedQueue]);

  useEffect(() => {
    void loadRows();
    const interval = window.setInterval(() => {
      void loadRows({ silent: true });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [loadRows]);

  useEffect(() => {
    let cancelled = false;
    const loadControl = async () => {
      try {
        const control = await api.getAutoDialControl();
        if (cancelled) return;
        setFreshAutoConnectEnabled(control.enabled !== false && control.freshLeadAutoConnectEnabled !== false);
        setFreshAutoConnectIntervalSeconds(Math.max(5, Math.min(120, Number(control.freshLeadAutoConnectIntervalSeconds) || 10)));
      } catch (error) {
        console.error("Fresh lead auto-connect control load failed:", error);
      }
    };

    void loadControl();
    const interval = window.setInterval(loadControl, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const selectedLeadId = queuedAutoDialLead?.id || "";
  const activeLeadId = currentAutoDialLead?.id || "";
  const shouldMaskPhone = user?.role === "agent";
  const queueBusy = callPhase !== "idle" || callWrapUpPending;
  const isQueueModeActive = queueMode === "outbound-auto" || queueMode === "follow-up";
  const isAutoConnectActive = isQueueModeActive && freshAutoConnectEnabled;
  const panelEyebrow = queueMode === "outbound-auto" ? "Fresh Leads" : "Queue Only";
  const panelTitle = queueMode === "outbound-auto" ? "Outbound Auto Calls" : "Follow-Up Queue";
  const panelDescription = queueMode === "outbound-auto"
    ? "Load fresh Website, JustDial, Meta, and other outbound leads into the dialer, then place the call from the dialer panel."
    : isQueueModeActive
      ? "Load only due agent-created follow-up rows into the dialer, then place the call from the dialer panel."
      : "Paused while this agent is in Incoming mode. Admin must switch the agent to Follow-Up or Outbound Auto Calls to enable auto-calling.";
  const searchPlaceholder = queueMode === "outbound-auto"
    ? "Search customer, area, source, language, or grams..."
    : "Search customer, area, source, language, grams, or follow-up notes...";

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();

    return rows
      .filter((lead) => {
        const isSelected = lead.id === selectedLeadId || lead.id === activeLeadId;
        if (!isQueueModeActive) return false;
        const isLeadForMode = queueMode === "outbound-auto" ? !isFollowUpLead(lead) : isFollowUpLead(lead);
        if (!isLeadForMode && !isSelected) return false;
        const isTerminal = lead.status === "completed" || lead.status === "failed";
        if (isTerminal && !isSelected) return false;
        if (lead.status !== "assigned" && lead.status !== "dialing" && !isLeadDueNow(lead, now) && !isSelected) return false;
        if (!usingGlobalFallback && lead.scheduledAgentId && lead.scheduledAgentId !== currentUserId && !isSelected) return false;
        if (lead.assignedAgentId && lead.assignedAgentId !== currentUserId && !isSelected) return false;
        if (lead.status === "assigned" && !lead.assignedAgentId && !isSelected) return false;
        if (lead.status === "dialing" && !isSelected && lead.assignedAgentId !== currentUserId) return false;

        if (!term) return true;
        const sourceLabel = getFollowUpQueueSourceLabel(lead);
        return [
          lead.customerName,
          lead.mobileNumber,
          lead.area,
          lead.state,
          lead.sourceState,
          lead.goldWeight,
          lead.type,
          lead.language,
          lead.preferredLanguage,
          lead.status,
          sourceLabel,
          lead.lastError,
          lead.queueExitReason,
        ].some((value) => normalizeText(value).toLowerCase().includes(term));
      })
      .sort((left, right) => {
        const leftSelected = left.id === activeLeadId ? 3 : left.id === selectedLeadId ? 2 : 0;
        const rightSelected = right.id === activeLeadId ? 3 : right.id === selectedLeadId ? 2 : 0;
        if (leftSelected !== rightSelected) {
          return rightSelected - leftSelected;
        }

        const leftAssigned = left.status === "dialing" ? 2 : left.status === "assigned" ? 1 : 0;
        const rightAssigned = right.status === "dialing" ? 2 : right.status === "assigned" ? 1 : 0;
        if (leftAssigned !== rightAssigned) {
          return rightAssigned - leftAssigned;
        }

        const sourcePriorityDiff = getAutoFollowUpSourcePriority(left) - getAutoFollowUpSourcePriority(right);
        if (sourcePriorityDiff !== 0) {
          return sourcePriorityDiff;
        }

        const leftScheduledAt = left.scheduledFor ? new Date(left.scheduledFor).getTime() : 0;
        const rightScheduledAt = right.scheduledFor ? new Date(right.scheduledFor).getTime() : 0;
        if (leftScheduledAt !== rightScheduledAt) {
          return queueMode === "follow-up"
            ? rightScheduledAt - leftScheduledAt
            : leftScheduledAt - rightScheduledAt;
        }

        return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
      });
  }, [activeLeadId, currentUserId, isQueueModeActive, queueMode, rows, search, selectedLeadId, usingGlobalFallback]);

  const handleLoadLead = useCallback(async (lead: AutoDialLeadRecord) => {
    if (!isQueueModeActive) {
      return;
    }
    if (queueMode === "outbound-auto" && isFollowUpLead(lead)) {
      return;
    }
    if (queueMode === "follow-up" && !isFollowUpLead(lead)) {
      return;
    }

    setLoadingLeadId(lead.id);
    try {
      const loaded = await loadAutoDialLeadIntoDialer(lead);
      if (loaded) {
        await loadRows({ silent: true });
      }
    } finally {
      setLoadingLeadId((current) => (current === lead.id ? "" : current));
    }
  }, [isQueueModeActive, loadAutoDialLeadIntoDialer, loadRows, queueMode]);

  useEffect(() => {
    const phoneKeys = Array.from(new Set(
      visibleRows
        .slice(0, compact ? 12 : 24)
        .map((lead) => getPhoneKey(lead.mobileNumber))
        .filter((phoneKey) => phoneKey.length === 10),
    )).filter((phoneKey) => !historyNotesByPhone[phoneKey] && !requestedHistoryPhonesRef.current.has(phoneKey));

    if (phoneKeys.length === 0) return;

    phoneKeys.forEach((phoneKey) => requestedHistoryPhonesRef.current.add(phoneKey));
    let cancelled = false;

    const loadHistoryNotes = async () => {
      const entries = await Promise.all(phoneKeys.map(async (phoneKey) => {
        try {
          const history = await api.getIntakeFormHistory(phoneKey);
          const notes = history.results
            .filter((item) => normalizeText(item.notes))
            .sort((left, right) => getHistoryTimestamp(right) - getHistoryTimestamp(left))
            .slice(0, 3)
            .map((item) => ({
              id: normalizeText(item.id) || `${phoneKey}-${getHistoryTimestamp(item)}`,
              note: normalizeText(item.notes),
              when: formatHistoryTime(item),
              agent: normalizeText(item.agentName || item.agentId),
              status: normalizeText(item.callbackStatus || item.formStatus || item.status),
            }));
          return [phoneKey, notes] as const;
        } catch (error) {
          console.error("Failed to load follow-up history notes:", error);
          return [phoneKey, []] as const;
        }
      }));

      if (cancelled) return;
      setHistoryNotesByPhone((current) => {
        const next = { ...current };
        entries.forEach(([phoneKey, notes]) => {
          next[phoneKey] = notes;
        });
        return next;
      });
    };

    void loadHistoryNotes();
    return () => {
      cancelled = true;
    };
  }, [compact, historyNotesByPhone, visibleRows]);

  const statusMessage = loadState === "loading"
    ? queueMode === "outbound-auto" ? "Loading outbound auto calls..." : "Loading follow-up queue..."
    : loadState === "retrying"
      ? queueMode === "outbound-auto" ? "Retrying outbound auto calls..." : "Retrying follow-up queue..."
      : queueMode === "outbound-auto"
        ? "No fresh outbound leads are ready right now."
        : !isQueueModeActive
          ? "Auto-calling is paused while this agent is in Incoming mode."
          : "No eligible follow-up leads are ready right now.";

  return (
    <div className={compact ? "surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-3" : "surface-panel p-5"}>
      <div className={compact ? "mb-2 flex flex-wrap items-start justify-between gap-2" : "mb-4 flex flex-wrap items-start justify-between gap-3"}>
        <div className="min-w-0">
          <p className={compact ? "text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground" : "text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground"}>{panelEyebrow}</p>
          <h2 className={compact ? "text-base font-semibold" : "text-xl font-semibold"}>{panelTitle}</h2>
          <p className={compact ? "sr-only" : "mt-1 text-sm text-muted-foreground"}>
            {panelDescription}
          </p>
        </div>
        <div className={compact ? "flex min-w-0 flex-wrap items-center justify-end gap-2" : "flex items-center gap-3"}>
          {isAutoConnectActive ? (
            <span className="success-badge whitespace-nowrap text-xs">Auto Calling Enabled</span>
          ) : null}
          {lastSync ? <span className="text-xs text-muted-foreground">Last sync: {lastSync}</span> : null}
          <button type="button" className={compact ? "action-outline px-2 py-1 text-xs" : "action-outline"} onClick={() => void loadRows()} disabled={loadingLeadId !== ""}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className={compact ? "mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center" : "mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"}>
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={compact ? "control-field w-full py-2 pl-10 text-xs" : "control-field w-full pl-10"}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="done-badge whitespace-nowrap">{visibleRows.length} ready</div>
      </div>

      {!sipRegistered ? (
        <div className={compact ? "mb-2 rounded-xl border border-dashed border-border p-2 text-xs text-muted-foreground" : "mb-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"}>
          SIP is not registered. Queue rows stay visible, but Call Now is disabled until the softphone reconnects.
          <div className="mt-1 text-xs">{sipStatusReason}</div>
        </div>
      ) : null}

      <div className={compact ? "min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" : "max-h-[34rem] space-y-3 overflow-y-auto pr-1"}>
        {visibleRows.length === 0 ? (
          <div className={compact ? "rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground" : "rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"}>
            {statusMessage}
          </div>
        ) : visibleRows.map((lead) => {
          const normalizedPhone = normalizePhoneNumber(lead.mobileNumber);
          const isLoaded = lead.id === selectedLeadId;
          const isActive = lead.id === activeLeadId;
          const disabled = !isQueueModeActive || !normalizedPhone || !sipRegistered || loadingLeadId === lead.id || isLoaded || isActive || queueBusy || isAutoConnectActive;
          const buttonLabel = !isQueueModeActive
            ? "Paused in Incoming mode"
            : isAutoConnectActive
              ? "Auto Calling"
              : isActive ? "In Progress" : isLoaded ? "Loaded" : loadingLeadId === lead.id ? "Loading..." : queueBusy ? "Busy" : "Call Now";
          const sourceLabel = getFollowUpQueueSourceLabel(lead);
          const historyNotes = historyNotesByPhone[getPhoneKey(lead.mobileNumber)] || [];

          return (
            <div
              key={lead.id}
              className={isLoaded || isActive
                ? compact ? "rounded-xl border border-accent/40 bg-accent/5 p-2" : "rounded-2xl border border-accent/40 bg-accent/5 p-4"
                : compact ? "rounded-xl border border-border bg-background/40 p-2" : "rounded-2xl border border-border bg-background/40 p-4"}
            >
              <div className={compact ? "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between" : "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={compact ? "truncate text-sm font-semibold text-foreground" : "truncate text-base font-semibold text-foreground"}>{lead.customerName || "Unknown Customer"}</p>
                    <span className={getLeadStatusBadgeClass(lead, { isLoaded, isActive })}>
                      {getLeadStatusLabel(lead, { isLoaded, isActive })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shouldMaskPhone ? hidePhoneDisplay(normalizedPhone) : normalizedPhone || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className={isLoaded || isActive
                    ? compact ? "action-outline w-full justify-center px-2 py-1.5 text-xs sm:w-auto" : "action-outline w-full justify-center sm:w-auto"
                    : compact ? "action-gold w-full justify-center px-2 py-1.5 text-xs sm:w-auto" : "action-gold w-full justify-center sm:w-auto"}
                  disabled={disabled}
                  onClick={() => void handleLoadLead(lead)}
                >
                  <PhoneCall className="h-4 w-4" />
                  {buttonLabel}
                </button>
              </div>

              <div className={compact ? "mt-2 grid gap-2 text-xs sm:grid-cols-2" : "mt-4 grid gap-3 text-sm sm:grid-cols-2"}>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Grams</p>
                  <p className="font-medium text-foreground">{normalizeText(lead.goldWeight) || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">State / Area</p>
                  <p className="font-medium text-foreground">{getLocationLabel(lead)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Source</p>
                  <p className="font-medium text-foreground">{sourceLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Scheduled Time</p>
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    {formatScheduledTime(lead.scheduledFor)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Language</p>
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Languages className="h-4 w-4 text-muted-foreground" />
                    {normalizeText(lead.preferredLanguage || lead.language) || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Lead Type</p>
                  <p className="font-medium text-foreground">{normalizeText(lead.type) || "—"}</p>
                </div>
              </div>

              {historyNotes.length > 0 ? (
                <div className={compact ? "mt-2 rounded-lg border border-amber-300/40 bg-amber-50/60 p-2 text-xs dark:bg-amber-950/10" : "mt-4 rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/10"}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Previous Notes</p>
                  <div className="mt-1.5 space-y-1.5">
                    {historyNotes.map((historyNote) => (
                      <div key={historyNote.id} className="min-w-0">
                        <p className="line-clamp-2 font-medium text-foreground">{historyNote.note}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {[historyNote.when, historyNote.agent, historyNote.status].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
