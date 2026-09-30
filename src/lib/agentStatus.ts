export type AgentBreakStatus = "on-break" | "lunch-break" | "restroom-break";
export type AgentPresenceStatus = "active" | "inactive" | AgentBreakStatus | "outbound-auto" | "follow-up" | "manual-outgoing";

const BREAK_STATUSES = new Set<AgentBreakStatus>(["on-break", "lunch-break", "restroom-break"]);

export function isBreakStatus(status?: string): status is AgentBreakStatus {
  return BREAK_STATUSES.has(String(status || "").trim().toLowerCase() as AgentBreakStatus);
}

export function normalizeBreakStatus(status?: string, fallback: AgentBreakStatus | null = null) {
  const normalized = String(status || "").trim().toLowerCase();
  return isBreakStatus(normalized) ? normalized : fallback;
}

export function getAgentStatusLabel(status?: string) {
  switch (status) {
    case "on-break":
      return "On Break";
    case "lunch-break":
      return "Lunch Break";
    case "restroom-break":
      return "Rest Break";
    case "outbound-auto":
      return "Outbound Auto Calls";
    case "follow-up":
      return "Follow-Up";
    case "manual-outgoing":
      return "Manual Dial";
    case "queue-paused":
      return "Queue Paused";
    case "on-call":
      return "On Call";
    case "online":
      return "Online";
    case "available":
      return "Available";
    case "wrap-up":
      return "Wrap-Up";
    case "inactive":
      return "Inactive";
    case "offline":
      return "Offline";
    default:
      return status === "active" ? "Incoming" : status || "Unknown";
  }
}

export function getAgentStatusBadgeClass(status?: string) {
  switch (status) {
    case "active":
    case "available":
    case "online":
      return "success-badge";
    case "outbound-auto":
      return "inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-700";
    case "on-call":
      return "live-badge";
    case "on-break":
    case "lunch-break":
    case "restroom-break":
    case "queue-paused":
    case "wrap-up":
      return "warning-badge";
    case "follow-up":
      return "inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-700";
    case "manual-outgoing":
      return "inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700";
    default:
      return "done-badge";
  }
}

export function canReceiveAutoDialAssignmentsForStatus(status?: string) {
  return status === "outbound-auto" || status === "follow-up";
}

export function canReceiveIncomingCallsForStatus(status?: string) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  return normalizedStatus === "active" || normalizedStatus === "available";
}

export function canReceiveTransferredCalls(options?: {
  status?: string;
  workMode?: string;
  sourceStatus?: string;
  activeCalls?: number | string | null;
  sipStatus?: string;
  isLoggedIn?: boolean;
  queuePaused?: boolean;
  onBreak?: boolean;
  languages?: string[];
  sourceLanguage?: string;
}) {
  const normalizedStatus = String(options?.status || "").trim().toLowerCase();
  const normalizedWorkMode = String(options?.workMode || "").trim().toLowerCase();
  const normalizedSourceStatus = String(options?.sourceStatus || "").trim().toLowerCase();
  const activeCalls = Number(options?.activeCalls || 0);
  const normalizedSipStatus = String(options?.sipStatus || "").trim().toLowerCase();
  const sourceLanguage = String(options?.sourceLanguage || "").trim().toLowerCase();

  if (Number.isFinite(activeCalls) && activeCalls > 0) {
    return false;
  }
  if (options?.isLoggedIn === false || options?.onBreak) {
    return false;
  }
  if (["offline", "on-call", "queue-paused", "on-break", "lunch-break", "restroom-break", "inactive"].includes(normalizedStatus)) {
    return false;
  }
  if (normalizedSipStatus && /unavailable|unregistered|unknown|offline/.test(normalizedSipStatus)) {
    return false;
  }
  if (normalizedSipStatus && !/not in use|available|idle|reachable|ok/.test(normalizedSipStatus)) {
    return false;
  }

  const targetMode = normalizedWorkMode || normalizedStatus;

  if (normalizedSourceStatus === "outbound-auto") {
    return targetMode === "outbound-auto";
  }

  if (normalizedSourceStatus === "follow-up") {
    return targetMode === "follow-up";
  }

  if (!(targetMode === "active" || targetMode === "incoming" || canReceiveIncomingCallsForStatus(normalizedStatus))) {
    return false;
  }
  if (options?.queuePaused) {
    return false;
  }
  if (sourceLanguage) {
    const targetLanguages = Array.isArray(options?.languages)
      ? options.languages.map((language) => String(language || "").trim().toLowerCase()).filter(Boolean)
      : [];
    if (targetLanguages.length > 0 && !targetLanguages.includes(sourceLanguage)) {
      return false;
    }
  }

  return true;
}

export function formatElapsedTimeFrom(value?: string | number | null, now = Date.now()) {
  const startedAt = typeof value === "number" ? value : new Date(value || "").getTime();
  if (!value || Number.isNaN(startedAt)) return "00:00";

  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getFollowUpDuration(startedAt?: string, persistedDuration?: string, now = Date.now()) {
  if (startedAt) return formatElapsedTimeFrom(startedAt, now);
  if (typeof persistedDuration === "string") return persistedDuration.trim() || "00:00";
  if (typeof persistedDuration === "number" && Number.isFinite(persistedDuration)) return String(persistedDuration);
  return "00:00";
}
