import { api, type AdminBroadcastExpiry, type AdminBroadcastRecipientScope, type AgentRecord, type AgentSessionRecord, type BranchUpsertPayload, type BreakLogRecord, type ConversionApiRecord, type CustomerDataDashboardRecord, type LiveWaitingQueueSnapshot, type RealBranchRecord, type SmsLogRecord, type SmsLogStatusFilter, type SmsLogSummary } from "@/lib/api";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Clock, Coffee, Coins, Download, ExternalLink, History, Languages, LogOut, MessageSquare, PhoneCall, PhoneMissed, Save, ShieldCheck, Users, Plus, RefreshCw, TrendingUp, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { clearRealBranchesCache, useRealBranches } from "@/hooks/useRealBranches";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { useCustomerDataDashboard } from "@/hooks/useCustomerDataDashboard";
import { useCallCenter } from "@/contexts/CallCenterContext";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/contexts/AuthContext";
import { allLanguages, allShifts, type Agent, type CallRecord } from "@/data/mockData";
import { getAgentStatusBadgeClass, getAgentStatusLabel, getFollowUpDuration } from "@/lib/agentStatus";
import {
  formatSessionDuration,
  formatSessionEventTime,
  getActiveSessionDurationSeconds,
  getBreakDurationSecondsForSession,
  parseDurationToSeconds,
} from "@/lib/agentSession";
import { downloadCsv } from "@/lib/csv";
import { normalizePhoneNumber } from "@/lib/phone";
import { BUSINESS_TIME_ZONE, getBusinessDateString, normalizeBusinessDateValue } from "@/lib/businessDate";
import { getBranchLocationUrl } from "@/lib/branchLocation";
import { getCallCategory, getDispositionCategory } from "@/lib/dispositions";
import {
  AGENT_SHIFT_DURATION_MS,
  buildAgentShiftTrackerRows,
  buildAgentShiftTrackerSummaries,
  formatWorkedDuration,
  type AgentShiftTrackerRow,
  type AgentShiftTrackerStatus,
  type AgentShiftTrackerSummary,
} from "@/lib/agentShiftTracker";
import AutoDialTab from "@/components/AutoDialTab";
import BlogsLeadsTab from "@/components/BlogsLeadsTab";
import GoogleLeadsTab from "@/components/GoogleLeadsTab";
import JustDialLeadsTab from "@/components/JustDialLeadsTab";
import MetaLeadsTab from "@/components/MetaLeadsTab";
import StatusFollowUpTab from "@/components/StatusFollowUpTab";
import TablePagination from "@/components/TablePagination";
import WebsiteLeadsTab from "@/components/WebsiteLeadsTab";
import { useClientPagination } from "@/hooks/useClientPagination";
import { formatRoleLabel } from "@/lib/roles";

const ADMIN_TAB_INDEX = {
  USERS: 0,
  LANGUAGES: 1,
  BRANCHES: 2,
  SHIFTS: 3,
  RATES: 4,
  BREAK_LOGS: 5,
  INCOMING_CALL_QUEUE: 6,
  MISSED_CALLS: 7,
  AUTO_DIAL: 8,
  STATUS_FOLLOW_UP: 9,
  CUSTOMER_DATA: 10,
  JUSTDIAL_LEAD: 11,
  WEBSITE_LEAD: 12,
  META_LEAD: 13,
  SESSION_HISTORY: 14,
  GOOGLE_LEAD: 15,
  BLOG_LEAD: 16,
  SMS_LOG: 17,
} as const;

const tabs = [
  { label: "Users", path: "/admin/users", icon: <Users className="h-4 w-4" /> },
  { label: "Languages", path: "/admin/languages", icon: <Languages className="h-4 w-4" /> },
  { label: "Branches", path: "/admin/branches", icon: <Building2 className="h-4 w-4" /> },
  { label: "Shifts", path: "/admin/shifts", icon: <Clock className="h-4 w-4" /> },
  { label: "Rates", path: "/admin/rates", icon: <Coins className="h-4 w-4" /> },
  { label: "Break Logs", path: "/admin/break-logs", icon: <Coffee className="h-4 w-4" /> },
  { label: "Incoming Call Queue", path: "/admin/incoming-call-queue", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "Missed Calls", path: "/admin/missed-calls", icon: <PhoneMissed className="h-4 w-4" /> },
  { label: "Auto Dial", path: "/admin/auto-dial", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "Status Follow-Up", path: "/admin/status-follow-ups", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "Customer Data", path: "/admin/customer-data", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "JustDial Lead", path: "/admin/justdial-leads", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "Website Lead", path: "/admin/website-leads", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "Meta Leads", path: "/admin/meta-leads", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "Session History", path: "/admin/session-history", icon: <History className="h-4 w-4" /> },
  { label: "Google Leads", path: "/admin/google-leads", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "Blogs", path: "/admin/blog-leads", icon: <TrendingUp className="h-4 w-4" /> },
  { label: "SMS Logs", path: "/admin/sms-log", icon: <MessageSquare className="h-4 w-4" /> },
];

const SEO_VISIBLE_TAB_INDEXES = new Set<number>([
  ADMIN_TAB_INDEX.JUSTDIAL_LEAD,
  ADMIN_TAB_INDEX.WEBSITE_LEAD,
  ADMIN_TAB_INDEX.GOOGLE_LEAD,
  ADMIN_TAB_INDEX.META_LEAD,
  ADMIN_TAB_INDEX.BLOG_LEAD,
]);





const IVR_LANGUAGES = ["Kannada", "Tamil", "Telugu", "Hindi", "English"];

type SetAgentsState = Dispatch<SetStateAction<Agent[]>>;
type EditableAgentRecord = AgentRecord;
type AgentAccessKey = "incomingAccess" | "outgoingAccess" | "followUpAccess";
type AgentAccessOption = {
  id: string;
  key: AgentAccessKey;
  label: string;
  status: NonNullable<EditableAgentRecord["status"]>;
};
type EditableBranchState = Partial<BranchUpsertPayload>;
type NewAgentState = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  extension: string;
  password: string;
};
type NewBranchState = {
  branchId: string;
  branchName: string;
  addressline: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  timings: string;
  url: string;
  mapUrl: string;
  bitlyUrl: string;
};

const getEmptyBranchState = (): NewBranchState => ({
  branchId: "",
  branchName: "",
  addressline: "",
  area: "",
  city: "",
  state: "",
  pincode: "",
  timings: "9:30 AM - 6:00 PM",
  url: "",
  mapUrl: "",
  bitlyUrl: "",
});

const AGENT_ACCESS_OPTIONS: AgentAccessOption[] = [
  { id: "incoming", key: "incomingAccess", label: "Incoming", status: "active" },
  { id: "outgoing-auto", key: "outgoingAccess", label: "Outgoing", status: "outbound-auto" },
  { id: "manual-dial", key: "outgoingAccess", label: "Manual Dial", status: "manual-outgoing" },
  { id: "follow-up", key: "followUpAccess", label: "Follow-Up", status: "follow-up" },
];
const USER_ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "agent", label: "Agent" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Master Admin" },
  { value: "qc", label: "QC" },
  { value: "seo", label: "SEO" },
];

function isAgentUserRecord(agent: Pick<EditableAgentRecord, "role">) {
  return agent.role === "agent";
}

function getUserManagementStatusLabel(agent: EditableAgentRecord) {
  if (!isAgentUserRecord(agent)) {
    return agent.isLoggedIn ? "Online" : "Offline";
  }
  if (agent.isLoggedIn === false) return "Offline";
  return getAgentStatusLabel(agent.status);
}

function getUserManagementStatusBadgeClass(agent: EditableAgentRecord) {
  if (!isAgentUserRecord(agent)) {
    return agent.isLoggedIn ? getAgentStatusBadgeClass("online") : getAgentStatusBadgeClass("offline");
  }
  if (agent.isLoggedIn === false) return getAgentStatusBadgeClass("offline");
  return getAgentStatusBadgeClass(agent.status);
}

function hasVerifiedActiveCall(agent: EditableAgentRecord) {
  return isAgentUserRecord(agent) && Boolean(agent.activeCallId) && agent.activeCallLive === true;
}

function hasStaleActiveCall(agent: EditableAgentRecord) {
  return isAgentUserRecord(agent) && !hasVerifiedActiveCall(agent) && Boolean(agent.staleActiveCallId);
}

function formatUserIpTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

type BreakAgentSummary = {
  agentId: string;
  agentName: string;
  totalDurationSeconds: number;
  breakCount: number;
  openBreakCount: number;
  lunchBreakDurationSeconds: number;
  lunchBreakCount: number;
  restroomBreakDurationSeconds: number;
  restroomBreakCount: number;
  latestBreakAt: number;
  sessions: BreakLogRecord[];
};

type ConversionDashboardRow = ConversionApiRecord & {
  id: string;
  firstAgentName: string;
};

type SessionHistoryFocus = {
  agentId: string;
  agentName: string;
  sessionDateKey: string;
  sessionDateLabel: string;
};

type SessionAgentSummary = {
  agentId: string;
  agentName: string;
  role: AgentSessionRecord["role"];
  extension?: string;
  sessionState: AgentSessionRecord["sessionState"];
  sessionDateKey: string;
  sessionDateLabel: string;
  latestTimestamp: number;
};

type EnrichedAgentSessionRecord = AgentSessionRecord & {
  activeDuration: string;
  breakTime: string;
  activeDurationSeconds: number;
  breakTimeSeconds: number;
  sessionDuration: string;
  sessionDurationSeconds: number;
  expectedLogoutAt: string;
  expectedLogoutTime: string;
  sessionDateKey: string;
  sessionDateLabel: string;
  sortTimestamp: number;
};

function normalizeApiDate(value: string): string {
  return normalizeBusinessDateValue(value);
}

function getTodayDate() {
  return getBusinessDateString(new Date());
}

function getConversionTimestamp(date: string, time: string) {
  const normalizedDate = normalizeApiDate(date);
  if (!normalizedDate) return 0;

  const normalizedTime = (time || "").trim() || "00:00:00";
  const isoValue = `${normalizedDate}T${normalizedTime}`;
  const parsed = new Date(isoValue);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function normalizeConversionText(value: string) {
  return value.trim().toLowerCase();
}

function compareConversionRows(left: Pick<ConversionDashboardRow, "billId" | "date" | "time" | "customerName" | "contact" | "branch" | "status" | "type" | "grossW" | "netW" | "walkinType" | "firstAgentName" | "dispositionCategory">, right: Pick<ConversionDashboardRow, "billId" | "date" | "time" | "customerName" | "contact" | "branch" | "status" | "type" | "grossW" | "netW" | "walkinType" | "firstAgentName" | "dispositionCategory">) {
  const timestampDiff = getConversionTimestamp(right.date, right.time) - getConversionTimestamp(left.date, left.time);
  if (timestampDiff !== 0) return timestampDiff;

  const values: Array<[string, string]> = [
    [left.contact, right.contact],
    [left.billId, right.billId],
    [left.customerName, right.customerName],
    [left.branch, right.branch],
    [left.status, right.status],
    [left.dispositionCategory || "", right.dispositionCategory || ""],
    [left.type, right.type],
    [left.grossW, right.grossW],
    [left.netW, right.netW],
    [left.walkinType, right.walkinType],
    [left.firstAgentName, right.firstAgentName],
  ];

  for (const [leftValue, rightValue] of values) {
    const compareResult = normalizeConversionText(leftValue).localeCompare(normalizeConversionText(rightValue));
    if (compareResult !== 0) return compareResult;
  }

  return 0;
}

function buildConversionRowId(row: Omit<ConversionDashboardRow, "id">) {
  return [
    normalizePhoneNumber(row.contact) || row.contact.trim(),
    normalizeConversionText(row.billId),
    normalizeApiDate(row.date) || normalizeConversionText(row.date),
    normalizeConversionText(row.time),
    normalizeConversionText(row.customerName),
    normalizeConversionText(row.branch),
    normalizeConversionText(row.status),
    normalizeConversionText(row.dispositionCategory || ""),
    normalizeConversionText(row.type),
    normalizeConversionText(row.grossW),
    normalizeConversionText(row.netW),
    normalizeConversionText(row.walkinType),
  ].join("|");
}

function getCustomerDataDispositionCategory(row: Pick<CustomerDataDashboardRecord, "status" | "dispositionCategory">) {
  return row.dispositionCategory || getCallCategory({ disposition: row.status }) || getDispositionCategory(row.status) || "";
}

function normalizeBranchKey(value: string) {
  return value.trim().toLowerCase();
}

function matchesAdminSearch(term: string, values: Array<string | undefined | null>) {
  const normalizedTerm = term.trim().toLowerCase();
  if (!normalizedTerm) return true;

  return values.some((value) => String(value || "").toLowerCase().includes(normalizedTerm));
}

function parseDurationValueToSeconds(value: string | undefined) {
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
    const [minutes = 0, seconds = 0] = timeParts;
    return (minutes * 60) + seconds;
  }

  if (timeParts.length === 3) {
    const [hours = 0, minutes = 0, seconds = 0] = timeParts;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return 0;
}

function formatDurationSeconds(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getBreakLogTimestamp(log: BreakLogRecord) {
  const startedAtTimestamp = log.startedAt ? new Date(log.startedAt).getTime() : Number.NaN;
  if (!Number.isNaN(startedAtTimestamp)) return startedAtTimestamp;
  const createdAtTimestamp = log.createdAt ? new Date(log.createdAt).getTime() : Number.NaN;
  if (!Number.isNaN(createdAtTimestamp)) return createdAtTimestamp;
  return 0;
}

function formatAdminDateTime(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;

  return parsed.toLocaleString("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatAdminSessionDateTime(value: string | undefined, savedTime: string | undefined) {
  const normalizedTime = String(savedTime || "").trim();
  const normalized = String(value || "").trim();
  if (!normalizedTime) return formatAdminDateTime(normalized);

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalizedTime;

  const dateLabel = parsed.toLocaleDateString("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  return `${dateLabel}, ${normalizedTime}`;
}

function formatBusinessClockTime(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleTimeString("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function getMissedCallDisplayTime(call: CallRecord) {
  return formatBusinessClockTime(call.endedAt || call.ringStartedAt || call.createdAt) || call.time || "—";
}

function getMissedCallOutcome(call: CallRecord) {
  const notes = String(call.notes || "").toLowerCase();
  const agentId = String(call.agentId || "").trim().toUpperCase();
  const agentName = String(call.agentName || "").toLowerCase();
  const callbackStatus = String(call.callbackStatus || "").toLowerCase();

  if (callbackStatus === "duplicate removed" || notes.includes("duplicate")) return "Duplicate Removed";
  if (notes.includes("before language selection")) return "IVR No Selection";
  if (notes.includes("false ivr abandoned suppressed")) return "Duplicate Removed";
  if (agentId === "IVR" || agentName.includes("ivr abandoned") || notes.includes("after ivr selection")) return "IVR Abandoned";
  if (notes.includes("answered") && notes.includes("suppressed")) return "Answered Elsewhere";
  if (notes.includes("customer disconnected") || notes.includes("caller disconnected")) return "Customer Disconnected";
  if (call.status === "missed") return agentId ? "Agent Missed" : "Missed";
  return String(call.status || "Missed").replace(/[_-]+/g, " ");
}

function getMissedCallDisposition(call: CallRecord) {
  return call.callbackDisposition || call.callbackStatus || call.dispositionCategory || call.formStatus || "Pending";
}

function formatStatusLabel(value: string | undefined, fallback = "—") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getMissedCallQueueStatus(call: CallRecord) {
  return call.callbackQueueStatus || call.callbackStatus || "Pending";
}

function getMissedCallbackResult(call: CallRecord) {
  const result = String(call.callbackResult || "").trim();
  if (!result) return "Not Called Yet";
  if (result.toLowerCase() === "not called yet") return "Not Called Yet";
  return formatStatusLabel(result);
}

function isOpenMissedCallbackRow(call: CallRecord) {
  const queueStatus = String(call.callbackQueueStatus || call.callbackStatus || "").trim().toLowerCase();
  const callbackResult = String(call.callbackResult || "").trim().toLowerCase();
  const terminalValues = new Set([
    "callback dialed",
    "completed",
    "duplicate removed",
    "failed",
    "closed",
    "cancelled",
  ]);

  if (terminalValues.has(queueStatus) || terminalValues.has(callbackResult)) {
    return false;
  }

  return !callbackResult || callbackResult === "not called yet" || callbackResult === "pending";
}

function getMissedCallbackAgent(call: CallRecord) {
  return call.callbackAgentName || call.callbackAgentId || "—";
}

function getMissedCallbackDisplayTime(call: CallRecord) {
  return formatBusinessClockTime(call.callbackEndedAt || call.callbackCreatedAt) || call.callbackTime || "—";
}

function isLiveQueueMemberAvailableStatus(status: string | undefined) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("unavailable") || normalized.includes("invalid") || normalized.includes("unknown")) {
    return false;
  }

  return ["not in use", "in use", "ringing", "busy", "on hold"].some((value) => normalized.includes(value));
}

function getAdminDateParts(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  const dateKey = year && month && day
    ? `${year}-${month}-${day}`
    : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;

  return {
    key: dateKey,
    label: parsed.toLocaleDateString("en-IN", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "short",
      day: "2-digit",
    }),
    timestamp: parsed.getTime(),
  };
}

function mapDirectoryAgentToAdminAgent(agent: AgentRecord, currentAgent?: Agent): Agent {
  return {
    id: agent.id,
    name: agent.name || currentAgent?.name || agent.id,
    email: agent.email || currentAgent?.email || "",
    role: (agent.role || currentAgent?.role || "agent") as Agent["role"],
    languages: Array.isArray(currentAgent?.languages)
      ? currentAgent.languages
      : Array.isArray(agent.languages)
        ? agent.languages
        : [],
    shift: String(agent.shift || currentAgent?.shift || allShifts[0]).trim() || allShifts[0],
    status: (agent.status || currentAgent?.status || "active") as Agent["status"],
    callsToday: currentAgent?.callsToday || 0,
    avgHandleTime: currentAgent?.avgHandleTime || "00:00",
    missedCalls: currentAgent?.missedCalls || 0,
    loginTime: agent.loginTime || currentAgent?.loginTime || "",
    activeDuration: agent.activeDuration || currentAgent?.activeDuration || "00:00",
    breakTime: agent.breakTime || currentAgent?.breakTime || "00:00",
    followUpStartedAt: agent.followUpStartedAt || currentAgent?.followUpStartedAt || "",
    followUpDuration: agent.followUpDuration || currentAgent?.followUpDuration || "",
    extension: agent.extension || currentAgent?.extension || "",
  } satisfies Agent;
}

function mergeAgentDirectory(current: Agent[], live: AgentRecord[]) {
  const currentById = new Map(current.map((agent) => [agent.id, agent]));
  const liveById = new Map(live.map((agent) => [agent.id, agent]));
  const ids = Array.from(new Set([
    ...current.map((agent) => agent.id),
    ...live.map((agent) => agent.id),
  ])).sort((left, right) => left.localeCompare(right));

  return ids.map((id) => {
    const currentAgent = currentById.get(id);
    const liveAgent = liveById.get(id);
    return liveAgent
      ? mapDirectoryAgentToAdminAgent(liveAgent, currentAgent)
      : currentAgent;
  }).filter((agent): agent is Agent => Boolean(agent));
}

function LanguagesTab({ agents, setAgents }: { agents: Agent[]; setAgents: SetAgentsState }) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");

  // Load languages from DB on mount
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const data = await api.getAgentLanguages();
      if (cancelled) return;

      if (data) {
        setAgents((prev) => prev.map((a) => ({
          ...a,
          languages: data[a.id] || [],
        })));
      } else {
        toast.error("Failed to load agent languages from the API");
      }

      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [setAgents]);

  const toggleLang = (agentId: string, lang: string) => {
    setAgents((prev) => prev.map((a) => {
      if (a.id !== agentId) return a;
      const has = a.languages.includes(lang);
      return { ...a, languages: has ? a.languages.filter((l) => l !== lang) : [...a.languages, lang] };
    }));
  };

  const saveLangs = async (agent: Agent) => {
    setSaving(agent.id);
    const saved = await api.saveAgentLanguages(agent.id, agent.languages);
    if (!saved) {
      toast.error(`Failed to save languages for ${agent.name}`);
      setSaving(null);
      return;
    }
    toast.success(`${agent.name} languages saved`);
    setSaving(null);
    setOpenDropdown(null);
  };

  const saveAll = async () => {
    const agentOnly = agents.filter(a => a.role === "agent");
    let failed = 0;
    for (const agent of agentOnly) {
      const saved = await api.saveAgentLanguages(agent.id, agent.languages);
      if (!saved) {
        failed += 1;
      }
    }
    if (failed > 0) {
      toast.error(`Failed to save ${failed} agent language assignment${failed === 1 ? "" : "s"}`);
      return;
    }
    toast.success("All agent languages saved to database");
  };

  const filteredAgents = useMemo(() => (
    agents.filter((agent) => {
      if (agent.role !== "agent") return false;
      if (!matchesAdminSearch(search, [agent.id, agent.name, agent.extension])) return false;
      if (languageFilter === "assigned") return agent.languages.length > 0;
      if (languageFilter === "unassigned") return agent.languages.length === 0;
      if (languageFilter !== "all") return agent.languages.includes(languageFilter);
      return true;
    })
  ), [agents, languageFilter, search]);
  const languagePager = useClientPagination(filteredAgents, { resetKey: `${search}|${languageFilter}` });

  const exportLanguagesCsv = useCallback(() => {
    if (filteredAgents.length === 0) {
      toast.error("No language rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-languages-${languageFilter || "all"}.csv`,
      ["Agent ID", "Agent", "Extension", "Assigned Languages"],
      filteredAgents.map((agent) => [
        agent.id,
        agent.name,
        agent.extension || "",
        agent.languages.join(", "),
      ]),
    );
    toast.success("Languages exported as CSV");
  }, [filteredAgents, languageFilter]);

  if (!loaded) return <div className="surface-panel p-8 text-center text-muted-foreground">Loading languages from database...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="control-field min-w-[240px]"
            placeholder="Search by agent, ID, or extension..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="control-field min-w-[200px]" value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)}>
            <option value="all">All language sets</option>
            <option value="assigned">Has language</option>
            <option value="unassigned">No language</option>
            {IVR_LANGUAGES.map((language) => (
              <option key={language} value={language}>{language}</option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">{filteredAgents.length} of {agents.filter((agent) => agent.role === "agent").length} agents</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportLanguagesCsv} className="action-outline" disabled={filteredAgents.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button onClick={saveAll} className="action-gold"><Save className="h-4 w-4" />Save All</button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Only IVR languages: Kannada, Tamil, Telugu, Hindi, English</p>
      <div className="surface-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-28">ID</th>
              <th className="px-4 py-3 w-36">Agent</th>
              <th className="px-4 py-3 w-24">Ext</th>
              <th className="px-4 py-3">Assigned Languages</th>
              <th className="px-4 py-3 w-44">Select</th>
              <th className="px-4 py-3 w-24">Action</th>
            </tr>
          </thead>
          <tbody>
            {languagePager.pageItems.map(agent => (
              <tr key={agent.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-accent">{agent.id}</td>
                <td className="px-4 py-3 font-medium">{agent.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{agent.extension || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {agent.languages.length > 0 ? agent.languages.map((l) => (
                      <span key={l} className="success-badge text-xs">{l}</span>
                    )) : <span className="text-muted-foreground text-xs italic">No languages assigned</span>}
                  </div>
                </td>
                <td className="px-4 py-3 relative">
                  <button onClick={() => setOpenDropdown(openDropdown === agent.id ? null : agent.id)} className="action-outline text-xs w-full justify-center">
                    {openDropdown === agent.id ? "Close" : "Select Languages"}
                  </button>
                  {openDropdown === agent.id && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-card p-3 shadow-2xl">
                      <p className="mb-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">IVR Languages</p>
                      {IVR_LANGUAGES.map(lang => (
                        <label key={lang} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60 cursor-pointer transition">
                          <input type="checkbox" checked={agent.languages.includes(lang)} onChange={() => toggleLang(agent.id, lang)}
                            className="h-4 w-4 rounded border-border" />
                          <span className="text-sm font-medium">{lang}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => saveLangs(agent)} disabled={saving === agent.id}
                    className="action-gold text-xs w-full justify-center">
                    {saving === agent.id ? "..." : "Save"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredAgents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No agents found for the selected search/filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={languagePager.page}
        totalPages={languagePager.totalPages}
        totalItems={languagePager.totalItems}
        pageSize={languagePager.pageSize}
        onPageChange={languagePager.setPage}
        disabled={Boolean(saving)}
      />
    </div>
  );
}





function AgentManagementTab({ onAgentsChanged }: { onAgentsChanged?: () => void }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState<EditableAgentRecord[]>([]);
  const [sessions, setSessions] = useState<AgentSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Pick<EditableAgentRecord, "name" | "email" | "role">>({ name: "", email: "", role: "agent" });
  const [pwId, setPwId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState<NewAgentState>({ id: "", name: "", email: "", role: "agent", extension: "", password: "" });
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | EditableAgentRecord["role"]>("all");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastScope, setBroadcastScope] = useState<AdminBroadcastRecipientScope>("all");
  const [broadcastExpiry, setBroadcastExpiry] = useState<AdminBroadcastExpiry>("until-cleared");
  const [activeBroadcast, setActiveBroadcast] = useState<Awaited<ReturnType<typeof api.getAdminBroadcast>>["broadcast"]>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<Awaited<ReturnType<typeof api.getAdminBroadcastHistory>>>([]);
  const [broadcastSaving, setBroadcastSaving] = useState(false);
  const [trackerSearch, setTrackerSearch] = useState("");
  const [trackerStatusFilter, setTrackerStatusFilter] = useState<"all" | AgentShiftTrackerStatus>("all");
  const [sessionNow, setSessionNow] = useState(() => Date.now());

  const loadAgents = useCallback(async () => {
    try {
      const [agentResult, sessionData] = await Promise.all([
        api.getAgentsSnapshot(),
        api.getAgentSessions({ limit: 250 }),
      ]);
      const [broadcastResult, broadcastHistoryResult] = await Promise.all([
        api.getAdminBroadcast(),
        api.getAdminBroadcastHistory(20),
      ]);

      if (agentResult.ok) {
        setAgents(agentResult.data);
      }
      if (Array.isArray(sessionData)) {
        setSessions(sessionData);
      }
      setActiveBroadcast(broadcastResult.active ? broadcastResult.broadcast || null : null);
      setBroadcastHistory(Array.isArray(broadcastHistoryResult) ? broadcastHistoryResult : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
    const interval = window.setInterval(loadAgents, 30000);
    return () => window.clearInterval(interval);
  }, [loadAgents]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSessionNow(Date.now());
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const filtered = agents.filter((agent) => (
    matchesAdminSearch(filter, [
      agent.id,
      agent.name,
      agent.email,
      agent.role,
      agent.extension,
      agent.loginTime,
      agent.logoutTime,
    ]) &&
    (roleFilter === "all" || agent.role === roleFilter)
  ));
  const agentPager = useClientPagination(filtered, { resetKey: `${filter}|${roleFilter}` });
  const shiftTrackerRows = useMemo<AgentShiftTrackerRow[]>(
    () => buildAgentShiftTrackerRows(agents, sessions, { now: sessionNow }),
    [agents, sessionNow, sessions],
  );
  const filteredShiftTrackerRows = useMemo(() => (
    shiftTrackerRows.filter((row) => (
      matchesAdminSearch(trackerSearch, [
        row.agentId,
        row.agentName,
        row.employeeId,
        row.loginDate,
        row.loginTime,
        row.expectedLogoutTime,
        row.actualLogoutTime,
        row.workingStatusLabel,
        row.remarksTitle,
      ]) &&
      (trackerStatusFilter === "all" || row.workingStatus === trackerStatusFilter)
    ))
  ), [shiftTrackerRows, trackerSearch, trackerStatusFilter]);
  const shiftTrackerSummaries = useMemo<AgentShiftTrackerSummary[]>(
    () => buildAgentShiftTrackerSummaries(filteredShiftTrackerRows),
    [filteredShiftTrackerRows],
  );
  const shiftTrackerSummaryPager = useClientPagination(shiftTrackerSummaries, { resetKey: `${trackerSearch}|${trackerStatusFilter}|summary` });
  const shiftTrackerPager = useClientPagination(filteredShiftTrackerRows, { resetKey: `${trackerSearch}|${trackerStatusFilter}|sessions` });
  const shiftTrackerCounts = useMemo(() => (
    shiftTrackerRows.reduce((summary, row) => {
      summary[row.workingStatus] += 1;
      return summary;
    }, {
      "logged-in": 0,
      "logged-out": 0,
      overtime: 0,
      "pending-logout": 0,
    } satisfies Record<AgentShiftTrackerStatus, number>)
  ), [shiftTrackerRows]);

  const exportAgentsCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("No user rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-users-${roleFilter}.csv`,
      [
        "Agent ID",
        "Name",
        "Email",
        "Role",
        "Extension",
        "Status",
        "Last Seen",
        "Incoming Access",
        "Outgoing Access",
        "Follow-Up Access",
      ],
      filtered.map((agent) => {
        return [
          agent.id,
          agent.name,
          agent.email,
	          agent.role,
	          agent.extension || "",
		          getUserManagementStatusLabel(agent),
		          formatUserIpTimestamp(agent.workstationIpLastSeenAt || agent.lastLoginAt),
		          isAgentUserRecord(agent) ? (agent.incomingAccess !== false ? "Yes" : "No") : "—",
	          isAgentUserRecord(agent) ? (agent.outgoingAccess !== false ? "Yes" : "No") : "—",
	          isAgentUserRecord(agent) ? (agent.followUpAccess !== false ? "Yes" : "No") : "—",
        ];
      }),
    );
    toast.success("Users exported as CSV");
  }, [filtered, roleFilter]);

  const handleSaveEdit = async () => {
    if (!editId) return;
    await api.updateAgent(editId, editData);
    toast.success(editId + " updated"); setEditId(null); loadAgents(); onAgentsChanged?.();
  };

  const handleChangePw = async () => {
    if (!pwId || newPw.length < 6) { toast.error("Min 6 characters"); return; }
    const result = await api.changeAgentPassword(pwId, newPw);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Password changed");
    setPwId(null);
    setNewPw("");
    loadAgents();
    onAgentsChanged?.();
  };

  const handleSendBroadcast = async () => {
    const message = broadcastMessage.trim();
    if (!message) {
      toast.error("Enter a message for the selected agents");
      return;
    }
    setBroadcastSaving(true);
    const result = await api.sendAdminBroadcast({
      message,
      recipientScope: broadcastScope,
      expiry: broadcastExpiry,
      sentById: user?.id,
      sentByName: user?.name,
    });
    setBroadcastSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setActiveBroadcast(result.broadcast || null);
    setBroadcastHistory((current) => result.broadcast ? [result.broadcast, ...current.filter((entry) => entry.id !== result.broadcast?.id)].slice(0, 20) : current);
    setBroadcastMessage("");
    toast.success("Broadcast message sent");
    void api.triggerUiRefresh("agents", "Admin broadcast message sent");
  };

  const handleClearBroadcast = async () => {
    if (!activeBroadcast) return;
    setBroadcastSaving(true);
    const result = await api.clearAdminBroadcast({ clearedById: user?.id, clearedByName: user?.name });
    setBroadcastSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setActiveBroadcast(null);
    void api.getAdminBroadcastHistory(20).then((history) => setBroadcastHistory(Array.isArray(history) ? history : []));
    toast.success("Broadcast message cleared");
    void api.triggerUiRefresh("agents", "Admin broadcast message cleared");
  };

  const handleCreate = async () => {
    if (!createData.id || !createData.name || !createData.password) { toast.error("ID, Name, Password required"); return; }
    const r = await api.createAgent(createData);
    if (r.success) { toast.success("Agent created"); setShowCreate(false); setCreateData({ id: "", name: "", email: "", role: "agent", extension: "", password: "" }); loadAgents(); onAgentsChanged?.(); }
    else toast.error(r.error || "Failed");
  };

  const handleToggleStatus = async (a: EditableAgentRecord) => {
    await api.updateAgent(a.id, { status: a.status === "active" ? "inactive" : "active" });
    toast.success(a.id + " status changed"); loadAgents(); onAgentsChanged?.();
  };

  const handleSetAgentMode = async (agent: EditableAgentRecord, option: AgentAccessOption) => {
    if (agent.role !== "agent") return;
    const accessKey = option.key;
    const followUpStartedAt = option.status === "follow-up" ? new Date().toISOString() : "";
    const patch: Partial<EditableAgentRecord> = {
      status: option.status,
      incomingAccess: accessKey === "incomingAccess",
      outgoingAccess: accessKey === "outgoingAccess",
      followUpAccess: accessKey === "followUpAccess",
      followUpStartedAt,
      followUpDuration: option.status === "follow-up" ? "00:00" : "",
    };
    setAgents((current) => current.map((entry) => (
      entry.id === agent.id ? { ...entry, ...patch } : entry
    )));
    const result = await api.updateAgent(agent.id, patch);
    if (result?.error) {
      toast.error(result.error);
      void loadAgents();
      return;
    }
    void api.triggerUiRefresh("agents", `Agent ${agent.id} mode changed to ${option.label}`);
    toast.success(`${agent.id} changed to ${option.label}`);
    void loadAgents();
    onAgentsChanged?.();
  };

  const handleResetCallState = async (agent: EditableAgentRecord) => {
    const result = await api.resetAgentCallState(agent.id, {
      nextStatus: agent.status === "inactive" ? "inactive" : "active",
      finalCallStatus: "failed",
      reason: "Reset from admin panel",
      forceHangup: true,
    });
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Call state reset for ${agent.name}`);
    loadAgents();
    onAgentsChanged?.();
  };

  const handleForceLogoutAgent = async (agent: EditableAgentRecord) => {
    if (agent.role !== "agent") return;

    const logoutTimestamp = new Date().toISOString();
    const logoutTime = formatSessionEventTime(logoutTimestamp);

    if (agent.activeCallId) {
      const resetResult = await api.resetAgentCallState(agent.id, {
        nextStatus: agent.status === "inactive" ? "inactive" : "active",
        finalCallStatus: "failed",
        reason: "Force logout from admin user management",
        forceHangup: true,
      });
      if (resetResult?.error) {
        toast.error(resetResult.error);
        return;
      }
    }

    setAgents((current) => current.map((entry) => (
      entry.id === agent.id
        ? {
            ...entry,
            isLoggedIn: false,
            logoutTime,
            lastLogoutAt: logoutTimestamp,
            activeCallId: "",
            activeCallDirection: "",
            activeCallStartedAt: "",
          }
        : entry
    )));

    const result = await api.updateAgent(agent.id, {
      isLoggedIn: false,
      logoutTime,
      lastLogoutAt: logoutTimestamp,
      activeCallId: "",
      activeCallDirection: "",
      activeCallStartedAt: "",
    });
    if (result?.error) {
      toast.error(result.error);
      void loadAgents();
      return;
    }

    void api.triggerUiRefresh("all", `Agent ${agent.id} logged out by admin`);
    toast.success(`${agent.id} logged out`);
    void loadAgents();
    onAgentsChanged?.();
  };

  if (loading) return <div className="surface-panel p-8 text-center text-muted-foreground">Loading agents from database...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input className="control-field min-w-[240px]" placeholder="Search by name, ID, email, or extension..." value={filter} onChange={e => setFilter(e.target.value)} />
          <select className="control-field min-w-[150px]" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | EditableAgentRecord["role"])}>
            <option value="all">All roles</option>
            {USER_ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportAgentsCsv} className="action-outline" disabled={filtered.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className="action-gold"><Plus className="h-4 w-4" />{showCreate ? "Cancel" : "Create Agent"}</button>
        </div>
      </div>
      {showCreate && (
        <div className="surface-panel p-5 grid gap-3 md:grid-cols-3">
          <input className="control-field" placeholder="Agent ID (e.g. AG031)" value={createData.id} onChange={e => setCreateData(p => ({...p, id: e.target.value}))} />
          <input className="control-field" placeholder="Full Name" value={createData.name} onChange={e => setCreateData(p => ({...p, name: e.target.value}))} />
          <input className="control-field" placeholder="Email" value={createData.email} onChange={e => setCreateData(p => ({...p, email: e.target.value}))} />
          <select className="control-field" value={createData.role} onChange={e => setCreateData(p => ({...p, role: e.target.value as NewAgentState["role"]}))}>{USER_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
          <input className="control-field" placeholder="Extension (e.g. 2031)" value={createData.extension} onChange={e => setCreateData(p => ({...p, extension: e.target.value}))} />
          <input className="control-field" placeholder="Password" type="password" value={createData.password} onChange={e => setCreateData(p => ({...p, password: e.target.value}))} />
          <button onClick={handleCreate} className="action-gold justify-center md:col-span-3"><Save className="h-4 w-4" />Create Agent</button>
        </div>
      )}
      <div className="surface-panel space-y-3 border-amber-300/70 bg-amber-50/40 p-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Broadcast Message to Agents</h3>
          <p className="mt-1 text-xs text-muted-foreground">Send one read-only Admin Message to the selected agent group. It also appears when an eligible agent opens the next intake form.</p>
        </div>
        <textarea
          className="control-field min-h-20 w-full resize-y text-sm"
          maxLength={500}
          placeholder="Type message for all agents..."
          value={broadcastMessage}
          onChange={(event) => setBroadcastMessage(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Send To:
            <select className="control-field min-w-[170px] text-sm" value={broadcastScope} onChange={(event) => setBroadcastScope(event.target.value as AdminBroadcastRecipientScope)}>
              <option value="all">All Agents</option>
              <option value="online">Online Agents</option>
              <option value="incoming">Incoming Agents</option>
              <option value="outgoing">Outgoing Agents</option>
              <option value="follow-up">Follow-Up Agents</option>
              <option value="manual-dial">Manual Dial Agents</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Expires:
            <select className="control-field min-w-[150px] text-sm" value={broadcastExpiry} onChange={(event) => setBroadcastExpiry(event.target.value as AdminBroadcastExpiry)}>
              <option value="until-cleared">Until Cleared</option>
              <option value="30-minutes">30 Minutes</option>
              <option value="1-hour">1 Hour</option>
              <option value="2-hours">2 Hours</option>
              <option value="end-of-day">End of Day</option>
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="action-outline text-xs" onClick={() => void handleClearBroadcast()} disabled={!activeBroadcast || broadcastSaving}>Clear Message</button>
            <button type="button" className="action-gold text-xs" onClick={() => void handleSendBroadcast()} disabled={broadcastSaving || !broadcastMessage.trim()}>Send Message to All</button>
          </div>
        </div>
        {activeBroadcast ? (
          <div className="rounded-lg border border-amber-300 bg-white/80 px-3 py-2 text-xs">
            <span className="font-semibold">Active broadcast:</span> {activeBroadcast.message}
            <span className="ml-2 text-muted-foreground">({activeBroadcast.recipientScope}, {activeBroadcast.expiry})</span>
          </div>
        ) : null}
        {broadcastHistory.length > 0 ? (
          <details className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Broadcast audit history ({broadcastHistory.length})</summary>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {broadcastHistory.map((entry) => (
                <div key={entry.id || `${entry.sentAt}-${entry.message}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-border/70 pt-1 first:border-t-0 first:pt-0">
                  <span className="font-medium">{entry.message}</span>
                  <span className="text-muted-foreground">{entry.recipientScope} · {entry.expiry}</span>
                  <span className={entry.active ? "text-emerald-700" : "text-muted-foreground"}>{entry.active ? "Active" : `Cleared${entry.clearedAt ? ` ${new Date(entry.clearedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}`}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <div className="surface-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
	              <th className="px-4 py-3">Role</th>
	              <th className="px-4 py-3">Ext</th>
	              <th className="px-4 py-3">Status</th>
	              <th className="px-4 py-3">Last Seen</th>
	              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agentPager.pageItems.length === 0 ? (
              <tr>
	                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No users found for the selected search/filter.</td>
              </tr>
            ) : agentPager.pageItems.map((a) => {
              return (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-accent">{a.id}</td>
                  <td className="px-4 py-3">{editId === a.id ? <input className="control-field text-sm" value={editData.name} onChange={e => setEditData(p => ({...p, name: e.target.value}))} /> : <span className="font-medium">{a.name}</span>}</td>
                  <td className="px-4 py-3">{editId === a.id ? <input className="control-field text-sm" value={editData.email} onChange={e => setEditData(p => ({...p, email: e.target.value}))} /> : a.email}</td>
                  <td className="px-4 py-3">{editId === a.id ? <select className="control-field text-sm" value={editData.role} onChange={e => setEditData(p => ({...p, role: e.target.value as EditableAgentRecord["role"]}))}>{USER_ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select> : <span className="capitalize">{formatRoleLabel(a.role)}</span>}</td>
	                  <td className="px-4 py-3 font-mono">{a.extension}</td>
		                  <td className="px-4 py-3">
	                    <div className="space-y-1">
	                      {a.role === "agent" ? (
	                        <button onClick={() => handleToggleStatus(a)} className={`${getUserManagementStatusBadgeClass(a)} cursor-pointer`}>
	                          {getUserManagementStatusLabel(a)}
	                        </button>
	                      ) : (
	                        <span className={getUserManagementStatusBadgeClass(a)}>
	                          {getUserManagementStatusLabel(a)}
	                        </span>
	                      )}
	                      {a.status === "follow-up" ? (
                        <p className="text-xs font-mono text-muted-foreground">
                          {getFollowUpDuration(a.followUpStartedAt, a.followUpDuration)}
                        </p>
	                      ) : null}
	                    </div>
	                  </td>
	                  <td className="px-4 py-3 font-mono text-xs">{formatUserIpTimestamp(a.workstationIpLastSeenAt || a.lastLoginAt) || "—"}</td>
	                  <td className="px-4 py-3">
                    {a.role === "agent" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {AGENT_ACCESS_OPTIONS.map((option) => {
                          const selected = a.status === option.status;
                          const enabled = a[option.key] !== false;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => void handleSetAgentMode(a, option)}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                                selected
                                  ? "border-amber-500 bg-amber-100 text-amber-900 shadow-sm"
                                  : enabled
                                  ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                              title={`Set ${a.id} to ${option.label}`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><div className="flex gap-1.5 flex-wrap">
                    {editId === a.id ? <button className="action-gold text-xs" onClick={handleSaveEdit}><Save className="h-3 w-3" />Save</button> : <button className="action-outline text-xs" onClick={() => { setEditId(a.id); setEditData({ name: a.name, email: a.email, role: a.role }); }}>Edit</button>}
                    {pwId === a.id ? <div className="flex gap-1"><input className="control-field text-xs w-24" type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} /><button className="action-gold text-xs" onClick={handleChangePw}>Set</button><button className="action-outline text-xs" onClick={() => setPwId(null)}>X</button></div> : <button className="action-outline text-xs" onClick={() => setPwId(a.id)}>Password</button>}
	                    {hasVerifiedActiveCall(a) ? (
	                      <button className="action-outline text-xs" onClick={() => void handleResetCallState(a)}>
	                        Reset Call
	                      </button>
	                    ) : hasStaleActiveCall(a) ? (
	                      <button className="action-outline text-xs" onClick={() => void handleResetCallState(a)}>
	                        Clear Ghost
	                      </button>
	                    ) : null}
                    {a.role === "agent" && (
                      <button
                        className="action-outline text-xs"
                        disabled={a.isLoggedIn === false}
                        onClick={() => void handleForceLogoutAgent(a)}
                        title={a.isLoggedIn === false ? "Agent is already logged out" : `Logout ${a.id}`}
                      >
                        <LogOut className="h-3 w-3" />
                        Logout
                      </button>
                    )}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={agentPager.page}
        totalPages={agentPager.totalPages}
        totalItems={agentPager.totalItems}
        pageSize={agentPager.pageSize}
        onPageChange={agentPager.setPage}
        disabled={loading}
      />
      <p className="text-sm text-muted-foreground">{filtered.length} of {agents.length} agents</p>

      <div className="space-y-4 border-t border-border/70 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Today&apos;s Agent Shift Tracker</p>
            <h2 className="mt-2 text-xl font-semibold">Today&apos;s Agent Shift Tracker</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Monitor agent login, expected logout, and actual logout timings in real time.
            </p>
          </div>
          <div className="surface-panel px-4 py-3 text-sm text-muted-foreground">
            This tracker is visible only to Admin users.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="surface-panel p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Sessions</p>
            <p className="mt-2 text-3xl font-semibold text-accent">{filteredShiftTrackerRows.length}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Logged In</p>
            <p className="mt-2 text-3xl font-semibold text-[hsl(var(--success))]">{shiftTrackerCounts["logged-in"]}</p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Logged Out</p>
            <p className="mt-2 text-3xl font-semibold text-muted-foreground">{shiftTrackerCounts["logged-out"]}</p>
          </div>
          <div className="surface-panel p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overtime</p>
                <p className="mt-2 text-2xl font-semibold text-destructive">{shiftTrackerCounts.overtime}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-[hsl(var(--warning-foreground))]">{shiftTrackerCounts["pending-logout"]}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-panel p-5">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Admin Note</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Note: Expected Logout Time is auto-calculated based on the agent&apos;s login time and a fixed 9-hour shift duration.
            </p>
          </div>
          <div className="surface-panel p-5">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Access Restriction</p>
            <p className="mt-2 text-sm text-muted-foreground">This tracker is visible only to Admin users.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[240px]"
              placeholder="Search by agent, employee ID, login date, or status..."
              value={trackerSearch}
              onChange={(event) => setTrackerSearch(event.target.value)}
            />
            <select
              className="control-field min-w-[180px]"
              value={trackerStatusFilter}
              onChange={(event) => setTrackerStatusFilter(event.target.value as "all" | AgentShiftTrackerStatus)}
            >
              <option value="all">All statuses</option>
              <option value="logged-in">Logged In</option>
              <option value="logged-out">Logged Out</option>
              <option value="overtime">Overtime</option>
              <option value="pending-logout">Pending Logout</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground">{filteredShiftTrackerRows.length} of {shiftTrackerRows.length} session records today</p>
        </div>

        <div className="surface-panel overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Daily Summary</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Agent Name</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">First Login</th>
                <th className="px-4 py-3">Last Logout</th>
                <th className="px-4 py-3">Total Sessions</th>
                <th className="px-4 py-3">Total Worked Hours</th>
              </tr>
            </thead>
            <tbody>
              {shiftTrackerSummaryPager.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {shiftTrackerRows.length === 0 ? "No login records found for today." : "No summary rows matched the current search/filter."}
                  </td>
                </tr>
              ) : shiftTrackerSummaryPager.pageItems.map((summary) => (
                <tr key={summary.key} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{summary.agentName}</td>
                  <td className="px-4 py-3 font-mono text-accent">{summary.employeeId}</td>
                  <td className="px-4 py-3 font-mono">{summary.firstLoginTime}</td>
                  <td className="px-4 py-3 font-mono">{summary.lastLogoutTime || "Still logged in"}</td>
                  <td className="px-4 py-3">{summary.totalSessions}</td>
                  <td className="px-4 py-3 font-mono">{summary.totalWorkedHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={shiftTrackerSummaryPager.page}
          totalPages={shiftTrackerSummaryPager.totalPages}
          totalItems={shiftTrackerSummaryPager.totalItems}
          pageSize={shiftTrackerSummaryPager.pageSize}
          onPageChange={shiftTrackerSummaryPager.setPage}
          disabled={loading}
        />

        <div className="surface-panel overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Session Records</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Agent Name</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Login Date</th>
                <th className="px-4 py-3">Login Time</th>
                <th className="px-4 py-3">Expected Logout Time</th>
                <th className="px-4 py-3">Actual Logout Time</th>
                <th className="px-4 py-3">Session Hours</th>
                <th className="px-4 py-3">Working Status</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {shiftTrackerPager.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    {shiftTrackerRows.length === 0 ? "No login records found for today." : "No session records matched the current search/filter."}
                  </td>
                </tr>
              ) : shiftTrackerPager.pageItems.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{row.agentName}</td>
                  <td className="px-4 py-3 font-mono text-accent">{row.employeeId}</td>
                  <td className="px-4 py-3">{row.loginDate}</td>
                  <td className="px-4 py-3 font-mono">{row.loginTime}</td>
                  <td className="px-4 py-3 font-mono">{row.expectedLogoutTime}</td>
                  <td className="px-4 py-3 font-mono">{row.actualLogoutTime || "—"}</td>
                  <td className="px-4 py-3 font-mono">{row.sessionHours}</td>
                  <td className="px-4 py-3">
                    <span className={row.workingStatusClass}>{row.workingStatusLabel}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.remarksTitle ? (
                      <div className="space-y-1">
                        <span className={row.remarksClass}>{row.remarksTitle}</span>
                        <p className="text-xs text-muted-foreground">{row.remarksText}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={shiftTrackerPager.page}
          totalPages={shiftTrackerPager.totalPages}
          totalItems={shiftTrackerPager.totalItems}
          pageSize={shiftTrackerPager.pageSize}
          onPageChange={shiftTrackerPager.setPage}
          disabled={loading}
        />
        <p className="text-sm text-muted-foreground">
          {filteredShiftTrackerRows.length} session records across {shiftTrackerSummaries.length} agent summaries for today
        </p>
      </div>
    </div>
  );
}

function IncomingCallQueueTab({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<LiveWaitingQueueSnapshot>({ generatedAt: "", totalWaiting: 0, queues: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadRows = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);

    try {
      const nextSnapshot = await api.getLiveWaitingQueueSnapshot();
      if (nextSnapshot.ok) {
        setSnapshot(nextSnapshot.data);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    void loadRows();
    const interval = window.setInterval(() => {
      void loadRows({ silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [active, loadRows]);

  const filteredQueues = useMemo(() => (
    snapshot.queues.filter((queue) => matchesAdminSearch(search, [
      queue.queueName,
      queue.language,
      ...queue.callers.map((caller) => `${caller.customerNumber} ${caller.channel} ${caller.waitTime} ${caller.priority}`),
    ]))
  ), [search, snapshot.queues]);
  const waitingCallerRows = useMemo(() => (
    filteredQueues.flatMap((queue) => queue.callers.map((caller) => ({
      queueName: queue.queueName,
      language: queue.language,
      ...caller,
    })))
  ), [filteredQueues]);
  const incomingQueuePager = useClientPagination(waitingCallerRows, { resetKey: search });

  const exportIncomingQueueCsv = useCallback(() => {
    if (waitingCallerRows.length === 0) {
      toast.error("No live queue rows to export");
      return;
    }

    downloadCsv(
      `attica-live-waiting-queue-${getTodayDate()}.csv`,
      ["Queue", "Language", "Cx Number", "Position", "Channel", "Wait Time", "Priority"],
      waitingCallerRows.map((row) => [
        row.queueName || "",
        row.language || "",
        row.customerNumber || "",
        String(row.position || ""),
        row.channel || "",
        row.waitTime || "",
        row.priority || "",
      ]),
    );
    toast.success("Live waiting queue exported as CSV");
  }, [waitingCallerRows]);

  if (loading) {
    return <div className="surface-panel p-8 text-center text-muted-foreground">Loading live waiting queue...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="surface-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[260px]"
              placeholder="Search by queue, language, cx number, channel, or wait time..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {snapshot.generatedAt ? (
              <span className="text-xs text-muted-foreground">Last sync: {formatAdminDateTime(snapshot.generatedAt)}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">Waiting now: {snapshot.totalWaiting}</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="action-outline" onClick={exportIncomingQueueCsv} disabled={waitingCallerRows.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button className="action-gold" onClick={() => void loadRows()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Shows the live Asterisk waiting queue. If callers waiting is `0`, there are currently no inbound callers holding in the PBX queue.
        </p>
      </div>

      <div className="surface-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Queue</th>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Cx Number</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Wait Time</th>
              <th className="px-4 py-3">Priority</th>
            </tr>
          </thead>
          <tbody>
            {incomingQueuePager.pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {snapshot.totalWaiting === 0 ? "No callers are waiting in the live queue right now." : "No live waiting callers matched the current search."}
                </td>
              </tr>
            ) : incomingQueuePager.pageItems.map((row) => (
              <tr key={`${row.queueName}:${row.position}:${row.channel}`} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-accent">{row.queueName || "—"}</td>
                <td className="px-4 py-3 font-medium">{row.language || "—"}</td>
                <td className="px-4 py-3 font-mono">{row.customerNumber || "—"}</td>
                <td className="px-4 py-3">{row.position || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{row.channel || "—"}</td>
                <td className="px-4 py-3 font-mono">{row.waitTime || "—"}</td>
                <td className="px-4 py-3">{row.priority || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={incomingQueuePager.page}
        totalPages={incomingQueuePager.totalPages}
        totalItems={incomingQueuePager.totalItems}
        pageSize={incomingQueuePager.pageSize}
        onPageChange={incomingQueuePager.setPage}
        disabled={loading}
      />
    </div>
  );
}

function MissedCallsTab({ active }: { active: boolean }) {
  const [rows, setRows] = useState<CallRecord[]>([]);
  const [date, setDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [search, setSearch] = useState("");

  const loadRows = useCallback(async (options?: { silent?: boolean; dateOverride?: string }) => {
    const silent = options?.silent ?? false;
    const targetDate = options?.dateOverride || date || getTodayDate();
    if (!silent) setLoading(true);

    try {
      const result = await api.getTodayMissedCalls(targetDate);
      setRows(result.rows);
      setDate(result.date || targetDate);
      setLastSync(new Date().toLocaleTimeString("en-IN", {
        timeZone: BUSINESS_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }));
    } catch (error) {
      console.error("Missed calls load failed:", error);
      if (!silent) toast.error("Missed calls failed to load");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (!active) return;

    void loadRows();
    const refreshInterval = window.setInterval(() => {
      void loadRows({ silent: true });
    }, 30000);

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, [active, loadRows]);

  const filteredRows = useMemo(() => (
    rows.filter((call) => {
      const displayTime = getMissedCallDisplayTime(call);
      const outcome = getMissedCallOutcome(call);
      const disposition = getMissedCallDisposition(call);
      const queueStatus = getMissedCallQueueStatus(call);
      const callbackResult = getMissedCallbackResult(call);
      const callbackAgent = getMissedCallbackAgent(call);
      const callbackTime = getMissedCallbackDisplayTime(call);
      return matchesAdminSearch(search, [
        call.id,
        call.callerId,
        call.callerName,
        call.customerName,
        call.displayCustomerName,
        call.agentId,
        call.agentName,
        call.language,
        call.branch,
        call.status,
        outcome,
        disposition,
        queueStatus,
        callbackResult,
        callbackAgent,
        callbackTime,
        call.callbackCallId,
        call.callbackStatus,
        call.notes,
        call.time,
        displayTime,
      ]);
    })
  ), [rows, search]);
  const openMissedRows = useMemo(() => rows.filter(isOpenMissedCallbackRow), [rows]);
  const missedCallsPager = useClientPagination(filteredRows, { resetKey: `${date}|${search}|${rows.length}` });
  const selectedDate = date || getTodayDate();
  const isToday = selectedDate === getTodayDate();

  const exportMissedCallsCsv = useCallback(() => {
    if (filteredRows.length === 0) {
      toast.error("No missed call rows to export");
      return;
    }

    downloadCsv(
      `attica-missed-calls-${date || getTodayDate()}.csv`,
      [
        "Call ID",
        "Customer",
        "Number",
        "Missed Agent",
        "Missed Agent ID",
        "Language",
        "Branch",
        "Missed Time",
        "Call Outcome",
        "Queue Status",
        "Callback Result",
        "Disposition",
        "Callback Agent",
        "Callback Time",
        "Callback Call ID",
        "Notes",
      ],
      filteredRows.map((call) => [
        call.id || "",
        call.displayCustomerName || call.customerName || call.callerName || "N/A",
        call.callerId || "",
        call.agentName || "",
        call.agentId || "",
        call.language || "",
        call.branch || "",
        getMissedCallDisplayTime(call),
        getMissedCallOutcome(call),
        getMissedCallQueueStatus(call),
        getMissedCallbackResult(call),
        getMissedCallDisposition(call),
        getMissedCallbackAgent(call),
        getMissedCallbackDisplayTime(call),
        call.callbackCallId || "",
        call.notes || "",
      ]),
    );
    toast.success("Missed calls exported as CSV");
  }, [date, filteredRows]);

  if (loading) {
    return <div className="surface-panel p-8 text-center text-muted-foreground">Loading missed calls...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{rows.length}</p>
          <p className="text-sm text-muted-foreground">{isToday ? "Total Missed Today" : "Total Missed"}</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{openMissedRows.length}</p>
          <p className="text-sm text-muted-foreground">{isToday ? "Open Missed Today" : "Open Missed"}</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{new Set(openMissedRows.map((call) => normalizePhoneNumber(call.callerId)).filter(Boolean)).size}</p>
          <p className="text-sm text-muted-foreground">{isToday ? "Open Unique Numbers" : "Open Unique For Date"}</p>
        </div>
        <div className="surface-panel p-5 text-center">
          <p className="text-3xl font-semibold text-accent">{selectedDate}</p>
          <p className="text-sm text-muted-foreground">Business Date</p>
        </div>
      </div>

      <div className="surface-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field w-[160px]"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setRows([]);
                setDate(event.target.value || getTodayDate());
              }}
              aria-label="Missed calls business date"
            />
            <input
              className="control-field min-w-[280px]"
              placeholder="Search number, customer, agent, language, branch, status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">Last sync: {lastSync || "—"} IST</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="action-outline" onClick={exportMissedCallsCsv} disabled={filteredRows.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button className="action-gold" onClick={() => void loadRows()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="surface-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Time (IST)</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Call Outcome</th>
              <th className="px-4 py-3">Queue Status</th>
              <th className="px-4 py-3">Callback Result</th>
              <th className="px-4 py-3">Disposition</th>
              <th className="px-4 py-3">Callback Agent</th>
              <th className="px-4 py-3">Callback Time</th>
              <th className="px-4 py-3">Call ID</th>
            </tr>
          </thead>
          <tbody>
            {missedCallsPager.pageItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? `No incoming missed calls for ${selectedDate}.` : "No missed calls matched the current search."}
                </td>
              </tr>
            ) : missedCallsPager.pageItems.map((call) => (
              <tr key={call.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono">{getMissedCallDisplayTime(call)}</td>
                <td className="px-4 py-3 font-medium">{call.displayCustomerName || call.customerName || call.callerName || "N/A"}</td>
                <td className="px-4 py-3 font-mono">{call.callerId || "—"}</td>
                <td className="px-4 py-3">{call.agentName || call.agentId || "—"}</td>
                <td className="px-4 py-3">{call.language || "—"}</td>
                <td className="px-4 py-3">{call.branch || "—"}</td>
                <td className="px-4 py-3">{getMissedCallOutcome(call)}</td>
                <td className="px-4 py-3">{getMissedCallQueueStatus(call)}</td>
                <td className="px-4 py-3">{getMissedCallbackResult(call)}</td>
                <td className="px-4 py-3">{getMissedCallDisposition(call)}</td>
                <td className="px-4 py-3">{getMissedCallbackAgent(call)}</td>
                <td className="px-4 py-3 font-mono">{getMissedCallbackDisplayTime(call)}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{call.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={missedCallsPager.page}
        totalPages={missedCallsPager.totalPages}
        totalItems={missedCallsPager.totalItems}
        pageSize={missedCallsPager.pageSize}
        onPageChange={missedCallsPager.setPage}
        disabled={loading}
      />
    </div>
  );
}

function SessionHistoryTab({ breakLogs }: { breakLogs: BreakLogRecord[] }) {
  const [sessions, setSessions] = useState<AgentSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AgentSessionRecord["role"]>("all");
  const [stateFilter, setStateFilter] = useState<"all" | AgentSessionRecord["sessionState"]>("all");
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const [focus, setFocus] = useState<SessionHistoryFocus | null>(null);

  const loadSessions = useCallback(() => {
    api.getAgentSessions({ limit: 500 }).then((data) => {
      if (Array.isArray(data)) {
        setSessions(data);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = window.setInterval(loadSessions, 30000);
    return () => window.clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSessionNow(Date.now());
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const normalizedSessions = useMemo<EnrichedAgentSessionRecord[]>(() => (
    sessions.map((session) => {
      const referenceDateParts = getAdminDateParts(session.loginAt || session.logoutAt || session.createdAt || session.updatedAt);
      if (!session.loginAt) {
        return {
          ...session,
          activeDuration: session.activeDuration || "00:00:00",
          breakTime: session.breakTime || "00:00:00",
          activeDurationSeconds: parseDurationToSeconds(session.activeDuration),
          breakTimeSeconds: parseDurationToSeconds(session.breakTime),
          sessionDuration: "00:00",
          sessionDurationSeconds: 0,
          expectedLogoutAt: "",
          expectedLogoutTime: "",
          sessionDateKey: referenceDateParts?.key || "unknown",
          sessionDateLabel: referenceDateParts?.label || "Unknown Day",
          sortTimestamp: referenceDateParts?.timestamp || 0,
        };
      }

      const loginTimestamp = new Date(session.loginAt).getTime();
      const sessionEndedAt = session.sessionState === "logged-in" ? undefined : session.logoutAt;
      const sessionEndTimestamp = sessionEndedAt ? new Date(sessionEndedAt).getTime() : sessionNow;
      const breakSeconds = getBreakDurationSecondsForSession({
        breakLogs,
        agentId: session.agentId,
        sessionStartedAt: session.loginAt,
        sessionEndedAt,
        now: sessionNow,
      });
      const sessionDurationSeconds = Number.isNaN(loginTimestamp) || Number.isNaN(sessionEndTimestamp)
        ? 0
        : Math.max(0, Math.floor((sessionEndTimestamp - loginTimestamp) / 1000));
      const activeSeconds = getActiveSessionDurationSeconds({
        sessionStartedAt: session.loginAt,
        sessionEndedAt,
        breakDurationSeconds: breakSeconds,
        now: sessionNow,
      });

      return {
        ...session,
        activeDuration: formatSessionDuration(activeSeconds),
        breakTime: formatSessionDuration(breakSeconds),
        activeDurationSeconds: activeSeconds,
        breakTimeSeconds: breakSeconds,
        sessionDuration: formatWorkedDuration(sessionDurationSeconds),
        sessionDurationSeconds,
        expectedLogoutAt: Number.isNaN(loginTimestamp) ? "" : new Date(loginTimestamp + AGENT_SHIFT_DURATION_MS).toISOString(),
        expectedLogoutTime: Number.isNaN(loginTimestamp) ? "—" : formatAdminDateTime(new Date(loginTimestamp + AGENT_SHIFT_DURATION_MS).toISOString()),
        sessionDateKey: referenceDateParts?.key || "unknown",
        sessionDateLabel: referenceDateParts?.label || "Unknown Day",
        sortTimestamp: referenceDateParts?.timestamp || 0,
      };
    })
  ), [breakLogs, sessionNow, sessions]);

  useEffect(() => {
    if (!focus) return;

    const hasFocusedSessions = normalizedSessions.some((session) => (
      session.agentId === focus.agentId && session.sessionDateKey === focus.sessionDateKey
    ));

    if (!hasFocusedSessions) {
      setFocus(null);
    }
  }, [focus, normalizedSessions]);

  const filteredSessions = useMemo(() => (
    normalizedSessions.filter((session) => (
      matchesAdminSearch(search, [
        session.agentId,
        session.agentName,
        session.role,
        session.extension,
        session.loginAt,
        session.logoutAt,
        session.loginTime,
        session.logoutTime,
        session.expectedLogoutTime,
        session.sessionDuration,
        session.breakTime,
      ]) &&
      (roleFilter === "all" || session.role === roleFilter) &&
      (stateFilter === "all" || session.sessionState === stateFilter)
    ))
  ), [normalizedSessions, roleFilter, search, stateFilter]);

  const focusedSessions = useMemo(() => {
    if (!focus) return [];

    return normalizedSessions
      .filter((session) => session.agentId === focus.agentId && session.sessionDateKey === focus.sessionDateKey)
      .sort((left, right) => left.sortTimestamp - right.sortTimestamp);
  }, [focus, normalizedSessions]);

  const focusedSummary = useMemo(() => {
    if (focusedSessions.length === 0) return null;

    const totalWorkedSeconds = focusedSessions.reduce((sum, session) => sum + session.sessionDurationSeconds, 0);
    const totalBreakSeconds = focusedSessions.reduce((sum, session) => sum + session.breakTimeSeconds, 0);
    const firstLoginSession = focusedSessions.find((session) => session.loginAt);
    const latestLogoutSession = [...focusedSessions]
      .filter((session) => session.logoutAt)
      .sort((left, right) => (new Date(right.logoutAt || 0).getTime() - new Date(left.logoutAt || 0).getTime()))[0];
    const loggedInSessions = focusedSessions.filter((session) => session.sessionState === "logged-in").length;

    return {
      totalWorkedSeconds,
      totalBreakSeconds,
      sessionCount: focusedSessions.length,
      loggedInSessions,
      firstLoginAt: firstLoginSession?.loginAt,
      latestLogoutAt: latestLogoutSession?.logoutAt,
    };
  }, [focusedSessions]);

  const sessionAgentSummaries = useMemo<SessionAgentSummary[]>(() => {
    const byAgent = new Map<string, SessionAgentSummary>();

    filteredSessions.forEach((session) => {
      const existing = byAgent.get(session.agentId);
      if (!existing || session.sortTimestamp > existing.latestTimestamp) {
        byAgent.set(session.agentId, {
          agentId: session.agentId,
          agentName: session.agentName,
          role: session.role,
          extension: session.extension,
          sessionState: session.sessionState,
          sessionDateKey: session.sessionDateKey,
          sessionDateLabel: session.sessionDateLabel,
          latestTimestamp: session.sortTimestamp,
        });
      }
    });

    return Array.from(byAgent.values()).sort((left, right) => right.latestTimestamp - left.latestTimestamp);
  }, [filteredSessions]);

  const summaryPager = useClientPagination(sessionAgentSummaries, { resetKey: `${search}|${roleFilter}|${stateFilter}` });
  const focusedSessionPager = useClientPagination(focusedSessions, { resetKey: `${focus?.agentId || ""}|${focus?.sessionDateKey || ""}` });

  const exportSessionHistoryCsv = useCallback(() => {
    if (focus && focusedSessions.length === 0) {
      toast.error("No session rows to export");
      return;
    }
    if (!focus && sessionAgentSummaries.length === 0) {
      toast.error("No session rows to export");
      return;
    }

    if (focus) {
      downloadCsv(
        `attica-agent-session-history-${focus.agentId}-${focus.sessionDateKey}.csv`,
        ["Session ID", "Agent ID", "Agent", "Role", "Extension", "Session State", "Login At", "Expected Logout At", "Logout At", "Session Hours", "Break Time"],
        focusedSessions.map((session) => [
          session.id,
          session.agentId,
          session.agentName,
          session.role,
          session.extension || "",
          session.sessionState === "logged-in" ? "Logged In" : "Logged Out",
          formatAdminSessionDateTime(session.loginAt, session.loginTime),
          session.expectedLogoutTime || "—",
          formatAdminSessionDateTime(session.logoutAt, session.logoutTime),
          session.sessionDuration || "00:00",
          session.breakTime || "00:00:00",
        ]),
      );
    } else {
      downloadCsv(
        `attica-agent-session-history-${stateFilter}.csv`,
        ["Agent ID", "Agent", "Status"],
        sessionAgentSummaries.map((agent) => [
          agent.agentId,
          agent.agentName,
          agent.sessionState === "logged-in" ? "Logged In" : "Logged Out",
        ]),
      );
    }
    toast.success("Session history exported as CSV");
  }, [focus, focusedSessions, sessionAgentSummaries, stateFilter]);

  if (loading) return <div className="surface-panel p-8 text-center text-muted-foreground">Loading session history...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="control-field min-w-[240px]"
            placeholder="Search by agent ID or name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="control-field min-w-[150px]" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | AgentSessionRecord["role"])}>
            <option value="all">All roles</option>
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
            <option value="qc">QC</option>
            <option value="seo">SEO</option>
          </select>
          <select className="control-field min-w-[170px]" value={stateFilter} onChange={(event) => setStateFilter(event.target.value as "all" | AgentSessionRecord["sessionState"])}>
            <option value="all">All sessions</option>
            <option value="logged-in">Currently logged in</option>
            <option value="logged-out">Logged out</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadSessions} className="action-outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button onClick={exportSessionHistoryCsv} className="action-outline" disabled={focus ? focusedSessions.length === 0 : sessionAgentSummaries.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {focus && focusedSummary ? (
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Agent Day View</p>
                <h2 className="mt-1 text-xl font-semibold">{focus.agentName}</h2>
                <p className="font-mono text-sm text-accent">{focus.agentId}</p>
                <p className="mt-1 text-sm text-muted-foreground">{focus.sessionDateLabel}</p>
              </div>
              <button type="button" onClick={() => setFocus(null)} className="action-outline">
                Show All Sessions
              </button>
            </div>
          </div>
          <div className="grid gap-4 border-b border-border p-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Sessions</p>
              <p className="mt-1 text-lg font-semibold">{focusedSummary.sessionCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Logged In Rows</p>
              <p className="mt-1 text-lg font-semibold">{focusedSummary.loggedInSessions}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Worked Hours</p>
              <p className="mt-1 font-mono text-lg font-semibold">{formatWorkedDuration(focusedSummary.totalWorkedSeconds)}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Break</p>
              <p className="mt-1 font-mono text-lg font-semibold">{formatSessionDuration(focusedSummary.totalBreakSeconds)}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4 md:col-span-2 xl:col-span-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">First Login / Last Logout</p>
              <p className="mt-1 text-sm font-semibold">{formatAdminDateTime(focusedSummary.firstLoginAt)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{focusedSummary.latestLogoutAt ? formatAdminDateTime(focusedSummary.latestLogoutAt) : "Still logged in"}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="surface-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            {focus ? (
              <tr>
                <th className="px-4 py-3">Agent ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Ext</th>
                <th className="px-4 py-3">Session State</th>
                <th className="px-4 py-3">Login At</th>
                <th className="px-4 py-3">Expected Logout At</th>
                <th className="px-4 py-3">Logout At</th>
                <th className="px-4 py-3">Session Hours</th>
                <th className="px-4 py-3">Break Time</th>
              </tr>
            ) : (
              <tr>
                <th className="px-4 py-3">Agent ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            )}
          </thead>
          <tbody>
            {focus ? (
              focusedSessionPager.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No session history found for the selected search/filter.</td>
                </tr>
              ) : focusedSessionPager.pageItems.map((session) => (
                <tr key={session.id} className="border-t border-border bg-accent/5">
                  <td className="px-4 py-3 font-mono text-accent">{session.agentId}</td>
                  <td className="px-4 py-3 font-medium">{session.agentName}</td>
                  <td className="px-4 py-3 capitalize">{session.role}</td>
                  <td className="px-4 py-3 font-mono">{session.extension || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={session.sessionState === "logged-in" ? "success-badge" : "done-badge"}>
                      {session.sessionState === "logged-in" ? "Logged In" : "Logged Out"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{formatAdminSessionDateTime(session.loginAt, session.loginTime)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{session.expectedLogoutTime || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{formatAdminSessionDateTime(session.logoutAt, session.logoutTime)}</td>
                  <td className="px-4 py-3 font-mono">{session.sessionDuration || "00:00"}</td>
                  <td className="px-4 py-3 font-mono">{session.breakTime || "00:00:00"}</td>
                </tr>
              ))
            ) : (
              summaryPager.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No agents found for the selected search/filter.</td>
                </tr>
              ) : summaryPager.pageItems.map((agent) => (
                <tr key={`${agent.agentId}:${agent.sessionDateKey}`} className="border-t border-border">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setFocus({
                        agentId: agent.agentId,
                        agentName: agent.agentName,
                        sessionDateKey: agent.sessionDateKey,
                        sessionDateLabel: agent.sessionDateLabel,
                      })}
                      className="font-mono text-accent hover:underline"
                    >
                      {agent.agentId}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setFocus({
                        agentId: agent.agentId,
                        agentName: agent.agentName,
                        sessionDateKey: agent.sessionDateKey,
                        sessionDateLabel: agent.sessionDateLabel,
                      })}
                      className="text-left font-medium hover:text-accent"
                    >
                      {agent.agentName}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={agent.sessionState === "logged-in" ? "success-badge" : "done-badge"}>
                      {agent.sessionState === "logged-in" ? "Logged In" : "Logged Out"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={focus ? focusedSessionPager.page : summaryPager.page}
        totalPages={focus ? focusedSessionPager.totalPages : summaryPager.totalPages}
        totalItems={focus ? focusedSessionPager.totalItems : summaryPager.totalItems}
        pageSize={focus ? focusedSessionPager.pageSize : summaryPager.pageSize}
        onPageChange={focus ? focusedSessionPager.setPage : summaryPager.setPage}
        disabled={loading}
      />
      <p className="text-sm text-muted-foreground">
        {focus
          ? `${focusedSessions.length} sessions for ${focus.agentName} on ${focus.sessionDateLabel}`
          : `${sessionAgentSummaries.length} agents in session history`}
      </p>
    </div>
  );
}

function RealBranchesTab() {
  const [branches, setBranches] = useState<RealBranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState<"all" | "missing">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditableBranchState>({});
  const [newBranch, setNewBranch] = useState<NewBranchState>(getEmptyBranchState());
  const [pledgePlaces, setPledgePlaces] = useState<string[]>([]);
  const [newPledgePlace, setNewPledgePlace] = useState("");
  const [pledgePlacesLoading, setPledgePlacesLoading] = useState(true);
  const [pledgePlacesSaving, setPledgePlacesSaving] = useState(false);

  const loadBranches = () => {
    api.getBranches().then(data => { if (Array.isArray(data)) setBranches(data); setLoading(false); });
  };
  useEffect(() => { loadBranches(); }, []);
  useEffect(() => {
    const loadPledgePlaces = api.getPledgePlaces;
    if (typeof loadPledgePlaces !== "function") {
      setPledgePlacesLoading(false);
      return;
    }
    void loadPledgePlaces().then((places) => setPledgePlaces(places)).finally(() => setPledgePlacesLoading(false));
  }, []);

  const availableStates = useMemo(
    () => Array.from(new Set(branches.map((branch) => branch.state).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [branches],
  );

  const filtered = branches.filter((branch) => (
    matchesAdminSearch(search, [branch.name, branch.city, branch.state, branch.id, branch.area]) &&
    (stateFilter === "all" || (branch.state || "") === stateFilter) &&
    (locationFilter === "all" || !getBranchLocationUrl(branch))
  ));
  const missingLocationBranches = useMemo(
    () => branches.filter((branch) => !getBranchLocationUrl(branch)),
    [branches],
  );
  const branchPager = useClientPagination(filtered, { resetKey: `${search}|${stateFilter}|${locationFilter}` });

  const exportBranchesCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("No branch rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-branches-${stateFilter || "all"}.csv`,
      ["Branch ID", "Branch Name", "Area", "City", "State", "Pincode", "Timings", "Map URL", "Bitly URL", "Active Location URL"],
      filtered.map((branch) => [
        branch.id,
        branch.name,
        branch.area || "",
        branch.city || "",
        branch.state || "",
        branch.pincode || "",
        branch.timings || "",
        branch.mapUrl || "",
        branch.bitlyUrl || "",
        getBranchLocationUrl(branch),
      ]),
    );
    toast.success("Branches exported as CSV");
  }, [filtered, stateFilter]);

  const handleAdd = async () => {
    if (!newBranch.branchId || !newBranch.branchName || !newBranch.city) { toast.error("ID, Name, and City required"); return; }
    const r = await api.createBranch(newBranch);
    if (r.success) { clearRealBranchesCache(); toast.success("Branch added"); setShowAdd(false); setNewBranch(getEmptyBranchState()); loadBranches(); }
    else toast.error(r.error || "Failed");
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    const r = await api.updateBranch(editId, editData);
    if (r.success) { clearRealBranchesCache(); toast.success("Branch updated"); setEditId(null); loadBranches(); }
    else toast.error(r.error || "Failed");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm("Deactivate branch " + name + "?")) return;
    await api.deleteBranch(id);
    clearRealBranchesCache();
    toast.success("Branch deactivated");
    loadBranches();
  };

  const savePledgePlaces = async (nextPlaces: string[]) => {
    const normalized = Array.from(new Set([...nextPlaces.map((place) => place.trim()).filter(Boolean), "Other"]));
    setPledgePlacesSaving(true);
    const result = await api.updatePledgePlaces(normalized);
    setPledgePlacesSaving(false);
    if (!result.success) {
      toast.error(result.error || "Unable to save pledge places");
      return false;
    }
    setPledgePlaces(result.places?.length ? result.places : normalized);
    return true;
  };

  const handleAddPledgePlace = async () => {
    const value = newPledgePlace.trim();
    if (!value || value.toLowerCase() === "other") return;
    if (await savePledgePlaces([...pledgePlaces.filter((place) => place !== "Other"), value])) {
      setNewPledgePlace("");
      toast.success("Pledge place added");
    }
  };

  const handleRemovePledgePlace = async (place: string) => {
    if (place === "Other") return;
    if (await savePledgePlaces(pledgePlaces.filter((item) => item !== place))) toast.success("Pledge place removed");
  };

  if (loading) return <div className="surface-panel p-8 text-center text-muted-foreground">Loading branches...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input className="control-field min-w-[240px]" placeholder="Search by name, city, state, area, or ID..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="control-field min-w-[180px]" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">All states</option>
            {availableStates.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
          <select className="control-field min-w-[180px]" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value as "all" | "missing")}>
            <option value="all">All location links</option>
            <option value="missing">Missing links only</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {branches.length}
            {missingLocationBranches.length > 0 ? ` · ${missingLocationBranches.length} missing` : ""}
          </p>
          <button onClick={exportBranchesCsv} className="action-outline" disabled={filtered.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="action-gold"><Plus className="h-4 w-4" />{showAdd ? "Cancel" : "Add Branch"}</button>
        </div>
      </div>

      {missingLocationBranches.length > 0 && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">{missingLocationBranches.length} branches do not have a branch location link.</p>
            <button type="button" className="action-outline text-xs" onClick={() => setLocationFilter("missing")}>
              Show missing links
            </button>
          </div>
          <p className="mt-1 text-xs">
            {missingLocationBranches.slice(0, 8).map((branch) => `${branch.id} - ${branch.name}`).join(", ")}
            {missingLocationBranches.length > 8 ? `, +${missingLocationBranches.length - 8} more` : ""}
          </p>
        </div>
      )}

      <div className="surface-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Pledge Place Master</h3>
            <p className="mt-1 text-xs text-muted-foreground">Release forms use this configurable list. “Other” is always available for a custom entry.</p>
          </div>
          <span className="text-xs text-muted-foreground">{pledgePlacesLoading ? "Loading..." : `${pledgePlaces.length} options`}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {pledgePlaces.map((place) => (
            <span key={place} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs">
              {place}
              {place !== "Other" ? <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => { void handleRemovePledgePlace(place); }} disabled={pledgePlacesSaving} aria-label={`Remove ${place}`}>×</button> : null}
            </span>
          ))}
        </div>
        <div className="mt-3 flex max-w-xl gap-2">
          <input className="control-field" value={newPledgePlace} onChange={(event) => setNewPledgePlace(event.target.value)} placeholder="Add bank or finance company" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleAddPledgePlace(); } }} />
          <button type="button" className="action-gold shrink-0" onClick={() => { void handleAddPledgePlace(); }} disabled={pledgePlacesSaving || !newPledgePlace.trim()}><Plus className="h-4 w-4" />Add</button>
        </div>
      </div>

      {showAdd && (
        <div className="surface-panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Add New Branch</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <input className="control-field" placeholder="Branch ID (e.g. AGPL200)" value={newBranch.branchId} onChange={e => setNewBranch(p => ({...p, branchId: e.target.value}))} />
            <input className="control-field" placeholder="Branch Name *" value={newBranch.branchName} onChange={e => setNewBranch(p => ({...p, branchName: e.target.value}))} />
            <input className="control-field" placeholder="Address" value={newBranch.addressline} onChange={e => setNewBranch(p => ({...p, addressline: e.target.value}))} />
            <input className="control-field" placeholder="Area" value={newBranch.area} onChange={e => setNewBranch(p => ({...p, area: e.target.value}))} />
            <input className="control-field" placeholder="City *" value={newBranch.city} onChange={e => setNewBranch(p => ({...p, city: e.target.value}))} />
            <input className="control-field" placeholder="State" value={newBranch.state} onChange={e => setNewBranch(p => ({...p, state: e.target.value}))} />
            <input className="control-field" placeholder="Pincode" value={newBranch.pincode} onChange={e => setNewBranch(p => ({...p, pincode: e.target.value}))} />
            <input className="control-field" placeholder="Timings" value={newBranch.timings} onChange={e => setNewBranch(p => ({...p, timings: e.target.value}))} />
            <input className="control-field" placeholder="Google Maps URL" value={newBranch.mapUrl} onChange={e => setNewBranch(p => ({...p, mapUrl: e.target.value, url: p.bitlyUrl || e.target.value}))} />
            <input className="control-field" placeholder="Bitly URL" value={newBranch.bitlyUrl} onChange={e => setNewBranch(p => ({...p, bitlyUrl: e.target.value, url: e.target.value || p.mapUrl}))} />
          </div>
          <button onClick={handleAdd} className="action-gold mt-3 justify-center w-full"><Save className="h-4 w-4" />Add Branch</button>
        </div>
      )}

      <div className="surface-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-3">ID</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Area</th>
              <th className="px-3 py-3">City</th>
              <th className="px-3 py-3">State</th>
              <th className="px-3 py-3">Pincode</th>
              <th className="px-3 py-3">Timings</th>
              <th className="px-3 py-3">Location Link</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branchPager.pageItems.map(b => {
              const branchLocationUrl = getBranchLocationUrl(b);
              return (
              <tr key={b.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-accent text-xs">{b.id}</td>
                <td className="px-3 py-2">{editId === b.id ? <input className="control-field text-sm" value={editData.branchName || ""} onChange={e => setEditData((p) => ({...p, branchName: e.target.value}))} /> : branchLocationUrl ? <a href={branchLocationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">{b.name}<ExternalLink className="h-3 w-3" /></a> : <span className="font-medium">{b.name}</span>}</td>
                <td className="px-3 py-2">{editId === b.id ? <input className="control-field text-sm" value={editData.area || ""} onChange={e => setEditData((p) => ({...p, area: e.target.value}))} /> : b.area}</td>
                <td className="px-3 py-2">{editId === b.id ? <input className="control-field text-sm" value={editData.city || ""} onChange={e => setEditData((p) => ({...p, city: e.target.value}))} /> : b.city}</td>
                <td className="px-3 py-2">{editId === b.id ? <input className="control-field text-sm" value={editData.state || ""} onChange={e => setEditData((p) => ({...p, state: e.target.value}))} /> : b.state}</td>
                <td className="px-3 py-2 font-mono text-xs">{editId === b.id ? <input className="control-field text-sm w-20" value={editData.pincode || ""} onChange={e => setEditData((p) => ({...p, pincode: e.target.value}))} /> : b.pincode}</td>
                <td className="px-3 py-2 text-xs">{editId === b.id ? <input className="control-field text-sm" value={editData.timings || ""} onChange={e => setEditData((p) => ({...p, timings: e.target.value}))} /> : b.timings}</td>
                <td className="px-3 py-2">{editId === b.id ? (
                  <div className="grid min-w-[260px] gap-2">
                    <input className="control-field text-sm" value={editData.mapUrl || ""} onChange={e => setEditData((p) => ({...p, mapUrl: e.target.value, url: p.bitlyUrl || e.target.value}))} placeholder="Google Maps URL" />
                    <input className="control-field text-sm" value={editData.bitlyUrl || ""} onChange={e => setEditData((p) => ({...p, bitlyUrl: e.target.value, url: e.target.value || p.mapUrl}))} placeholder="Bitly URL" />
                  </div>
                ) : branchLocationUrl ? <a href={branchLocationUrl} target="_blank" rel="noreferrer" className="text-accent underline text-xs">Open branch location</a> : <span className="text-xs font-medium text-red-500">Missing</span>}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {editId === b.id ? (
                      <>
                        <button className="action-gold text-xs" onClick={handleSaveEdit}><Save className="h-3 w-3" />Save</button>
                        <button className="action-outline text-xs" onClick={() => setEditId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="action-outline text-xs" onClick={() => { setEditId(b.id); setEditData({ branchName: b.name, area: b.area, city: b.city, state: b.state, pincode: b.pincode, timings: b.timings, url: branchLocationUrl || b.url, mapUrl: b.mapUrl || "", bitlyUrl: b.bitlyUrl || "" }); }}>Edit</button>
                        <button className="action-outline text-xs text-red-500" onClick={() => handleDelete(b.id, b.name)}>Delete</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={branchPager.page}
        totalPages={branchPager.totalPages}
        totalItems={branchPager.totalItems}
        pageSize={branchPager.pageSize}
        onPageChange={branchPager.setPage}
        disabled={loading}
      />
    </div>
  );
}

function formatSmsTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function SmsLogsTab() {
  const [rows, setRows] = useState<SmsLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(getBusinessDateString(new Date()));
  const [statusFilter, setStatusFilter] = useState<SmsLogStatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState<SmsLogSummary>({ all: 0, delivered: 0, failed: 0, pending: 0 });
  const latestRequest = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const result = await api.getSMSLogPage({ page, status: statusFilter, search: searchQuery, date: selectedDate });
      if (requestId !== latestRequest.current) return;
      setRows(Array.isArray(result.rows) ? result.rows : []);
      setTotalRecords(Number(result.totalRecords) || 0);
      setTotalPages(Number(result.totalPages) || 0);
      setSummary({
        all: Number(result.summary?.all) || 0,
        delivered: Number(result.summary?.delivered) || 0,
        failed: Number(result.summary?.failed) || 0,
        pending: Number(result.summary?.pending) || 0,
      });
      if (result.page && result.page !== page) setPage(result.page);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [page, searchQuery, selectedDate, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const statusTabs = useMemo(() => ([
    { id: "all" as const, label: "All SMS", count: summary.all, tone: "text-foreground" },
    { id: "delivered" as const, label: "Delivered", count: summary.delivered, tone: "text-emerald-600" },
    { id: "failed" as const, label: "Failed", count: summary.failed, tone: "text-red-600" },
    { id: "pending" as const, label: "Pending", count: summary.pending, tone: "text-amber-600" },
  ]), [summary]);

  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast.error("No SMS records to export");
      return;
    }
    downloadCsv(
      `attica-sms-delivery-${selectedDate || getBusinessDateString(new Date())}.csv`,
      ["Sent At", "Recipient", "Branch", "Message", "Category", "Source", "Provider Message ID", "Status", "Status Code", "Delivered At", "Country", "Network", "Cost", "Units", "Reason"],
      rows.map((row) => [
        formatSmsTime(row.created_at), row.phone || "", row.branch_name || row.branch_id || "", row.message || "",
        row.message_type === "TXN" ? "Transactional" : row.message_type || "", row.source || "", row.provider_message_id || "", row.delivery_status || row.status || "",
        row.delivery_status_code || "", formatSmsTime(row.delivered_at), row.country || "", row.network || "",
        row.cost == null ? "" : String(row.cost), row.units == null ? "" : String(row.units), row.delivery_reason || "",
      ]),
    );
    toast.success("Current SMS page exported");
  }, [rows, selectedDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">SMS Delivery Tracking</h2>
          <p className="text-sm text-muted-foreground">Kaleyra sends, provider IDs, delivery timestamps, cost and failure details.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="action-outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</button>
          <button type="button" className="action-outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />Export CSV</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setStatusFilter(tab.id); setPage(1); }}
              className={`surface-panel flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:border-accent/60 ${active ? "border-accent bg-accent/5 ring-1 ring-accent/30" : ""}`}
              aria-pressed={active}
            >
              <span className="text-sm font-medium">{tab.label}</span>
              <span className={`text-xl font-bold tabular-nums ${tab.tone}`}>{tab.count.toLocaleString("en-IN")}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Date (IST)
          <input
            type="date"
            className="control-field min-w-[165px]"
            value={selectedDate}
            onChange={(event) => { setSelectedDate(event.target.value); setPage(1); }}
          />
        </label>
        <input className="control-field min-w-[280px] flex-1" placeholder="Search all SMS by phone, branch, message or provider ID..." value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        <span className="self-center rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">50 rows per page</span>
        <span className="self-center text-sm text-muted-foreground">{totalRecords.toLocaleString("en-IN")} matching records</span>
      </div>
      <div className="surface-panel overflow-x-auto">
        <table className="w-full min-w-[1500px] text-sm">
          <thead className="bg-muted/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Sent At (IST)</th>
              <th className="px-3 py-3">Recipient</th>
              <th className="px-3 py-3">Branch</th>
              <th className="px-3 py-3">Message</th>
              <th className="px-3 py-3">Category / Source</th>
              <th className="px-3 py-3">Provider Message ID</th>
              <th className="px-3 py-3">Delivery</th>
              <th className="px-3 py-3">Delivered At</th>
              <th className="px-3 py-3">Country / Network</th>
              <th className="px-3 py-3">Cost</th>
              <th className="px-3 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">Loading SMS delivery records...</td></tr>
              : rows.length === 0 ? <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">No SMS records found.</td></tr>
              : rows.map((row, rowIndex) => {
                const delivery = String(row.delivery_status || row.status || "queued").toLowerCase();
                const badge = delivery === "delivered" ? "done-badge" : delivery === "failed" ? "warning-badge" : "rounded-full border border-border px-2 py-1 text-xs";
                const deliveryLabel = delivery === "delivered" ? "Delivered" : delivery === "failed" ? "Failed" : delivery === "submitted" ? "Submitted" : delivery === "queued" ? "Queued" : delivery;
                return (
                  <tr key={row.id || row.client_message_id || `${page}-${rowIndex}`} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-3 text-xs">{formatSmsTime(row.created_at)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.phone || "—"}</td>
                    <td className="px-3 py-3">{row.branch_name || row.branch_id || "—"}</td>
                    <td className="max-w-[360px] px-3 py-3 text-xs">{row.message || "—"}</td>
                    <td className="px-3 py-3 text-xs">{row.message_type === "TXN" ? "Transactional" : row.message_type || "—"}<div className="text-muted-foreground">{row.source || "—"}</div></td>
                    <td className="px-3 py-3 font-mono text-xs">{row.provider_message_id || "Awaiting provider ID"}</td>
                    <td className="px-3 py-3"><span className={badge}>{deliveryLabel}</span>{row.delivery_status_code ? <div className="mt-1 text-xs text-muted-foreground">{row.delivery_status_code}</div> : null}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs">{formatSmsTime(row.delivered_at)}</td>
                    <td className="px-3 py-3 text-xs">{[row.country || row.iso_code, row.network].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-3 py-3 text-xs">{row.cost == null ? "—" : `₹${row.cost}`}{row.units != null ? <div className="text-muted-foreground">{row.units} unit(s)</div> : null}</td>
                    <td className="max-w-[260px] px-3 py-3 text-xs">{row.delivery_reason || "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="surface-panel overflow-hidden">
        <TablePagination
          page={page}
          totalPages={totalPages}
          totalItems={totalRecords}
          pageSize={pageSize}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>
    </div>
  );
}


export default function AdminPanel({ initialTab = 0 }: { initialTab?: number }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { metalRates, updateMetalRate, addMetalRate, deleteMetalRate, breakLogs } = useCallCenter();
  const { branches: realBranches } = useRealBranches();
  const { agents: directoryAgents, loadAgents: refreshAgentDirectory, resolveAgentName } = useAgentDirectory();
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [newRate, setNewRate] = useState({ label: "", value: "" });
  const [rateSearch, setRateSearch] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [breakSearch, setBreakSearch] = useState("");
  const [breakStatusFilter, setBreakStatusFilter] = useState("all");
  const [selectedBreakAgentId, setSelectedBreakAgentId] = useState("");
  const [conversionSearch, setConversionSearch] = useState("");
  const [conversionDateFilter, setConversionDateFilter] = useState(getTodayDate());
  const {data:customerData,loading:conversionLoading,error:conversionError,refresh:loadConversionRows} = useCustomerDataDashboard(
    conversionDateFilter,activeTab === ADMIN_TAB_INDEX.CUSTOMER_DATA,
  );
  const conversionDataUnavailable = Boolean(conversionError && customerData.results.length === 0);
  const conversionLastSync = customerData.lastSyncedAt ? new Date(customerData.lastSyncedAt).toLocaleTimeString("en-IN", {
    timeZone:BUSINESS_TIME_ZONE,hour:"2-digit",minute:"2-digit",second:"2-digit",
  }) : "";

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const visibleTabs = useMemo(() => (
    user?.role === "seo"
      ? tabs.filter((_, index) => SEO_VISIBLE_TAB_INDEXES.has(index))
      : tabs
  ), [user?.role]);

  useEffect(() => {
    if (user?.role !== "seo" || SEO_VISIBLE_TAB_INDEXES.has(activeTab)) return;
    setActiveTab(ADMIN_TAB_INDEX.JUSTDIAL_LEAD);
    navigate(tabs[ADMIN_TAB_INDEX.JUSTDIAL_LEAD].path, { replace: true });
  }, [activeTab, navigate, user?.role]);

  const handleAdminTabChange = useCallback((tabIndex: number) => {
    if (user?.role === "seo" && !SEO_VISIBLE_TAB_INDEXES.has(tabIndex)) return;
    setActiveTab(tabIndex);
    const tabPath = tabs[tabIndex]?.path;
    if (tabPath) {
      navigate(tabPath);
    }
  }, [navigate, user?.role]);

  const conversionRows = useMemo(() => {
      const rows = customerData.results.map((record) => {
        const rowBase = {
          billId: record.billId || "",
          customerName: record.customerName || "",
          contact: record.contact || "",
          type: record.type || "",
          branch: record.branch || "",
          date: record.date || "",
          time: record.time || "",
          status: record.status || "",
          source: record.source || "",
          dispositionCategory: getCustomerDataDispositionCategory(record),
          grossW: record.grossW || "",
          netW: record.netW || "",
          walkinType: record.walkinType || "",
          firstAgentName: record.firstAgentName || "",
        } satisfies Omit<ConversionDashboardRow, "id">;

        return {
          id: buildConversionRowId(rowBase),
          ...rowBase,
        } satisfies ConversionDashboardRow;
      });

      return rows.sort(compareConversionRows);
  }, [customerData.results]);

  const branchNameById = useMemo(() => {
    const map = new Map<string, string>();
    realBranches.forEach((branch) => {
      if (!branch.id || !branch.name) return;
      map.set(normalizeBranchKey(branch.id), branch.name);
    });
    return map;
  }, [realBranches]);

  const resolveBranchLabel = useCallback((branchValue: string) => {
    const trimmed = branchValue.trim();
    if (!trimmed) return "";

    const branchName = branchNameById.get(normalizeBranchKey(trimmed));
    return branchName ? `${branchName} (${trimmed})` : trimmed;
  }, [branchNameById]);

  const filteredConversionRows = useMemo(() => {
    const term = conversionSearch.trim().toLowerCase();
    const matchedRows = conversionRows.filter((row) => {
      const matchesSearch = !term || [
        row.customerName,
        row.billId,
        row.contact,
        row.type,
        row.branch,
        resolveBranchLabel(row.branch),
        row.firstAgentName,
        row.status,
        row.source,
        row.grossW,
        row.netW,
        row.walkinType,
      ].some((value) => value.toLowerCase().includes(term));

      const matchesDate = !conversionDateFilter || normalizeApiDate(row.date) === conversionDateFilter;
      return matchesSearch && matchesDate;
    });

    return matchedRows.sort(compareConversionRows);
  }, [conversionDateFilter, conversionRows, conversionSearch, resolveBranchLabel]);

  const uniqueFilteredContacts = useMemo(
    () => new Set(filteredConversionRows.map((row) => row.contact).filter(Boolean)).size,
    [filteredConversionRows],
  );
  const exportCustomerDataCsv = useCallback(() => {
    if (filteredConversionRows.length === 0) {
      toast.error("No customer data rows to export");
      return;
    }

    downloadCsv(
      `attica-customer-data-${conversionDateFilter || "all-dates"}.csv`,
      ["Customer", "Bill ID", "Contact", "First Agent", "Type", "Branch", "Date", "Time", "Status", "Source", "Disposition Category", "Gross W", "Net W", "Walk-in Type"],
      filteredConversionRows.map((row) => [
        row.customerName || "",
        row.billId || "",
        row.contact || "",
        row.firstAgentName || "",
        row.type || "",
        resolveBranchLabel(row.branch) || row.branch || "",
        row.date || "",
        row.time || "",
        row.status || "",
        row.source || "",
        getCustomerDataDispositionCategory(row),
        row.grossW || "",
        row.netW || "",
        row.walkinType || "",
      ]),
    );
    toast.success("Customer data exported as CSV");
  }, [conversionDateFilter, filteredConversionRows, resolveBranchLabel]);

  useEffect(() => {
    setAgentList((current) => mergeAgentDirectory(current, directoryAgents));
  }, [directoryAgents]);

  const todayBreakLogs = useMemo(() => {
    const today = getTodayDate();
    return breakLogs.filter((log) => {
      if (log.startedAt) {
        return getBusinessDateString(new Date(log.startedAt)) === today;
      }
      if (log.breakDate) {
        return normalizeBusinessDateValue(log.breakDate) === today;
      }
      if (!log.createdAt) return false;
      return getBusinessDateString(new Date(log.createdAt)) === today;
    });
  }, [breakLogs]);

  const filteredShiftAgents = useMemo(() => (
    agentList.filter((agent) => (
      agent.role === "agent" &&
      matchesAdminSearch(shiftSearch, [agent.id, agent.name, agent.extension, agent.shift]) &&
      (shiftFilter === "all" || agent.shift === shiftFilter)
    ))
  ), [agentList, shiftFilter, shiftSearch]);

  const filteredBreakLogs = useMemo(() => (
    todayBreakLogs.filter((log) => {
      const status = log.endTime ? "completed" : "open";
      return (
        matchesAdminSearch(breakSearch, [
          resolveAgentName(log.agentId, log.agentName),
          log.agentId,
          getAgentStatusLabel(log.breakType || "on-break"),
          log.breakDate,
          log.startTime,
          log.endTime,
          log.duration,
        ]) &&
        (breakStatusFilter === "all" || status === breakStatusFilter)
      );
    })
  ), [todayBreakLogs, breakSearch, breakStatusFilter, resolveAgentName]);
  const filteredBreakTotalDuration = useMemo(
    () => formatDurationSeconds(filteredBreakLogs.reduce((sum, log) => sum + parseDurationValueToSeconds(log.duration), 0)),
    [filteredBreakLogs],
  );
  const breakAgentSummaries = useMemo<BreakAgentSummary[]>(() => {
    const summaryMap = new Map<string, BreakAgentSummary>();

    filteredBreakLogs.forEach((log) => {
      const agentId = String(log.agentId || "").trim() || "UNKNOWN";
      const existingSummary = summaryMap.get(agentId);
      const durationSeconds = parseDurationValueToSeconds(log.duration);
      const logTimestamp = getBreakLogTimestamp(log);
      const normalizedBreakType = String(log.breakType || "").trim().toLowerCase();
      const lunchBreakDurationSeconds = normalizedBreakType === "lunch-break" ? durationSeconds : 0;
      const restroomBreakDurationSeconds = normalizedBreakType === "restroom-break" ? durationSeconds : 0;
      const lunchBreakCount = normalizedBreakType === "lunch-break" ? 1 : 0;
      const restroomBreakCount = normalizedBreakType === "restroom-break" ? 1 : 0;

      if (!existingSummary) {
        summaryMap.set(agentId, {
          agentId,
          agentName: resolveAgentName(log.agentId, log.agentName),
          totalDurationSeconds: durationSeconds,
          breakCount: 1,
          openBreakCount: log.endTime ? 0 : 1,
          lunchBreakDurationSeconds,
          lunchBreakCount,
          restroomBreakDurationSeconds,
          restroomBreakCount,
          latestBreakAt: logTimestamp,
          sessions: [log],
        });
        return;
      }

      existingSummary.totalDurationSeconds += durationSeconds;
      existingSummary.breakCount += 1;
      existingSummary.openBreakCount += log.endTime ? 0 : 1;
      existingSummary.lunchBreakDurationSeconds += lunchBreakDurationSeconds;
      existingSummary.lunchBreakCount += lunchBreakCount;
      existingSummary.restroomBreakDurationSeconds += restroomBreakDurationSeconds;
      existingSummary.restroomBreakCount += restroomBreakCount;
      existingSummary.latestBreakAt = Math.max(existingSummary.latestBreakAt, logTimestamp);
      existingSummary.sessions.push(log);
    });

    return Array.from(summaryMap.values())
      .map((summary) => ({
        ...summary,
        sessions: [...summary.sessions].sort((left, right) => getBreakLogTimestamp(right) - getBreakLogTimestamp(left)),
      }))
      .sort((left, right) => {
        if (left.openBreakCount !== right.openBreakCount) {
          return right.openBreakCount - left.openBreakCount;
        }
        if (left.latestBreakAt !== right.latestBreakAt) {
          return right.latestBreakAt - left.latestBreakAt;
        }
        return left.agentName.localeCompare(right.agentName);
      });
  }, [filteredBreakLogs, resolveAgentName]);
  const activeBreakAgentsCount = useMemo(
    () => breakAgentSummaries.filter((summary) => summary.openBreakCount > 0).length,
    [breakAgentSummaries],
  );
  const shiftPager = useClientPagination(filteredShiftAgents, { resetKey: `${shiftSearch}|${shiftFilter}` });
  const breakSummaryPager = useClientPagination(breakAgentSummaries, { resetKey: `${breakSearch}|${breakStatusFilter}|${breakAgentSummaries.length}` });
  const conversionPager = useClientPagination(filteredConversionRows, { resetKey: `${conversionSearch}|${conversionDateFilter}` });
  const selectedBreakAgentSummary = useMemo(
    () => breakAgentSummaries.find((summary) => summary.agentId === selectedBreakAgentId) || breakSummaryPager.pageItems[0] || breakAgentSummaries[0] || null,
    [breakAgentSummaries, breakSummaryPager.pageItems, selectedBreakAgentId],
  );
  const filteredRates = useMemo(() => (
    metalRates.filter((rate) => matchesAdminSearch(rateSearch, [rate.label, rate.value]))
  ), [metalRates, rateSearch]);

  const exportShiftCsv = useCallback(() => {
    if (filteredShiftAgents.length === 0) {
      toast.error("No shift rows to export");
      return;
    }

    downloadCsv(
      `attica-admin-shifts-${shiftFilter || "all"}.csv`,
      ["Agent ID", "Agent", "Extension", "Current Shift"],
      filteredShiftAgents.map((agent) => [
        agent.id,
        agent.name,
        agent.extension || "",
        agent.shift,
      ]),
    );
    toast.success("Shifts exported as CSV");
  }, [filteredShiftAgents, shiftFilter]);

  const handleShiftChange = useCallback(async (agentId: string, shift: string, agentName: string, previousShift: string) => {
    setAgentList((current) => current.map((agent) => (
      agent.id === agentId ? { ...agent, shift } : agent
    )));

    const result = await api.updateAgent(agentId, { shift });
    if (result?.error) {
      setAgentList((current) => current.map((agent) => (
        agent.id === agentId ? { ...agent, shift: previousShift } : agent
      )));
      toast.error(result.error || `Failed to update shift for ${agentName}`);
      return;
    }

    toast.success(`Shift updated for ${agentName}`);
    void refreshAgentDirectory();
  }, [refreshAgentDirectory]);

  const exportRatesCsv = useCallback(() => {
    if (filteredRates.length === 0) {
      toast.error("No rates to export");
      return;
    }

    downloadCsv(
      `attica-admin-rates-${getTodayDate()}.csv`,
      ["Label", "Value"],
      filteredRates.map((rate) => [rate.label, rate.value]),
    );
    toast.success("Rates exported as CSV");
  }, [filteredRates]);

  const exportBreakLogsCsv = useCallback(() => {
    if (filteredBreakLogs.length === 0) {
      toast.error("No break logs to export");
      return;
    }

    downloadCsv(
      `attica-admin-break-logs-${getTodayDate()}.csv`,
      ["Agent ID", "Agent", "Break Type", "Break Date", "Start Time", "End Time", "Duration", "Current Status", "Started At", "Ended At"],
      filteredBreakLogs.map((log) => [
        log.agentId || "",
        resolveAgentName(log.agentId, log.agentName),
        getAgentStatusLabel(log.breakType || "on-break"),
        log.breakDate || "",
        log.startTime || "",
        log.endTime || "",
        log.duration || "",
        log.endTime ? "Completed" : "On Break",
        log.startedAt || log.createdAt || "",
        log.endedAt || "",
      ]),
    );
    toast.success("Break logs exported as CSV");
  }, [filteredBreakLogs, resolveAgentName]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">{user?.role === "seo" ? "SEO Dashboard" : "Administration"}</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><ShieldCheck className="h-6 w-6 text-accent" />{user?.role === "seo" ? "Lead Sources" : "Admin Panel"}</h1>
      </div>
      <div className="surface-panel p-2"><div className="flex flex-wrap gap-2">{visibleTabs.map((tab) => {
        const tabIndex = tabs.findIndex((candidate) => candidate.path === tab.path);
        return <button key={tab.label} onClick={() => handleAdminTabChange(tabIndex)} className={activeTab === tabIndex ? "action-gold" : "action-outline"}>{tab.icon}{tab.label}</button>;
      })}</div></div>

      {/* USERS */}
      {activeTab === ADMIN_TAB_INDEX.USERS && <AgentManagementTab onAgentsChanged={() => void refreshAgentDirectory()} />}

      {/* LANGUAGES */}
      {activeTab === ADMIN_TAB_INDEX.LANGUAGES && <LanguagesTab agents={agentList} setAgents={setAgentList} />}

      {/* BRANCHES */}
      {activeTab === ADMIN_TAB_INDEX.BRANCHES && <RealBranchesTab />}

      {/* SHIFTS */}
      {activeTab === ADMIN_TAB_INDEX.SHIFTS && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="control-field min-w-[240px]"
                placeholder="Search by agent, ID, extension, or shift..."
                value={shiftSearch}
                onChange={(event) => setShiftSearch(event.target.value)}
              />
              <select className="control-field min-w-[220px]" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}>
                <option value="all">All shifts</option>
                {allShifts.map((shift) => (
                  <option key={shift} value={shift}>{shift}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">{filteredShiftAgents.length} of {agentList.filter((agent) => agent.role === "agent").length} agents</p>
              <button className="action-outline" onClick={exportShiftCsv} disabled={filteredShiftAgents.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
          <div className="surface-panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Ext</th><th className="px-4 py-3">Current Shift</th><th className="px-4 py-3">Change</th></tr>
              </thead>
              <tbody>
                {filteredShiftAgents.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No agents found for the selected search/filter.</td></tr>
                ) : shiftPager.pageItems.map(agent => <tr key={agent.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-accent">{agent.id}</td><td className="px-4 py-3 font-medium">{agent.name}</td><td className="px-4 py-3 font-mono">{agent.extension}</td><td className="px-4 py-3">{agent.shift}</td>
                  <td className="px-4 py-3"><select className="control-field max-w-xs" value={agent.shift} onChange={(event) => { void handleShiftChange(agent.id, event.target.value, agent.name, agent.shift); }}>{allShifts.map(s => <option key={s}>{s}</option>)}</select></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={shiftPager.page}
            totalPages={shiftPager.totalPages}
            totalItems={shiftPager.totalItems}
            pageSize={shiftPager.pageSize}
            onPageChange={shiftPager.setPage}
          />
        </div>
      )}

      {/* RATES */}
      {activeTab === ADMIN_TAB_INDEX.RATES && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[240px]"
              placeholder="Search rates by label or value..."
              value={rateSearch}
              onChange={(event) => setRateSearch(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">{filteredRates.length} of {metalRates.length} rates</p>
          </div>
          <button className="action-outline" onClick={exportRatesCsv} disabled={filteredRates.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
        <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="surface-panel p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Coins className="h-5 w-5 text-accent" />Add Rate</h2>
          <div className="space-y-3">
            <input className="control-field" placeholder="Label (e.g. Gold 22K)" value={newRate.label} onChange={e => setNewRate({ ...newRate, label: e.target.value })} />
            <input className="control-field" placeholder="Value (e.g. ₹6,450/g)" value={newRate.value} onChange={e => setNewRate({ ...newRate, value: e.target.value })} />
            <button className="action-gold w-full justify-center" onClick={() => { if (!newRate.label || !newRate.value) { toast.error("Fill both"); return; } addMetalRate(newRate.label, newRate.value); setNewRate({ label: "", value: "" }); }}><Plus className="h-4 w-4" />Add Rate</button>
          </div>
        </div>
        <div className="surface-panel p-5">
          <h2 className="mb-4 text-lg font-semibold">Current Rates (live ticker)</h2>
          <div className="space-y-3">{filteredRates.length === 0 ? (
            <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
              No rates found for the current search.
            </div>
          ) : filteredRates.map((rate, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <p className="flex-1 text-sm font-medium">{rate.label}</p>
              <input className="control-field max-w-[160px] text-right font-mono" value={rate.value} onChange={e => updateMetalRate(rate.label, e.target.value)} />
              <button onClick={() => { api.updateRate(rate.label, rate.value); toast.success(rate.label + " saved to database"); }} className="action-gold">Update</button>
              <button onClick={() => deleteMetalRate(rate.label)} className="action-outline text-destructive hover:border-destructive/30 hover:text-destructive" title={`Delete ${rate.label}`}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          ))}</div>
          <p className="mt-4 text-xs text-muted-foreground">Changes reflect in the ticker immediately and save to database.</p>
        </div>
        </div>
      </div>}

      {/* BREAK LOGS */}
      {activeTab === ADMIN_TAB_INDEX.BREAK_LOGS && <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="surface-panel p-5 text-center">
            <p className="text-3xl font-semibold text-accent">{breakAgentSummaries.length}</p>
            <p className="text-sm text-muted-foreground">Agents Today</p>
          </div>
          <div className="surface-panel p-5 text-center">
            <p className="text-3xl font-semibold text-accent">{activeBreakAgentsCount}</p>
            <p className="text-sm text-muted-foreground">Agents Currently on Break</p>
          </div>
          <div className="surface-panel p-5 text-center">
            <p className="text-3xl font-semibold text-accent">{filteredBreakTotalDuration}</p>
            <p className="text-sm text-muted-foreground">Total Break Time</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="control-field min-w-[240px]"
              placeholder="Search today by agent, ID, or time..."
              value={breakSearch}
              onChange={(event) => setBreakSearch(event.target.value)}
            />
            <select className="control-field min-w-[180px]" value={breakStatusFilter} onChange={(event) => setBreakStatusFilter(event.target.value)}>
              <option value="all">All break statuses</option>
              <option value="open">Open break</option>
              <option value="completed">Completed break</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{breakAgentSummaries.length} agents across {filteredBreakLogs.length} break logs today</p>
            <button className="action-outline" onClick={exportBreakLogsCsv} disabled={filteredBreakLogs.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        {breakAgentSummaries.length === 0 ? (
          <div className="surface-panel px-4 py-10 text-center text-muted-foreground">
            No break logs yet. Agents can use the Break button in the header.
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {breakSummaryPager.pageItems.map((summary) => {
                const selected = selectedBreakAgentSummary?.agentId === summary.agentId;
                const latestBreakLabel = summary.latestBreakAt
                  ? new Date(summary.latestBreakAt).toLocaleString("en-IN", {
                      timeZone: BUSINESS_TIME_ZONE,
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—";

                return (
                  <button
                    key={summary.agentId}
                    type="button"
                    onClick={() => setSelectedBreakAgentId(summary.agentId)}
                    className={`surface-panel p-5 text-left transition ${selected ? "border-accent bg-accent/5 shadow-[0_0_0_1px_rgba(201,160,74,0.35)]" : "hover:border-accent/30 hover:bg-accent/5"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{summary.agentName}</p>
                        <p className="font-mono text-xs text-accent">{summary.agentId}</p>
                      </div>
                      {summary.openBreakCount > 0 ? (
                        <span className="warning-badge">
                          {getAgentStatusLabel(summary.sessions.find((log) => !log.endTime)?.breakType || "on-break")}
                        </span>
                      ) : (
                        <span className="done-badge">Completed</span>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Break Time</p>
                        <p className="mt-1 font-mono text-base font-semibold">{formatDurationSeconds(summary.totalDurationSeconds)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lunch Break</p>
                        <p className="mt-1 font-mono text-base font-semibold">{formatDurationSeconds(summary.lunchBreakDurationSeconds)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{summary.lunchBreakCount} sessions</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rest Break</p>
                        <p className="mt-1 font-mono text-base font-semibold">{formatDurationSeconds(summary.restroomBreakDurationSeconds)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{summary.restroomBreakCount} sessions</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Break Sessions</p>
                        <p className="mt-1 text-base font-semibold">{summary.breakCount}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Last Break: {latestBreakLabel}</p>
                  </button>
                );
              })}
            </div>
            {selectedBreakAgentSummary ? (
              <div className="surface-panel overflow-hidden">
                <div className="border-b border-border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Break Details</p>
                      <h2 className="mt-1 text-xl font-semibold">{selectedBreakAgentSummary.agentName}</h2>
                      <p className="font-mono text-sm text-accent">{selectedBreakAgentSummary.agentId}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overall Break Time</p>
                        <p className="mt-1 font-mono text-base font-semibold">{formatDurationSeconds(selectedBreakAgentSummary.totalDurationSeconds)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lunch Break</p>
                        <p className="mt-1 font-mono text-base font-semibold">{formatDurationSeconds(selectedBreakAgentSummary.lunchBreakDurationSeconds)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{selectedBreakAgentSummary.lunchBreakCount} sessions</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rest Break</p>
                        <p className="mt-1 font-mono text-base font-semibold">{formatDurationSeconds(selectedBreakAgentSummary.restroomBreakDurationSeconds)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{selectedBreakAgentSummary.restroomBreakCount} sessions</p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                        <p className="mt-1 text-base font-semibold">{selectedBreakAgentSummary.breakCount}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Break Type</th>
                        <th className="px-4 py-3">Break Date</th>
                        <th className="px-4 py-3">Start Time</th>
                        <th className="px-4 py-3">End Time</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBreakAgentSummary.sessions.map((log) => (
                        <tr key={log.id} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{getAgentStatusLabel(log.breakType || "on-break")}</td>
                          <td className="px-4 py-3">{log.breakDate || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{log.startTime || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {log.startedAt || log.createdAt
                                ? new Date(log.startedAt || log.createdAt || "").toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{log.endTime || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {log.endedAt
                                ? new Date(log.endedAt).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono">{log.duration || "—"}</td>
                          <td className="px-4 py-3">
                            {log.endTime ? <span className="done-badge">Completed</span> : <span className="warning-badge">On Break</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
        <TablePagination
          page={breakSummaryPager.page}
          totalPages={breakSummaryPager.totalPages}
          totalItems={breakSummaryPager.totalItems}
          pageSize={breakSummaryPager.pageSize}
          onPageChange={breakSummaryPager.setPage}
        />
      </div>}

      {/* INCOMING CALL QUEUE */}
      {activeTab === ADMIN_TAB_INDEX.INCOMING_CALL_QUEUE && <IncomingCallQueueTab active={activeTab === ADMIN_TAB_INDEX.INCOMING_CALL_QUEUE} />}

      {/* MISSED CALLS */}
      {activeTab === ADMIN_TAB_INDEX.MISSED_CALLS && <MissedCallsTab active={activeTab === ADMIN_TAB_INDEX.MISSED_CALLS} />}

      {/* AUTO DIAL */}
      {activeTab === ADMIN_TAB_INDEX.AUTO_DIAL && <AutoDialTab active={activeTab === ADMIN_TAB_INDEX.AUTO_DIAL} />}

      {/* STATUS FOLLOW-UP */}
      {activeTab === ADMIN_TAB_INDEX.STATUS_FOLLOW_UP && <StatusFollowUpTab active={activeTab === ADMIN_TAB_INDEX.STATUS_FOLLOW_UP} />}

      {/* CUSTOMER DATA */}
      {activeTab === ADMIN_TAB_INDEX.CUSTOMER_DATA && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="surface-panel p-5 text-center">
              <p className="text-3xl font-semibold text-accent">{conversionDataUnavailable ? "N/A" : filteredConversionRows.length}</p>
              <p className="text-sm text-muted-foreground">Bill Records</p>
            </div>
            <div className="surface-panel p-5 text-center">
              <p className="text-3xl font-semibold text-accent">{conversionDataUnavailable ? "N/A" : uniqueFilteredContacts}</p>
              <p className="text-sm text-muted-foreground">Unique Contacts</p>
            </div>
            <div className="surface-panel p-5 text-center">
              <p className="text-3xl font-semibold text-accent">{conversionDataUnavailable ? "N/A" : filteredConversionRows.filter((row) => row.status).length}</p>
              <p className="text-sm text-muted-foreground">With Status</p>
            </div>
            <div className="surface-panel p-5 text-center">
              <p className="text-3xl font-semibold text-accent">{conversionDataUnavailable ? "N/A" : filteredConversionRows.filter((row) => row.grossW).length}</p>
              <p className="text-sm text-muted-foreground">With Gross W</p>
            </div>
            <div className="surface-panel p-5 text-center">
              <p className="text-3xl font-semibold text-accent">{conversionDataUnavailable ? "N/A" : filteredConversionRows.filter((row) => row.netW).length}</p>
              <p className="text-sm text-muted-foreground">With Net W</p>
            </div>
          </div>

          <div className="surface-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
              <input
                className="control-field max-w-md"
                placeholder="Search by customer, contact, first agent, type, branch, status, gross/net W..."
                value={conversionSearch}
                onChange={(event) => setConversionSearch(event.target.value)}
              />
                <input
                  className="control-field"
                  type="date"
                  value={conversionDateFilter}
                  onChange={(event) => setConversionDateFilter(event.target.value)}
                />
                {conversionDateFilter && (
                  <button className="action-outline" onClick={() => setConversionDateFilter("")}>
                    Clear Date
                  </button>
                )}
                {conversionLastSync && (
                  <span className="text-xs text-muted-foreground">
                    Last billing sync: {conversionLastSync} IST
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button className="action-outline" onClick={exportCustomerDataCsv} disabled={conversionLoading || filteredConversionRows.length === 0}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
                <button className="action-gold" onClick={() => void loadConversionRows({ force: true })} disabled={conversionLoading}>
                  <RefreshCw className="h-4 w-4" />
                  {conversionLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
          </div>

          {conversionError && <p role="alert" className="text-sm text-destructive">{conversionError}</p>}
          <div className="surface-panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Bill ID</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">First Agent</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Disposition Category</th>
                  <th className="px-4 py-3">Gross W</th>
                  <th className="px-4 py-3">Net W</th>
                </tr>
              </thead>
              <tbody>
                {filteredConversionRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                      {conversionLoading ? "Loading customer data..." : conversionError ? "Customer data is temporarily unavailable. Retry Refresh." : "No saved customer records found"}
                    </td>
                  </tr>
                ) : conversionPager.pageItems.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{row.customerName || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.billId || "—"}</td>
                    <td className="px-4 py-3 font-mono text-accent">{row.contact}</td>
                    <td className="px-4 py-3">{row.firstAgentName || "—"}</td>
                    <td className="px-4 py-3">{row.type || "—"}</td>
                    <td className="px-4 py-3">{resolveBranchLabel(row.branch) || "—"}</td>
                    <td className="px-4 py-3">{row.date || "—"}</td>
                    <td className="px-4 py-3">{row.status ? <span className="done-badge">{row.status}</span> : "—"}</td>
                    <td className="px-4 py-3">{row.source || "—"}</td>
                    <td className="px-4 py-3">{getCustomerDataDispositionCategory(row) || "—"}</td>
                    <td className="px-4 py-3">{row.grossW || "—"}</td>
                    <td className="px-4 py-3">{row.netW || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={conversionPager.page}
            totalPages={conversionPager.totalPages}
            totalItems={conversionPager.totalItems}
            pageSize={conversionPager.pageSize}
            onPageChange={conversionPager.setPage}
            disabled={conversionLoading}
          />
        </div>
      )}

      {/* JUSTDIAL LEADS */}
      {activeTab === ADMIN_TAB_INDEX.JUSTDIAL_LEAD && <JustDialLeadsTab active={activeTab === ADMIN_TAB_INDEX.JUSTDIAL_LEAD} />}
      {activeTab === ADMIN_TAB_INDEX.WEBSITE_LEAD && <WebsiteLeadsTab active={activeTab === ADMIN_TAB_INDEX.WEBSITE_LEAD} />}
      {activeTab === ADMIN_TAB_INDEX.GOOGLE_LEAD && <GoogleLeadsTab active={activeTab === ADMIN_TAB_INDEX.GOOGLE_LEAD} />}
      {activeTab === ADMIN_TAB_INDEX.META_LEAD && <MetaLeadsTab active={activeTab === ADMIN_TAB_INDEX.META_LEAD} />}
      {activeTab === ADMIN_TAB_INDEX.BLOG_LEAD && <BlogsLeadsTab active={activeTab === ADMIN_TAB_INDEX.BLOG_LEAD} />}
      {activeTab === ADMIN_TAB_INDEX.SESSION_HISTORY && <SessionHistoryTab breakLogs={breakLogs} />}
      {activeTab === ADMIN_TAB_INDEX.SMS_LOG && <SmsLogsTab />}
    </motion.div>
  );
}
