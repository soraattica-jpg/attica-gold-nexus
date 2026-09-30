import { toast } from "sonner";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Ban, Filter, Phone, Plus, X } from "lucide-react";
import { useRealBranches } from "@/hooks/useRealBranches";
import { useAgentDirectory } from "@/hooks/useAgentDirectory";
import { useAuth } from "@/contexts/AuthContext";
import { useCallCenter, type ManagedCall } from "@/contexts/CallCenterContext";
import TablePagination from "@/components/TablePagination";
import {
  api,
  buildApiUrl,
  resolveBackendUrl,
  type CallsByPhoneResult,
  type CallsListResult,
  type CustomerProfileResult,
  type IntakeFormHistoryResult,
} from "@/lib/api";
import {
  findBestRecordingMatch,
  findRecordingByName,
} from "@/lib/callRecordingMatch";
import { normalizeCallDuration } from "@/lib/callDuration";
import { getCallDisplayCustomerName } from "@/lib/callDisplay";
import { hidePhoneDisplay, normalizePhoneNumber } from "@/lib/phone";
import { fetchPlayableRecordingBlob } from "@/lib/recordingPlayback";
import { getBusinessDateString } from "@/lib/businessDate";
import { getCallDisplayDate, getCallDisplayTime, getCallDisplayTimestamp } from "@/lib/callDateTime";
import { getCallCustomerUid } from "@/lib/customerIdentity";
import {
  DISPOSITION_CATEGORY_OPTIONS,
  DISPOSITION_GROUPS,
  getCallCategory,
  getDispositionCategory,
  getDispositionLabel,
} from "@/lib/dispositions";
import { getVisitTimelineSummary } from "@/lib/visitTimeline";
import { isAdminRole } from "@/lib/roles";
import { dedupeCallInteractions } from "@/lib/callMetrics";

type RecordingEntry =
  | string
    | {
      name?: string;
      filename?: string;
      file?: string;
      url?: string;
      playbackUrl?: string;
      downloadUrl?: string;
      path?: string;
      date?: string;
      size?: number;
    };

type NormalizedRecordingEntry = {
  name: string;
  candidates: string[];
  haystack: string;
  recordedAt: number | null;
  size: number;
};

interface CallsPageProps {
  direction: "incoming" | "outgoing";
}

const CALLS_TABLE_PAGE_SIZE = 50;
const EMPTY_CALLS_LIST_RESULT: CallsListResult = {
  page: 1,
  limit: CALLS_TABLE_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  results: [],
};

const EMPTY_HISTORY_RESULT: CallsByPhoneResult = {
  phone: "",
  total: 0,
  inbound: 0,
  outbound: 0,
  results: [],
};

const EMPTY_PROFILE_RESULT: CustomerProfileResult = {
  phone: "",
  hasSavedDetails: false,
  customerName: "",
  mob2: "",
  location: "",
  district: "",
  language: "",
  businessType: "",
  purpose: "",
  metalType: "",
  grams: "",
  releaseGrossAmount: "",
  releasingAmount: "",
  bankName: "",
  onlinePrice: "",
  pricePerGram: "",
  advertisement: "",
  lead: "",
  formStatus: "",
  statusFollowUpAt: "",
  branch: "",
  notes: "",
};

const EMPTY_INTAKE_HISTORY_RESULT: IntakeFormHistoryResult = {
  phone: "",
  total: 0,
  results: [],
};

const normalizeLookupValue = (value?: string) => String(value || "").trim();

const getLeadSourceDisplay = (call: Pick<ManagedCall, "leadSource">) => {
  const leadSource = normalizeLookupValue(call.leadSource);
  return leadSource || "Manual";
};

const getFullDispositionDisplay = (value?: string) => {
  const rawValue = normalizeLookupValue(value);
  return getDispositionLabel(rawValue) || rawValue;
};

const getCallDispositionCategory = (call: ManagedCall) => (
  getCallCategory(call) || call.dispositionCategory || getDispositionCategory(call.callbackStatus)
);

const getDefaultFollowUpAt = () => {
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next.toISOString().slice(0, 16);
};

interface CallsTableRowProps {
  call: ManagedCall;
  shouldMaskPhone: boolean;
  showLeadSourceColumn: boolean;
  showDispositionCategoryControls: boolean;
  canAccessRecordings: boolean;
  isAdminUser: boolean;
  userRole?: string;
  playingId: string | null;
  blockingPhone: string | null;
  isBlocked: boolean;
  resolveAgentName: (agentId?: string, fallbackName?: string) => string;
  onView: (call: ManagedCall) => void;
  onCallback: (phone: string) => void;
  onAddFollowUp: (call: ManagedCall) => void;
  onOpenCustomerHistory: (phone: string) => void;
  onToggleBlockedPhone: (call: ManagedCall) => void;
  onPlayRecording: (callId: string, call: ManagedCall) => void;
  onDownloadRecording: (call: ManagedCall) => void;
}

const CallsTableRow = memo(function CallsTableRow({
  call,
  shouldMaskPhone,
  showLeadSourceColumn,
  showDispositionCategoryControls,
  canAccessRecordings,
  isAdminUser,
  userRole,
  playingId,
  blockingPhone,
  isBlocked,
  resolveAgentName,
  onView,
  onCallback,
  onAddFollowUp,
  onOpenCustomerHistory,
  onToggleBlockedPhone,
  onPlayRecording,
  onDownloadRecording,
}: CallsTableRowProps) {
  const normalizedPhone = normalizePhoneNumber(call.callerId);
  const customerUid = getCallCustomerUid(call);
  const timelineSummary = getVisitTimelineSummary(call);
  const phoneLabel = (shouldMaskPhone ? hidePhoneDisplay(call.callerId) : call.callerId) || "—";

  return (
    <tr className="border-t border-border text-sm">
      <td className="px-4 py-3">
        <p className="font-medium">{getCallDisplayCustomerName(call, { maskPhone: shouldMaskPhone })}</p>
        {normalizedPhone && customerUid ? (
          <button
            type="button"
            className="mt-1 block font-mono text-[11px] font-semibold text-accent underline-offset-2 hover:underline"
            onClick={() => onOpenCustomerHistory(normalizedPhone)}
            title="Open customer call history"
          >
            {customerUid}
          </button>
        ) : null}
        {normalizedPhone ? (
          <button
            type="button"
            className="block text-left text-xs text-muted-foreground underline-offset-2 hover:text-accent hover:underline"
            onClick={() => onOpenCustomerHistory(normalizedPhone)}
            title="Open customer call history"
          >
            {phoneLabel}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">{phoneLabel}</p>
        )}
      </td>
      <td className="px-4 py-3">{call.branch || "—"}</td>
      {showLeadSourceColumn ? (
        <td className="px-4 py-3">
          <span className="done-badge text-xs">{getLeadSourceDisplay(call)}</span>
        </td>
      ) : null}
      <td className="px-4 py-3">{resolveAgentName(call.agentId, call.agentName)}</td>
      <td className="px-4 py-3 font-mono text-xs">{getCallDisplayTime(call) || "—"}</td>
      <td className="px-4 py-3 font-mono text-xs">{normalizeCallDuration(call.duration)}</td>
      <td className="min-w-[210px] max-w-[280px] px-4 py-3 align-top">
        {call.callbackStatus ? (
          <span
            className="done-badge rounded-xl text-left text-xs leading-5 whitespace-normal break-words"
            title={getFullDispositionDisplay(call.callbackStatus)}
          >
            {getFullDispositionDisplay(call.callbackStatus)}
          </span>
        ) : "—"}
        {timelineSummary ? (
          <p className="mt-1 text-[11px] text-accent">
            {timelineSummary.label}: {timelineSummary.formatted}
          </p>
        ) : null}
      </td>
      {showDispositionCategoryControls ? (
        <td className="px-4 py-3">
          {getCallDispositionCategory(call) ? (
            <span className="done-badge text-xs">{getCallDispositionCategory(call)}</span>
          ) : "—"}
        </td>
      ) : null}
      {canAccessRecordings ? (
        <td className="px-4 py-3">
          <div className="flex gap-1">
            {call.hasRecording ? (
              <>
                <button className={playingId === call.id ? "warning-badge cursor-pointer text-xs" : "success-badge cursor-pointer text-xs"} onClick={() => onPlayRecording(call.id, call)}>{playingId === call.id ? "Stop" : "Play"}</button>
                <button className="done-badge cursor-pointer text-xs" onClick={() => onDownloadRecording(call)}>Download</button>
              </>
            ) : "—"}
          </div>
        </td>
      ) : null}
      <td className="px-4 py-3">{call.smsSent ? <span className="success-badge text-xs">Sent</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          {userRole === "agent" ? (
            <button className="action-outline text-xs" onClick={() => onView(call)}>View</button>
          ) : null}
          <button className="action-outline text-xs" onClick={() => onCallback(call.callerId)}>Callback</button>
          <button className="action-gold text-xs" onClick={() => onAddFollowUp(call)}><Plus className="h-3 w-3" />Follow-Up</button>
          {isAdminUser ? (
            <button
              className={isBlocked
                ? "inline-flex items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20"
                : "inline-flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20"
              }
              onClick={() => onToggleBlockedPhone(call)}
              disabled={blockingPhone === normalizedPhone}
            >
              <Ban className="h-3 w-3" />
              {blockingPhone === normalizedPhone
                ? "Saving..."
                : isBlocked
                  ? "Blocked"
                  : "Normal"}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
});

const buildIntakeRecordLookupKeys = (call: ManagedCall | null) => {
  if (!call) return [];

  const keys = new Set<string>();
  const intakeToken = normalizeLookupValue(call.intakeToken);
  const callId = normalizeLookupValue(call.id);

  if (intakeToken) {
    keys.add(`token:${intakeToken}`);
  }
  if (callId) {
    keys.add(`call:${callId}`);
  }

  return Array.from(keys);
};

const findMatchingIntakeRecord = (records: ManagedCall[], selectedCall: ManagedCall | null) => {
  const lookupKeys = new Set(buildIntakeRecordLookupKeys(selectedCall));
  if (lookupKeys.size === 0) return null;

  return records.find((record) => (
    buildIntakeRecordLookupKeys(record).some((key) => lookupKeys.has(key))
  )) || null;
};

export default function CallsPage({ direction }: CallsPageProps) {
  const { user } = useAuth();
  const isAdminUser = isAdminRole(user?.role);
  const shouldMaskPhone = user?.role === "agent";
  const canAccessRecordings = user?.role !== "agent";
  const { addFollowUp, prefillDialedNumber } = useCallCenter();
  const { branches: realBranchList } = useRealBranches();
  const { agents: liveAgents, resolveAgentName } = useAgentDirectory();
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    disposition: "all",
    dispositionCategory: "all",
    language: "all",
    branch: "all",
    date: getBusinessDateString(new Date()),
    agent: "all",
  });
  const [listPage, setListPage] = useState(1);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<ManagedCall | null>(null);
  const [callsList, setCallsList] = useState<CallsListResult>(EMPTY_CALLS_LIST_RESULT);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedIntakeRecord, setSelectedIntakeRecord] = useState<ManagedCall | null>(null);
  const [selectedCallLoading, setSelectedCallLoading] = useState(false);
  const [blockedPhones, setBlockedPhones] = useState<Set<string>>(new Set());
  const [blockingPhone, setBlockingPhone] = useState<string | null>(null);
  const [historyPhone, setHistoryPhone] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResult, setHistoryResult] = useState<CallsByPhoneResult>(EMPTY_HISTORY_RESULT);
  const [historyProfile, setHistoryProfile] = useState<CustomerProfileResult>(EMPTY_PROFILE_RESULT);
  const [historyIntakeResult, setHistoryIntakeResult] = useState<IntakeFormHistoryResult>(EMPTY_INTAKE_HISTORY_RESULT);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const recordingsCacheRef = useRef<NormalizedRecordingEntry[] | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioObjectUrlRef.current) {
        URL.revokeObjectURL(audioObjectUrlRef.current);
        audioObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setListPage(1);
  }, [direction, debouncedSearch, filters.agent, filters.branch, filters.date, filters.disposition, filters.dispositionCategory, filters.language, filters.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 400);

    return () => window.clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadPageCalls = async () => {
      setTableLoading(true);
      try {
        const nextRows = await api.getCallsList({
          ...(filters.date ? { date: filters.date } : {}),
          ...(user?.role === "agent" ? { agentId: user.id } : {}),
          ...(isAdminUser && filters.agent !== "all" ? { agentId: filters.agent } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(filters.status !== "all" ? { status: filters.status } : {}),
          ...(filters.disposition !== "all" ? { disposition: filters.disposition } : {}),
          ...(filters.dispositionCategory !== "all" ? { dispositionCategory: filters.dispositionCategory } : {}),
          ...(filters.language !== "all" ? { language: filters.language } : {}),
          ...(filters.branch !== "all" ? { branch: filters.branch } : {}),
          direction,
          page: listPage,
          limit: CALLS_TABLE_PAGE_SIZE,
          signal: controller.signal,
        });

        if (cancelled || controller.signal.aborted) return;
        setCallsList(nextRows);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to load call list:", error);
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setTableLoading(false);
        }
      }
    };

    void loadPageCalls();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearch, direction, filters.agent, filters.branch, filters.date, filters.disposition, filters.dispositionCategory, filters.language, filters.status, isAdminUser, listPage, user?.id, user?.role]);

  useEffect(() => {
    if (callsList.totalPages > 0 && listPage > callsList.totalPages) {
      setListPage(callsList.totalPages);
    }
  }, [callsList.totalPages, listPage]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedCall?.callerId) {
      setSelectedIntakeRecord(null);
      setSelectedCallLoading(false);
      return;
    }

    const loadSelectedCallDetails = async () => {
      setSelectedCallLoading(true);
      try {
        const history = await api.getIntakeFormHistory(selectedCall.callerId);
        if (cancelled) return;

        const intakeHistory = Array.isArray(history.results)
          ? history.results.filter((row): row is ManagedCall => Boolean(row))
          : [];
        setSelectedIntakeRecord(findMatchingIntakeRecord(intakeHistory, selectedCall));
      } catch (error) {
        console.error("Failed to load saved intake details for call:", error);
        if (!cancelled) {
          setSelectedIntakeRecord(null);
        }
      } finally {
        if (!cancelled) {
          setSelectedCallLoading(false);
        }
      }
    };

    void loadSelectedCallDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedCall?.callerId, selectedCall?.id, selectedCall?.intakeToken]);

  useEffect(() => {
    if (!isAdminUser) {
      setBlockedPhones(new Set());
      return;
    }

    let cancelled = false;
    const loadBlockedNumbers = async () => {
      const rows = await api.getBlockedNumbers();
      if (cancelled) return;
      setBlockedPhones(new Set(
        rows
          .map((row) => normalizePhoneNumber(row.phone))
          .filter(Boolean),
      ));
    };

    void loadBlockedNumbers();
    const interval = window.setInterval(() => {
      void loadBlockedNumbers();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAdminUser]);

  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
    setPlayingId(null);
  };

  const toRecordingUrl = useCallback((value?: string) => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? resolveBackendUrl(trimmed)
      : null;
  }, []);

  const normalizeRecordingEntry = useCallback((entry: RecordingEntry): NormalizedRecordingEntry | null => {
    const rawName = typeof entry === "string" ? entry : entry.name || entry.filename || entry.file || "";
    const name = rawName.trim();
    const encodedName = name ? encodeURIComponent(name) : "";
    const directCandidates = typeof entry === "string"
      ? []
      : [entry.playbackUrl, entry.downloadUrl, entry.url, entry.path]
          .map((value) => toRecordingUrl(value))
          .filter((value): value is string => Boolean(value));
    const candidates = Array.from(new Set([
      ...directCandidates,
      ...(encodedName ? [buildApiUrl(`/recordings/${encodedName}`), resolveBackendUrl(`/recordings/${encodedName}`)] : []),
    ]));

    if (!name && candidates.length === 0) {
      return null;
    }

    const resolvedName = name || decodeURIComponent(candidates[0]?.split("/").pop() || "").trim();
    const filenameTimestampMatch = resolvedName.match(/^(\d{8})-(\d{6})-/);
    const filenameRecordedAt = filenameTimestampMatch
      ? Date.UTC(
          Number(filenameTimestampMatch[1].slice(0, 4)),
          Number(filenameTimestampMatch[1].slice(4, 6)) - 1,
          Number(filenameTimestampMatch[1].slice(6, 8)),
          Number(filenameTimestampMatch[2].slice(0, 2)),
          Number(filenameTimestampMatch[2].slice(2, 4)),
          Number(filenameTimestampMatch[2].slice(4, 6)),
        )
      : Number.NaN;
    const catalogRecordedAt = typeof entry === "string" ? Number.NaN : new Date(entry.date || "").getTime();

    return {
      name: resolvedName,
      candidates,
      haystack: `${resolvedName} ${candidates.join(" ")}`.toLowerCase(),
      recordedAt: Number.isFinite(filenameRecordedAt)
        ? filenameRecordedAt
        : (Number.isFinite(catalogRecordedAt) ? catalogRecordedAt : null),
      size: typeof entry === "string" ? 0 : Number(entry.size || 0),
    };
  }, [toRecordingUrl]);

  const getRecordingCatalog = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && recordingsCacheRef.current) {
      return recordingsCacheRef.current;
    }

    const rawRecordings = await api.getRecordings();
    const nextCatalog = (Array.isArray(rawRecordings) ? rawRecordings : [])
      .map((entry) => normalizeRecordingEntry(entry as RecordingEntry))
      .filter((entry): entry is NormalizedRecordingEntry => Boolean(entry));
    recordingsCacheRef.current = nextCatalog;
    return nextCatalog;
  }, [normalizeRecordingEntry]);

  const resolveRecordingForCall = async (call: ManagedCall) => {
    const cachedCatalog = await getRecordingCatalog();
    const exactMatch = findRecordingByName(cachedCatalog, call.recordingName);
    if (exactMatch) return exactMatch;

    const cachedMatch = findBestRecordingMatch(cachedCatalog, call);
    if (cachedMatch) return cachedMatch;

    const refreshedCatalog = await getRecordingCatalog(true);
    const refreshedExactMatch = findRecordingByName(refreshedCatalog, call.recordingName);
    if (refreshedExactMatch) return refreshedExactMatch;
    return findBestRecordingMatch(refreshedCatalog, call);
  };

  const fetchRecordingBlob = async (recording: NormalizedRecordingEntry) => (
    fetchPlayableRecordingBlob(recording.candidates)
  );

  const playRecording = async (callId: string, call: ManagedCall) => {
    if (playingId === callId) {
      stopPlayback();
      return;
    }

    stopPlayback();

    const recording = await resolveRecordingForCall(call);
    if (!recording) {
      toast.error("Recording not found for this call");
      return;
    }

    const blob = await fetchRecordingBlob(recording);
    if (!blob) {
      toast.error(`Cannot fetch recording: ${recording.name || call.id}`);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    audioObjectUrlRef.current = objectUrl;
    const audio = new Audio(objectUrl);
    audio.onended = () => stopPlayback();
    audio.onerror = () => {
      stopPlayback();
      toast.error(`Cannot play recording: ${recording.name || call.id}`);
    };
    audio.play().catch((error) => {
      console.error("Playback failed:", error);
      stopPlayback();
      toast.error("Playback failed");
    });
    audioRef.current = audio;
    setPlayingId(callId);
  };

  const downloadRecording = async (call: ManagedCall) => {
    const recording = await resolveRecordingForCall(call);
    if (!recording) {
      toast.error("No recording found for this call");
      return;
    }

    const blob = await fetchRecordingBlob(recording);
    if (!blob) {
      toast.error(`Cannot download recording: ${recording.name || call.id}`);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const filename = recording.name || `recording-${call.id}.wav`;
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast.success(`Downloading: ${filename}`);
  };

  const toggleBlockedPhone = useCallback(async (call: ManagedCall) => {
    if (!isAdminUser) return;

    const phone = normalizePhoneNumber(call.callerId);
    if (!phone) {
      toast.error("No valid phone number to block");
      return;
    }

    const nextBlocked = !blockedPhones.has(phone);
    setBlockingPhone(phone);
    const result = await api.setBlockedNumber(phone, {
      blocked: nextBlocked,
      blockedById: user.id,
      blockedByName: user.name,
      sourceCallId: call.id,
      note: `${direction === "incoming" ? "Incoming" : "Outgoing"} tab toggle`,
    });
    setBlockingPhone(null);

    if (result.error) {
      toast.error(nextBlocked ? "Failed to block number" : "Failed to unblock number");
      return;
    }

    setBlockedPhones((current) => {
      const next = new Set(current);
      if (nextBlocked) next.add(phone);
      else next.delete(phone);
      return next;
    });
    toast.success(nextBlocked ? "Number blocked" : "Number unblocked");
  }, [blockedPhones, direction, isAdminUser, user?.id, user?.name]);

  const openCustomerHistory = useCallback(async (phone: string) => {
    const normalizedPhone = normalizePhoneNumber(phone);
    if (normalizedPhone.length !== 10) {
      toast.error("No valid customer number for history");
      return;
    }

    setHistoryPhone(normalizedPhone);
    setHistoryLoading(true);
    setHistoryProfile({ ...EMPTY_PROFILE_RESULT, phone: normalizedPhone });
    setHistoryIntakeResult({ ...EMPTY_INTAKE_HISTORY_RESULT, phone: normalizedPhone });
    setHistoryResult({ ...EMPTY_HISTORY_RESULT, phone: normalizedPhone });

    try {
      const [profileResult, intakeHistoryResult, callHistoryResult] = await Promise.allSettled([
        api.getCustomerProfile(normalizedPhone),
        api.getIntakeFormHistory(normalizedPhone),
        api.getCustomerCallHistory(normalizedPhone),
      ]);

      setHistoryProfile(profileResult.status === "fulfilled"
        ? profileResult.value
        : { ...EMPTY_PROFILE_RESULT, phone: normalizedPhone });
      setHistoryIntakeResult(intakeHistoryResult.status === "fulfilled"
        ? intakeHistoryResult.value
        : { ...EMPTY_INTAKE_HISTORY_RESULT, phone: normalizedPhone });
      setHistoryResult(callHistoryResult.status === "fulfilled"
        ? callHistoryResult.value
        : { ...EMPTY_HISTORY_RESULT, phone: normalizedPhone });

      if (
        profileResult.status === "rejected" &&
        intakeHistoryResult.status === "rejected" &&
        callHistoryResult.status === "rejected"
      ) {
        toast.error("Unable to load customer history right now");
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const closeCustomerHistory = useCallback(() => {
    setHistoryPhone("");
    setHistoryLoading(false);
    setHistoryResult(EMPTY_HISTORY_RESULT);
    setHistoryProfile(EMPTY_PROFILE_RESULT);
    setHistoryIntakeResult(EMPTY_INTAKE_HISTORY_RESULT);
  }, []);

  const visibleCalls = useMemo(() => {
    return (Array.isArray(callsList.results) ? [...callsList.results] : [])
      .sort((left, right) => {
        const timestampDelta = getCallDisplayTimestamp(right) - getCallDisplayTimestamp(left);
        if (timestampDelta !== 0) return timestampDelta;
        return String(right.id || "").localeCompare(String(left.id || ""));
      });
  }, [callsList.results]);

  const visibleHistoryCalls = useMemo(
    () => dedupeCallInteractions(historyResult.results),
    [historyResult.results],
  );
  const visibleIntakeHistory = useMemo(
    () => dedupeCallInteractions(historyIntakeResult.results),
    [historyIntakeResult.results],
  );
  const historyCustomerName = useMemo(() => {
    if (historyProfile.customerName) return historyProfile.customerName;
    if (visibleIntakeHistory[0]) return getCallDisplayCustomerName(visibleIntakeHistory[0], { maskPhone: shouldMaskPhone });
    if (visibleHistoryCalls[0]) return getCallDisplayCustomerName(visibleHistoryCalls[0], { maskPhone: shouldMaskPhone });
    return "";
  }, [historyProfile.customerName, shouldMaskPhone, visibleHistoryCalls, visibleIntakeHistory]);
  const hasCustomerHistoryData = Boolean(
    historyProfile.hasSavedDetails ||
    visibleIntakeHistory.length > 0 ||
    visibleHistoryCalls.length > 0,
  );

  const agents = useMemo(
    () => (
      liveAgents
        .filter((agent) => agent.role === "agent")
        .sort((left, right) => (left.name || left.id).localeCompare(right.name || right.id))
    ),
    [liveAgents],
  );

  const selectedCallDetails = useMemo(() => {
    if (!selectedCall) return null;
    const savedIntakeDetails = selectedIntakeRecord;

    return {
      ...selectedCall,
      intakeToken: selectedCall.intakeToken || savedIntakeDetails?.intakeToken || "",
      callerName: savedIntakeDetails?.callerName || savedIntakeDetails?.customerName || selectedCall.callerName || "",
      customerName: savedIntakeDetails?.customerName || savedIntakeDetails?.callerName || selectedCall.customerName || "",
      displayCustomerName: selectedCall.displayCustomerName || savedIntakeDetails?.displayCustomerName || savedIntakeDetails?.customerName || savedIntakeDetails?.callerName || "",
      mob2: savedIntakeDetails?.mob2 || selectedCall.mob2 || "",
      district: savedIntakeDetails?.district || selectedCall.district || "",
      place: savedIntakeDetails?.place || selectedCall.place || "",
      language: savedIntakeDetails?.language || selectedCall.language || "",
      branch: savedIntakeDetails?.branch || selectedCall.branch || "",
      leadSource: savedIntakeDetails?.leadSource || selectedCall.leadSource || "",
      businessType: savedIntakeDetails?.businessType || selectedCall.businessType || "",
      purpose: savedIntakeDetails?.purpose || selectedCall.purpose || "",
      metalType: savedIntakeDetails?.metalType || selectedCall.metalType || "",
      grams: savedIntakeDetails?.grams || selectedCall.grams || "",
      releasingAmount: savedIntakeDetails?.releasingAmount || selectedCall.releasingAmount || "",
      bankName: savedIntakeDetails?.bankName || selectedCall.bankName || "",
      lead: savedIntakeDetails?.lead || selectedCall.lead || "",
      advertisement: savedIntakeDetails?.advertisement || selectedCall.advertisement || "",
      formStatus: savedIntakeDetails?.formStatus || selectedCall.formStatus || "",
      statusFollowUpAt: savedIntakeDetails?.statusFollowUpAt || selectedCall.statusFollowUpAt || "",
      notes: savedIntakeDetails?.notes || selectedCall.notes || "",
    };
  }, [selectedCall, selectedIntakeRecord]);

  const showLeadSourceColumn = true;
  const showDispositionCategoryControls = user?.role !== "agent";
  const emptyTableColSpan = 8
    + (showDispositionCategoryControls ? 1 : 0)
    + (canAccessRecordings ? 1 : 0)
    + (showLeadSourceColumn ? 1 : 0);
  const handleViewCall = useCallback((call: ManagedCall) => {
    setSelectedCall(call);
  }, []);
  const handleCallback = useCallback((phone: string) => {
    prefillDialedNumber(phone);
  }, [prefillDialedNumber]);
  const handleAddFollowUp = useCallback((call: ManagedCall) => {
    addFollowUp({
      customerName: getCallDisplayCustomerName(call),
      phone: call.callerId,
      branch: call.branch ?? "",
      followUpAt: getDefaultFollowUpAt(),
      notes: "Follow-up from " + call.id,
      callId: call.id,
    });
  }, [addFollowUp]);
  const handleToggleBlockedPhone = useCallback((call: ManagedCall) => {
    void toggleBlockedPhone(call);
  }, [toggleBlockedPhone]);
  const handlePlayRecording = useCallback((callId: string, call: ManagedCall) => {
    void playRecording(callId, call);
  }, [playRecording]);
  const handleDownloadRecording = useCallback((call: ManagedCall) => {
    void downloadRecording(call);
  }, [downloadRecording]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">Call Management</p>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><Phone className="h-6 w-6 text-accent" />{direction === "incoming" ? "Incoming Calls" : "Outgoing Calls"}</h1>
      </div>

      <div className="surface-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Filter className="h-4 w-4 text-accent" />Filters</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <input className="control-field" placeholder="Search number, customer, branch" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <input className="control-field" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
          <select className="control-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="all">All status</option><option value="answered">Answered</option><option value="missed">Missed</option><option value="failed">Failed</option><option value="transferred">Transferred</option><option value="active">Active</option><option value="on-hold">On Hold</option><option value="completed">Completed</option></select>
          <select className="control-field" value={filters.disposition} onChange={(e) => setFilters({ ...filters, disposition: e.target.value })}>
            <option value="all">All dispositions</option>
            {Object.entries(DISPOSITION_GROUPS).map(([groupName, items]) => (
              <optgroup key={groupName} label={groupName}>
                {items.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {showDispositionCategoryControls ? (
            <select className="control-field" value={filters.dispositionCategory} onChange={(e) => setFilters({ ...filters, dispositionCategory: e.target.value })}>
              <option value="all">All categories</option>
              {DISPOSITION_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          ) : null}
          <select className="control-field" value={filters.language} onChange={(e) => setFilters({ ...filters, language: e.target.value })}>
                  <option value="all">All languages</option>
                  <option value="Kannada">Kannada</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Telugu">Telugu</option>
                  <option value="Hindi">Hindi</option>
                  <option value="English">English</option>
                </select>
          <select value={filters.branch} onChange={e => setFilters(prev => ({...prev, branch: e.target.value}))} className="control-field text-sm">
                  <option value="all">All branches</option>
                  {realBranchList.map(b => <option key={b.id} value={b.name}>{b.name} - {b.city}</option>)}
                </select>
          {isAdminUser ? (
                  <select className="control-field" value={filters.agent} onChange={(e) => setFilters({ ...filters, agent: e.target.value })}>
                    <option value="all">All agents</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                    ))}
                  </select>
                ) : null}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm text-muted-foreground">
          <div>{callsList.total} matching calls</div>
          <div>{tableLoading ? "Loading page..." : `Page ${callsList.page} of ${Math.max(callsList.totalPages, 1)}`}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-muted-foreground text-xs">
            <tr>
              <th className="px-4 py-3">Customer / Number</th>
              <th className="px-4 py-3">Branch</th>
              {showLeadSourceColumn ? <th className="px-4 py-3">Source</th> : null}
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Duration</th>
              <th className="min-w-[210px] px-4 py-3">Disposition</th>
              {showDispositionCategoryControls ? <th className="px-4 py-3">Category</th> : null}
              {canAccessRecordings ? <th className="px-4 py-3">Recording</th> : null}
              <th className="px-4 py-3">SMS</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
            <tbody>
              {visibleCalls.map((call) => {
                const normalizedPhone = normalizePhoneNumber(call.callerId);
                return (
                  <CallsTableRow
                    key={call.id}
                    call={call}
                    shouldMaskPhone={shouldMaskPhone}
                    showLeadSourceColumn={showLeadSourceColumn}
                    showDispositionCategoryControls={showDispositionCategoryControls}
                    canAccessRecordings={canAccessRecordings}
                    isAdminUser={isAdminUser}
                    userRole={user?.role}
                    playingId={playingId}
                    blockingPhone={blockingPhone}
                    isBlocked={blockedPhones.has(normalizedPhone)}
                    resolveAgentName={resolveAgentName}
                    onView={handleViewCall}
                    onCallback={handleCallback}
                    onAddFollowUp={handleAddFollowUp}
                    onOpenCustomerHistory={openCustomerHistory}
                    onToggleBlockedPhone={handleToggleBlockedPhone}
                    onPlayRecording={handlePlayRecording}
                    onDownloadRecording={handleDownloadRecording}
                  />
                );
              })}
              {!tableLoading && visibleCalls.length === 0 ? (
                <tr>
                  <td colSpan={emptyTableColSpan} className="px-4 py-8 text-center text-muted-foreground">No calls found for the selected filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={callsList.page}
          totalPages={callsList.totalPages}
          totalItems={callsList.total}
          pageSize={callsList.limit || CALLS_TABLE_PAGE_SIZE}
          onPageChange={setListPage}
          disabled={tableLoading}
        />

        {playingId && (
          <div className="border-t border-border bg-muted/30 p-4">
            <div className="mb-2 text-sm font-medium">Recording player · {playingId}</div>
            <div className="flex h-10 items-end gap-1">{Array.from({ length: 48 }).map((_, i) => <div key={i} className="flex-1 rounded-t bg-accent/60" style={{ height: `${12 + ((i * 17) % 70)}%` }} />)}</div>
          </div>
        )}
      </div>

      {historyPhone ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8 backdrop-blur-sm">
          <div className="w-full max-w-6xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Customer History</h2>
                <p className="font-mono text-sm font-semibold text-accent">{getCallCustomerUid({ callerId: historyPhone })}</p>
                <p className="text-sm text-muted-foreground">
                  Full call history for {(shouldMaskPhone ? hidePhoneDisplay(historyPhone) : historyPhone) || "—"}
                </p>
              </div>
              <button className="action-outline" onClick={closeCustomerHistory}><X className="h-4 w-4" />Close</button>
            </div>

            {historyLoading ? (
              <p className="py-10 text-center text-muted-foreground">Loading customer history...</p>
            ) : !hasCustomerHistoryData ? (
              <p className="py-10 text-center text-muted-foreground">No history found for this customer number.</p>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    { label: "Customer", value: historyCustomerName || "—" },
                    { label: "Customer ID", value: getCallCustomerUid({ callerId: historyPhone }) || "—" },
                    { label: "Primary Number", value: (shouldMaskPhone ? hidePhoneDisplay(historyPhone) : historyPhone) || "—" },
                    { label: "Latest Branch", value: historyProfile.branch || "—" },
                    { label: "Latest Status", value: historyProfile.formStatus || "—" },
                    { label: "Call Records", value: String(visibleHistoryCalls.length) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="mt-2 break-words text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Location", value: historyProfile.location },
                    { label: "District", value: historyProfile.district },
                    { label: "Language", value: historyProfile.language },
                    { label: "Purpose", value: historyProfile.purpose },
                    { label: "Metal", value: historyProfile.metalType },
                    { label: "Grams", value: historyProfile.grams },
                    { label: "Lead", value: historyProfile.lead },
                    { label: "Notes", value: historyProfile.notes },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm">{item.value || "—"}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="mb-2 text-base font-semibold">Saved Intake History</h3>
                  {visibleIntakeHistory.length === 0 ? (
                    <p className="rounded-xl border border-border px-4 py-6 text-center text-muted-foreground">No saved intake records found.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[920px] text-sm">
                        <thead className="bg-muted/60 text-left text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Time</th>
                            <th className="px-3 py-2">Agent</th>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-3 py-2">Branch</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Disposition</th>
                            <th className="px-3 py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleIntakeHistory.slice(0, 25).map((call) => (
                            <tr key={call.id} className="border-t border-border align-top">
                              <td className="px-3 py-2 font-mono text-xs">{getCallDisplayDate(call) || call.date || "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs">{getCallDisplayTime(call) || call.time || "—"}</td>
                              <td className="px-3 py-2">{resolveAgentName(call.agentId, call.agentName)}</td>
                              <td className="px-3 py-2">{getLeadSourceDisplay(call)}</td>
                              <td className="px-3 py-2">{call.branch || "—"}</td>
                              <td className="px-3 py-2">{call.formStatus || "—"}</td>
                              <td className="px-3 py-2">{getFullDispositionDisplay(call.callbackStatus) || "—"}</td>
                              <td className="max-w-[280px] px-3 py-2 whitespace-pre-wrap break-words">{call.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-base font-semibold">Call History</h3>
                  {visibleHistoryCalls.length === 0 ? (
                    <p className="rounded-xl border border-border px-4 py-6 text-center text-muted-foreground">No call records found.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[860px] text-sm">
                        <thead className="bg-muted/60 text-left text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Time</th>
                            <th className="px-3 py-2">Direction</th>
                            <th className="px-3 py-2">Agent</th>
                            <th className="px-3 py-2">Duration</th>
                            <th className="px-3 py-2">Branch</th>
                            <th className="px-3 py-2">Disposition</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleHistoryCalls.slice(0, 50).map((call) => (
                            <tr key={call.id} className="border-t border-border">
                              <td className="px-3 py-2 font-mono text-xs">{getCallDisplayDate(call) || call.date || "—"}</td>
                              <td className="px-3 py-2 font-mono text-xs">{getCallDisplayTime(call) || call.time || "—"}</td>
                              <td className="px-3 py-2 capitalize">{call.direction || "—"}</td>
                              <td className="px-3 py-2">{resolveAgentName(call.agentId, call.agentName)}</td>
                              <td className="px-3 py-2 font-mono text-xs">{normalizeCallDuration(call.duration)}</td>
                              <td className="px-3 py-2">{call.branch || "—"}</td>
                              <td className="px-3 py-2">{getFullDispositionDisplay(call.callbackStatus) || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {user?.role === "agent" && selectedCall && selectedCallDetails ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setSelectedCall(null)}>
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-xl font-semibold">{getCallDisplayCustomerName(selectedCallDetails, { maskPhone: shouldMaskPhone })}</h2>
                <p className="text-sm text-muted-foreground">{(shouldMaskPhone ? hidePhoneDisplay(selectedCallDetails.callerId) : selectedCallDetails.callerId) || "—"}</p>
              </div>
              <button className="action-outline" onClick={() => setSelectedCall(null)}>Close</button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Call Details</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Direction:</span> <span className="capitalize">{selectedCallDetails.direction || "—"}</span></p>
                  <p><span className="text-muted-foreground">Source:</span> {getLeadSourceDisplay(selectedCallDetails)}</p>
                  {selectedCallDetails.carrierTrunk ? <p><span className="text-muted-foreground">Carrier Trunk:</span> {selectedCallDetails.carrierTrunk}</p> : null}
                  {selectedCallDetails.pilot ? <p><span className="text-muted-foreground">Pilot:</span> {selectedCallDetails.pilot}</p> : null}
                  {selectedCallDetails.didOrCli ? <p><span className="text-muted-foreground">DID / CLI:</span> {selectedCallDetails.didOrCli}</p> : null}
                  <p><span className="text-muted-foreground">Status:</span> <span className="capitalize">{selectedCallDetails.status || "—"}</span></p>
                  <p><span className="text-muted-foreground">Date:</span> {getCallDisplayDate(selectedCallDetails) || "—"}</p>
                  <p><span className="text-muted-foreground">Time:</span> {getCallDisplayTime(selectedCallDetails) || "—"}</p>
                  <p><span className="text-muted-foreground">Duration:</span> {normalizeCallDuration(selectedCallDetails.duration)}</p>
                  <p>
                    <span className="text-muted-foreground">Disposition:</span>{" "}
                    <span title={getFullDispositionDisplay(selectedCallDetails.callbackStatus)}>
                      {getFullDispositionDisplay(selectedCallDetails.callbackStatus) || "—"}
                    </span>
                  </p>
                  <p><span className="text-muted-foreground">Visit Timeline:</span> {getVisitTimelineSummary(selectedCallDetails)?.formatted ? `${getVisitTimelineSummary(selectedCallDetails)?.label}: ${getVisitTimelineSummary(selectedCallDetails)?.formatted}` : "—"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer Details</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Customer:</span> {getCallDisplayCustomerName(selectedCallDetails, { maskPhone: shouldMaskPhone })}</p>
                  <p><span className="text-muted-foreground">Mobile 2:</span> {(shouldMaskPhone ? hidePhoneDisplay(selectedCallDetails.mob2) : selectedCallDetails.mob2) || "—"}</p>
                  <p><span className="text-muted-foreground">Location:</span> {selectedCallDetails.place || "—"}</p>
                  <p><span className="text-muted-foreground">District:</span> {selectedCallDetails.district || "—"}</p>
                  <p><span className="text-muted-foreground">Language:</span> {selectedCallDetails.language || "—"}</p>
                  <p><span className="text-muted-foreground">Branch:</span> {selectedCallDetails.branch || "—"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Business Details</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Business Type:</span> {selectedCallDetails.businessType || "—"}</p>
                  <p><span className="text-muted-foreground">Purpose:</span> {selectedCallDetails.purpose || "—"}</p>
                  <p><span className="text-muted-foreground">Metal:</span> {selectedCallDetails.metalType || "—"}</p>
                  <p><span className="text-muted-foreground">Grams:</span> {selectedCallDetails.grams || "—"}</p>
                  <p><span className="text-muted-foreground">Release Amount:</span> {selectedCallDetails.releasingAmount || "—"}</p>
                  <p><span className="text-muted-foreground">Bank:</span> {selectedCallDetails.bankName || "—"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Remarks</p>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Lead:</span> {selectedCallDetails.lead || "—"}</p>
                  <p><span className="text-muted-foreground">Advertisement:</span> {selectedCallDetails.advertisement || "—"}</p>
                  <p><span className="text-muted-foreground">Form Status:</span> {selectedCallDetails.formStatus || "—"}</p>
                  <p><span className="text-muted-foreground">Notes:</span> {selectedCallDetails.notes || "—"}</p>
                </div>
              </div>
            </div>
            {selectedCallLoading ? (
              <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">Loading saved intake details...</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
