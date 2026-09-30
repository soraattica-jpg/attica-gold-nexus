/* eslint-disable react-refresh/only-export-components */
import { api, buildApiUrl, type AutoDialLeadRecord, type AutoDialQueueExitReason, type BreakLogRecord, type FollowUpStatusUpdatePayload, type LiveAgentRecord, type LiveCallMonitorMode, type TransferContextRecord } from "@/lib/api";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth, type User } from "@/contexts/AuthContext";
import { SIP_SERVER, WSS_URL, buildSipAgentProfile } from "@/lib/sipClient";
import { canRebuildSipClient, observeSipRegistration } from "@/lib/sipRegistration";
import {
  type AgentBreakStatus,
	  type AgentPresenceStatus,
	  canReceiveAutoDialAssignmentsForStatus,
	  canReceiveIncomingCallsForStatus,
	  canReceiveTransferredCalls,
	  formatElapsedTimeFrom,
  getAgentStatusLabel,
  isBreakStatus,
  normalizeBreakStatus,
} from "@/lib/agentStatus";
import { hidePhoneDisplay, normalizePhoneNumber } from "@/lib/phone";
import { getAutoDialLeadSourceLabel, getMeaningfulCustomerName } from "@/lib/callDisplay";
import { getBusinessDateString } from "@/lib/businessDate";
import { formatCallDurationFromSeconds, getLongerCallDuration, normalizeCallDuration } from "@/lib/callDuration";
import {
  canAnswerIncomingDialogWithoutBrowserConflict,
  isLiveManagedCall,
  isProtectedCallWorkflowActive,
  shouldRepairSessionMicrophone,
  shouldWarnBeforeUnloadForCallWorkflow,
} from "@/lib/callWorkflowGuards";
import { mergeCallsPreservingLocalLiveCall } from "@/lib/liveCallState";
import { getEstablishedDisconnectOutcome, getIncomingPreAnswerOutcome, getOutboundMissedOutcome } from "@/lib/callOutcomes";
import { isAdminRole } from "@/lib/roles";
import {
  createRecentEndedCustomer,
  getActiveRecentEndedCustomer,
  isReconnectSuppressed,
  type RecentEndedCustomer,
} from "@/lib/callReconnectGuard";
import {
  getFollowUpDismissKey,
  isDueFollowUp,
  isOpenFollowUpStatus,
  pickNextDueFollowUp,
} from "@/lib/followUpReminders";
import { didIncomingInviteReachConnectedState } from "@/lib/incomingWrapUp";
import { buildIncomingCallRecord } from "@/lib/incomingCallRecord";
import { readIncomingCallAttribution } from "@/lib/callAttribution";
import { buildOutgoingConnectedCall, buildOutgoingMissedCall } from "@/lib/outgoingCallRecord";
import {
  applyPreferredAudioOutput,
  buildAudioOnlyConstraints,
  clearPreferredAudioInputDeviceId,
  clearPreferredAudioOutputDeviceId,
  ensureUsableAudioInputStream,
  getPreferredAudioInputDeviceId,
  getPreferredAudioOutputDeviceId,
} from "@/lib/audioDevices";
import {
  readSessionStorageJson,
  removeSessionStorageItem,
  writeSessionStorageItem,
} from "@/lib/browserStorage";
import {
  consumePendingLiveMonitorRequest,
  shouldRejectUnmatchedAdminSipInvite,
  type PendingLiveMonitorRequest,
} from "@/lib/liveMonitor";
import { markActiveCallFinished, markActiveCallStarted } from "@/lib/safeReload";
import { shouldBypassLanguageFilterForTransfer } from "@/lib/transferContext";
import {
  agents,
  MAX_AGENT_COUNT,
  branches as seedBranches,
  callsPerHour,
  dailyHeatmap,
  preciousMetalRates,
  type Branch,
  type CallRecord,
  type FollowUpRecord,
} from "@/data/mockData";

export type ManagedCall = CallRecord;
type CallPhase = "idle" | "dialing" | "connected";
type AgentWorkStatus = "active" | AgentBreakStatus | "outbound-auto" | "follow-up" | "manual-outgoing";

const OUTBOUND_PRECONNECT_RING_TIMEOUT_MS = 65_000;
const INCOMING_AUTO_ANSWER_DELAY_MS = 1000;
const LIVE_CALL_DURATION_SAVE_INTERVAL_MS = 10_000;
const buildManagedCallId = () => `CALL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeSipEndpointStatus = (value?: string | null) => String(value || "").trim().toLowerCase();
const getAutoDialSignalText = (lead?: AutoDialLeadRecord | null) => [
  lead?.sourceFile,
  lead?.lastError,
  lead?.queueExitReason,
  lead?.id,
  lead?.type,
].map((value) => String(value || "").trim().toLowerCase()).join(" | ");
const isFreshAutoDialLead = (lead?: AutoDialLeadRecord | null) => {
  const signal = getAutoDialSignalText(lead);
  return !(
    signal.includes("auto follow-up")
    || signal.includes("status follow")
    || signal.includes("follow-up")
    || signal.includes("missed")
    || signal.includes("callback")
    || signal.includes("call back")
    || signal.includes("rnr")
    || signal.includes("no answer")
    || signal.includes("did not connect")
    || signal.includes("disconnected")
    || signal.includes("failed leads")
  );
};
const isFollowUpAutoDialLead = (lead?: AutoDialLeadRecord | null) => Boolean(lead) && !isFreshAutoDialLead(lead);
const isBackendSipEndpointReachable = (value?: string | null) => {
  const normalized = normalizeSipEndpointStatus(value);
  return Boolean(normalized) && normalized !== "unavailable" && normalized !== "offline";
};
type FinalizedCallSnapshot = {
  id: string;
  status: ManagedCall["status"];
  duration: string;
  ringStartedAt?: string;
  answeredAt?: string;
  endedAt?: string;
  talkDurationSeconds?: number;
};

type IncomingLeadPayload = {
  phone: string; customerName: string; date?: string; place: string;
  branch: string; purpose: string; notes: string;
  language?: string;
  disposition?: string;
};

type NewFollowUpPayload = {
  customerName: string; phone: string; branch: string;
  followUpAt: string; notes?: string; callId?: string;
  sourceCallId?: string;
  sourceStatus?: string;
};

type ClosePendingFollowUpsPayload = {
  phone: string;
  outcome?: string;
  throughDate?: string;
};

type SessionStateLike = {
  addListener: (listener: (state: unknown) => void) => void;
};

type CallIvrMetadata = {
  language?: string;
  businessType?: string;
  purpose?: string;
};

type IvrSelectionOverride = {
  phone?: string;
  language?: string;
  businessType?: string;
  purpose?: string;
};

type LiveMonitorAcceptOptions = {
  sessionDescriptionHandlerOptions: {
    constraints: MediaStreamConstraints;
    localMediaStream?: MediaStream;
  };
};

type SessionDescriptionHandlerOptionsWithLocalMediaStream = {
  constraints?: MediaStreamConstraints;
  localMediaStream?: MediaStream;
};

type SipRequestLike = {
  from?: {
    uri?: { user?: string };
    displayName?: string;
    friendlyName?: string;
  };
  getHeader?: (name: string) => string | undefined;
  getHeaders?: (name: string) => string[];
};

type SipSessionLike = {
  state?: unknown;
  accept?: (options?: unknown) => Promise<unknown> | void;
  bye?: () => void;
  reject?: () => void;
  cancel?: () => void;
  dispose?: () => Promise<unknown> | void;
  invite?: (options?: unknown) => Promise<unknown>;
  refer?: (target: unknown, options?: unknown) => Promise<unknown>;
  remoteIdentity?: {
    uri?: { user?: string };
    displayName?: string;
    friendlyName?: string;
  };
  request?: SipRequestLike;
  sessionDescriptionHandlerOptionsReInvite?: Record<string, unknown>;
  stateChange: SessionStateLike;
  sessionDescriptionHandler?: unknown;
};

type SipSessionDescriptionHandlerLike = {
  peerConnection?: RTCPeerConnection;
  localMediaStream?: MediaStream;
  enableSenderTracks?: (enable: boolean) => void;
};

type SessionTerminationIntent = "hangup" | "cancel" | "reject";
const RESTORABLE_LIVE_CALL_MAX_AGE_MS = 4 * 60 * 60 * 1000;

type SipModule = typeof import("sip.js");
type SipUserAgent = InstanceType<SipModule["UserAgent"]>;
type SipRegisterer = InstanceType<SipModule["Registerer"]>;
type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};
type HoldMusicEngine = {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  melodyOscillator: OscillatorNode;
  melodyGain: GainNode;
  bassOscillator: OscillatorNode;
  bassGain: GainNode;
  padOscillator: OscillatorNode;
  padGain: GainNode;
  schedulerIntervalId: number | null;
  nextBeatTime: number;
  step: number;
};

const REMOTE_AUDIO_GAIN = 1.8;
const REGISTER_EXPIRES_SECONDS = 300;
const REGISTER_REFRESH_FREQUENCY = 85;
// Vendored from /home/attica/gautawa-old-phone-ring-272648.mp3 so the browser
// can load the custom outbound ringback from the deployed app origin.
const OUTBOUND_RINGBACK_AUDIO_SRC = "/gautawa-old-phone-ring-272648.mp3";
// A short near-silent clip used only to unlock the browser's media playback
// policy from the agent's explicit Call/Answer gesture.  Without this, the
// remote WebRTC track can receive RTP correctly while HTMLAudioElement.play()
// is rejected as autoplay after SIP negotiation completes.
const REMOTE_AUDIO_PRIME_SRC = "/remote-audio-prime.wav";
const INCOMING_ALERT_AUDIO_SRC = "/freesound_community-ringing-phone-71835.mp3";
const HOLD_MUSIC_BEAT_SECONDS = 0.42;
const HOLD_MUSIC_MELODY = [659.25, 783.99, 880.0, 783.99, 698.46, 659.25, 587.33, 659.25];
const HOLD_MUSIC_BASS = [196.0, 196.0, 220.0, 220.0, 246.94, 246.94, 220.0, 220.0];

const getHiddenMediaMount = () => {
  if (typeof document === "undefined") return null;
  return document.body || document.documentElement || null;
};
const HOLD_MUSIC_PAD = [392.0, 440.0, 493.88, 440.0];

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
    const [minutes = 0, seconds = 0] = timeParts;
    return (minutes * 60) + seconds;
  }

  if (timeParts.length === 3) {
    const [hours = 0, minutes = 0, seconds = 0] = timeParts;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return 0;
};

const dedupeBreakLogs = (logs: BreakLogRecord[]) => {
  const deduped: BreakLogRecord[] = [];
  const indexByKey = new Map<string, number>();

  for (const log of logs) {
    const startedAtKey = log.startedAt
      ? new Date(log.startedAt).toISOString()
      : (log.createdAt ? new Date(log.createdAt).toISOString() : "");
    const dedupeKey = [
      log.agentId,
      startedAtKey,
      String(log.breakType || "").trim().toLowerCase(),
      String(log.startTime || "").trim().toLowerCase(),
    ].join("|");
    const existingIndex = indexByKey.get(dedupeKey);

    if (existingIndex === undefined) {
      indexByKey.set(dedupeKey, deduped.length);
      deduped.push(log);
      continue;
    }

    const current = deduped[existingIndex];
    const currentDurationSeconds = parseBreakDurationToSeconds(current.duration);
    const candidateDurationSeconds = parseBreakDurationToSeconds(log.duration);
    const shouldReplace =
      candidateDurationSeconds > currentDurationSeconds ||
      (candidateDurationSeconds === currentDurationSeconds && Boolean(log.endTime) && !current.endTime);

    if (shouldReplace) {
      deduped[existingIndex] = log;
    }
  }

  return deduped;
};

const getSessionDescriptionHandler = (session: SipSessionLike | null) => (
  session?.sessionDescriptionHandler as SipSessionDescriptionHandlerLike | undefined
);

const getSessionPeerConnection = (session: SipSessionLike | null) => {
  const handler = getSessionDescriptionHandler(session);
  return handler?.peerConnection;
};

const getAudioTransceiver = (peerConnection: RTCPeerConnection, sender?: RTCRtpSender | null) => (
  peerConnection.getTransceivers().find((transceiver) => (
    (sender ? transceiver.sender === sender : false)
    || transceiver.sender.track?.kind === "audio"
    || transceiver.receiver.track?.kind === "audio"
  )) ?? null
);

const isLiveAudioTrack = (track: MediaStreamTrack | null | undefined) => (
  Boolean(track && track.kind === "audio" && track.readyState === "live")
);

const isUsableAudioTrack = (track: MediaStreamTrack | null | undefined) => (
  Boolean(track && track.kind === "audio" && track.readyState === "live" && !track.muted)
);

const getPreferredLiveAudioTrack = (...tracks: Array<MediaStreamTrack | null | undefined>) => (
  tracks.find((track) => isUsableAudioTrack(track))
  ?? tracks.find((track) => isLiveAudioTrack(track))
  ?? null
);

const getMediaStreamAudioTrackSignature = (stream: MediaStream | null | undefined) => (
  stream?.getAudioTracks()
    .filter((track) => track.readyState === "live")
    .map((track) => track.id)
    .sort()
    .join("|") || ""
);

const getMicrophonePreparationErrorMessage = (
  error: unknown,
  permissionDeniedMessage: string,
) => {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError") {
      return permissionDeniedMessage;
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError" || error.name === "OverconstrainedError") {
      return "No working microphone was found. Check the selected device and try again.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError" || error.name === "AbortError") {
      return "Microphone is busy or unavailable. Close other apps using it and try again.";
    }
    return error.message || "Unable to prepare the microphone";
  }

  const message =
    error instanceof Error
      ? error.message
      : "Unable to prepare the microphone";

  if (/permission|denied|allowed|notallowed/i.test(message)) {
    return permissionDeniedMessage;
  }

  return message;
};

const getUserFacingRuntimeErrorMessage = (error: unknown, fallbackMessage: string) => {
  const message =
    typeof error === "string"
      ? error.trim()
      : error instanceof Error
        ? error.message.trim()
        : "";

  return message && message.toLowerCase() !== "error"
    ? message
    : fallbackMessage;
};

const waitForRuntimeMilliseconds = (ms: number) => new Promise((resolve) => {
  window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
});

interface CallCenterContextType {
  calls: ManagedCall[];
  branches: Branch[];
  followUps: FollowUpRecord[];
  rateTicker: string[];
  hourlyCalls: typeof callsPerHour;
  heatmap: typeof dailyHeatmap;
  dialedNumber: string;
  callPhase: CallPhase;
  callTimer: string;
  isMuted: boolean;
  isOnHold: boolean;
  incomingDialogOpen: boolean;
  incomingDraftPhone: string;
  incomingDialogCallId: string;
  reminderFollowUp: FollowUpRecord | null;
  followUpDueCount: number;
  callWrapUpPending: boolean;
  currentAutoDialLead: AutoDialLeadRecord | null;
  queuedAutoDialLead: AutoDialLeadRecord | null;
  autoDialAlertLead: AutoDialLeadRecord | null;
  autoDialAlertAutoConnectActive: boolean;
  sipRegistered: boolean;
  sipStatusLabel: string;
  sipStatusReason: string;
  metalRates: typeof preciousMetalRates;
  agentStatus: AgentPresenceStatus;
  agentStatusTimer: string;
  updateMetalRate: (label: string, value: string) => void;
  addMetalRate: (label: string, value: string) => void;
  deleteMetalRate: (label: string) => void;
  setIncomingDialogOpen: (open: boolean) => void;
  appendDigit: (digit: string) => void;
  backspaceDialedNumber: () => void;
  clearDialedNumber: () => void;
  setDialedNumber: (value: string) => void;
  startCall: () => void;
  endCall: () => void;
  toggleHold: () => void;
  toggleMute: () => void;
  prefillDialedNumber: (value: string) => void;
  loadAutoDialLeadIntoDialer: (lead: AutoDialLeadRecord) => Promise<boolean>;
  saveIncomingLead: (payload: IncomingLeadPayload) => void;
  skipIncomingLead: () => void;
  addFollowUp: (payload: NewFollowUpPayload) => void;
  closePendingFollowUpsForPhone: (payload: ClosePendingFollowUpsPayload) => void;
  markFollowUpStatus: (id: string, payload: FollowUpStatusUpdatePayload) => void;
  closeReminder: () => void;
  addBranch: (name: string, city: string) => void;
  updateBranch: (id: string, name: string, city: string) => void;
  syncCallRecord: (call: Partial<ManagedCall>) => void;
  answerIncoming: () => Promise<boolean>;
  setAgentWorkStatus: (status: AgentWorkStatus) => void;
  toggleBreak: () => void;
  breakLogs: BreakLogRecord[];
  activeAgentExts: string[];
  completeCallWrapUp: () => void;
  acceptAutoDialAlert: () => void;
  rejectAutoDialAlert: (reason: AutoDialQueueExitReason) => Promise<boolean>;
  snoozeAutoDialAlert: () => void;
  transferCurrentCall: (
    targetExtension: string,
    targetAgentName?: string,
    ivrSelection?: IvrSelectionOverride,
  ) => Promise<boolean>;
  startConferenceCall: (targetPhone: string) => Promise<boolean>;
  getFinalizedCallSnapshot: (callId?: string) => FinalizedCallSnapshot | null;
  getLiveCallSnapshot: (callId?: string) => FinalizedCallSnapshot | null;
}

const CallCenterContext = createContext<CallCenterContextType | undefined>(undefined);

const formatDuration = (seconds: number) => formatCallDurationFromSeconds(seconds);
const getDurationSecondsFromStartedAt = (startedAt: number | null, fallbackSeconds = 0, endTime = Date.now()) => (
  startedAt ? Math.max(0, Math.round((endTime - startedAt) / 1000)) : Math.max(0, Math.round(fallbackSeconds))
);

const getCurrentDate = () => getBusinessDateString(new Date());
const getCurrentTime = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
const BREAK_SESSION_KEY = "attica_break";
const FOLLOWUP_SESSION_KEY = "attica_followup";

const resolveAgentModeFromAccess = (user?: User | null): "active" | "outbound-auto" | "follow-up" => {
  if (user?.outgoingAccess === true && user.incomingAccess === false && user.followUpAccess === false) {
    return "outbound-auto";
  }
  if (user?.followUpAccess === true && user.incomingAccess === false && user.outgoingAccess === false) {
    return "follow-up";
  }
  return "active";
};

const isAgentWorkMode = (status: unknown): status is "active" | "outbound-auto" | "follow-up" | "manual-outgoing" => (
  status === "active" || status === "outbound-auto" || status === "follow-up" || status === "manual-outgoing"
);
const STALE_INCOMING_RING_MS = 12_000;
const getLocalDateKey = (value: string | number | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const getDateTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
};

const normalizeIvrLanguage = (value?: string | null) => value?.trim().toLowerCase() || "";

const extractNormalizedPhoneFromSipValue = (value?: string | null) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const sipMatch = rawValue.match(/(?:sip:|tel:)\+?([0-9][0-9\s-]{6,}[0-9])/i);
  if (sipMatch?.[1]) {
    return normalizePhoneNumber(sipMatch[1]);
  }

  const bracketMatch = rawValue.match(/"?\+?([0-9][0-9\s-]{6,}[0-9])"?\s*</);
  if (bracketMatch?.[1]) {
    return normalizePhoneNumber(bracketMatch[1]);
  }

  return normalizePhoneNumber(rawValue);
};

const uniqueNormalizedPhones = (values: Array<string | null | undefined>) => (
  Array.from(new Set(values.map((value) => extractNormalizedPhoneFromSipValue(value)).filter(Boolean)))
);

const SIP_ORIGINAL_CALLER_HEADERS = [
  "P-Asserted-Identity",
  "P-Preferred-Identity",
  "Remote-Party-ID",
  "From",
  "Contact",
  "Diversion",
  "History-Info",
  "X-Original-CallerID",
  "X-CallerID",
  "X-Asterisk-CallerID",
  "X-Attica-CallerID",
];

const SIP_CALL_ID_HEADERS = [
  "Call-ID",
  "Call-Id",
  "i",
];

const sanitizeSessionTokenFragment = (value?: string | null, maxLength = 32) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-maxLength);
  return normalized;
};

const getFirstSipHeaderValue = (
  request: Pick<SipRequestLike, "getHeader" | "getHeaders"> | null | undefined,
  headerNames: string[],
) => {
  for (const headerName of headerNames) {
    const directValue = String(request?.getHeader?.(headerName) || "").trim();
    if (directValue) return directValue;

    const listValue = (request?.getHeaders?.(headerName) || [])
      .map((value) => String(value || "").trim())
      .find(Boolean);
    if (listValue) return listValue;
  }

  return "";
};

const getIncomingInviteKey = (session: SipSessionLike | null) => (
  sanitizeSessionTokenFragment(
    getFirstSipHeaderValue(session?.request, SIP_CALL_ID_HEADERS),
    28,
  )
);

const buildIncomingDialogCallId = (session: SipSessionLike | null, caller: string) => {
  const inviteKey = getIncomingInviteKey(session);
  if (inviteKey) {
    return `IN-${inviteKey}`;
  }

  const phoneFragment = sanitizeSessionTokenFragment(caller, 10) || "UNKNOWN";
  return `IN-${phoneFragment}-${Date.now().toString().slice(-10)}`;
};

const appendCallNote = (existingNotes: string | undefined, nextNote: string) => {
  const normalizedNextNote = String(nextNote || "").trim();
  if (!normalizedNextNote) return String(existingNotes || "").trim();

  const existing = String(existingNotes || "").trim();
  if (!existing) return normalizedNextNote;
  if (existing.toLowerCase().includes(normalizedNextNote.toLowerCase())) return existing;
  return `${existing} | ${normalizedNextNote}`;
};

const resolveDisconnectCallbackStatus = (currentStatus: string | undefined, disconnectStatus: string) => {
  const normalizedCurrentStatus = String(currentStatus || "").trim().toLowerCase();
  if (!normalizedCurrentStatus || normalizedCurrentStatus === "scheduled" || normalizedCurrentStatus === "none") {
    return disconnectStatus;
  }
  return String(currentStatus || "").trim();
};

export function CallCenterProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, updateUser } = useAuth();
  const [calls, setCalls] = useState<ManagedCall[]>([]);
  const [branches, setBranches] = useState<Branch[]>(() => [...seedBranches]);
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [dialedNumber, setDialedNumberState] = useState("");
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [incomingDialogOpen, setIncomingDialogOpen] = useState(false);
  const [callWrapUpPending, setCallWrapUpPending] = useState(false);
  const [incomingDraftPhone, setIncomingDraftPhone] = useState("");
  const [incomingDialogCallId, setIncomingDialogCallId] = useState("");
  const [reminderFollowUp, setReminderFollowUp] = useState<FollowUpRecord | null>(null);
  const [currentAutoDialLead, setCurrentAutoDialLead] = useState<AutoDialLeadRecord | null>(null);
  const [queuedAutoDialLead, setQueuedAutoDialLead] = useState<AutoDialLeadRecord | null>(null);
  const [autoDialAlertLead, setAutoDialAlertLead] = useState<AutoDialLeadRecord | null>(null);
  const [autoDialEnabled, setAutoDialEnabled] = useState<boolean | null>(null);
  const [freshLeadAutoConnectEnabled, setFreshLeadAutoConnectEnabled] = useState(true);
  const [freshLeadAutoConnectIntervalSeconds, setFreshLeadAutoConnectIntervalSeconds] = useState(10);
  const [sipTransportRegistered, setSipTransportRegistered] = useState(false);
  const [backendSipSnapshot, setBackendSipSnapshot] = useState<LiveAgentRecord | null>(null);
  const [sipStatusReason, setSipStatusReason] = useState("Waiting for SIP registration");
  const [sipReconnectNonce, setSipReconnectNonce] = useState(0);
  const [metalRates, setMetalRates] = useState(() => [...preciousMetalRates]);
  const [agentStatus, setAgentStatus] = useState<AgentWorkStatus>("active");
  const [assignedLanguages, setAssignedLanguages] = useState<string[]>([]);
  const [breakLogs, setBreakLogs] = useState<BreakLogRecord[]>([]);
  const [breakStartTime, setBreakStartTime] = useState<number | null>(null);
  const [followUpStartTime, setFollowUpStartTime] = useState<number | null>(null);
  const [statusClock, setStatusClock] = useState(Date.now());
  const operationalRefreshInFlightRef = useRef(false);
  const currentUserId = user?.id ?? "";
  const currentUserRole = user?.role;
  const hasIncomingAccess = user?.role !== "agent" || user.incomingAccess !== false;
  const hasOutgoingAccess = user?.role !== "agent" || user.outgoingAccess !== false;
  const hasFollowUpAccess = user?.role !== "agent" || user.followUpAccess !== false;
  const activeBreakLog = useMemo(() => {
    if (!user?.id) return null;

    return breakLogs
      .filter((breakLog) => breakLog.agentId === user.id && !breakLog.endTime)
      .sort((left, right) => {
        const leftTimestamp = left.startedAt
          ? new Date(left.startedAt).getTime()
          : (left.createdAt ? new Date(left.createdAt).getTime() : 0);
        const rightTimestamp = right.startedAt
          ? new Date(right.startedAt).getTime()
          : (right.createdAt ? new Date(right.createdAt).getTime() : 0);
        return rightTimestamp - leftTimestamp;
      })[0] || null;
  }, [breakLogs, user?.id]);
  const hasActiveBreak = Boolean(activeBreakLog);
  const effectiveAgentStatus = useMemo<AgentPresenceStatus>(() => {
    if (user?.role !== "agent") return "active";
    if (user?.status === "inactive") return "inactive";
    const backendStatus = String(backendSipSnapshot?.status || "").trim().toLowerCase();
    const backendWorkMode = String(backendSipSnapshot?.workMode || "").trim().toLowerCase();
    const backendBreakStatus = normalizeBreakStatus(backendStatus)
      || normalizeBreakStatus(backendWorkMode)
      || (backendSipSnapshot?.onBreak ? "on-break" : null);

    if (backendSipSnapshot && backendStatus !== "offline") {
      if (backendBreakStatus) return backendBreakStatus;
      if (backendWorkMode === "follow-up" && hasFollowUpAccess) return "follow-up";
      if (backendWorkMode === "manual-outgoing" && hasOutgoingAccess) return "manual-outgoing";
      if (backendWorkMode === "outbound-auto" && hasOutgoingAccess) return "outbound-auto";
      if (
        backendWorkMode === "active"
        || backendStatus === "available"
        || backendStatus === "on-call"
        || backendStatus === "active"
      ) {
        return "active";
      }
    }

    const breakStatus = normalizeBreakStatus(agentStatus)
      || normalizeBreakStatus(user?.status)
      || normalizeBreakStatus(activeBreakLog?.breakType)
      || (hasActiveBreak ? "on-break" : null);
    if (breakStatus) return breakStatus;
    if (hasFollowUpAccess && (agentStatus === "follow-up" || user?.status === "follow-up" || Boolean(followUpStartTime))) return "follow-up";
    if (hasOutgoingAccess && (agentStatus === "manual-outgoing" || user?.status === "manual-outgoing")) return "manual-outgoing";
    if (hasOutgoingAccess && (agentStatus === "outbound-auto" || user?.status === "outbound-auto")) return "outbound-auto";
    return "active";
  }, [
    activeBreakLog?.breakType,
    agentStatus,
    backendSipSnapshot,
    followUpStartTime,
    hasFollowUpAccess,
    hasActiveBreak,
    hasOutgoingAccess,
    user?.role,
    user?.status,
  ]);
  const canReceiveIncomingCalls = user?.role !== "agent" || (hasIncomingAccess && canReceiveIncomingCallsForStatus(effectiveAgentStatus));
  const canReceiveAutoDialAssignments = user?.role !== "agent" || (
    canReceiveAutoDialAssignmentsForStatus(effectiveAgentStatus)
    && (
      (effectiveAgentStatus === "outbound-auto" && hasOutgoingAccess)
      || (effectiveAgentStatus === "follow-up" && hasFollowUpAccess)
    )
  );
  const canStartOutboundCalls = user?.role !== "agent" || (
    (effectiveAgentStatus === "outbound-auto" && hasOutgoingAccess)
    || (effectiveAgentStatus === "follow-up" && hasFollowUpAccess)
    || (effectiveAgentStatus === "manual-outgoing" && hasOutgoingAccess)
  );
  const operationalCallsLimit = 40;
  const latestAgentCallEndedAt = useMemo(() => {
    if (!user?.id) return "";

    return calls
      .filter((call) => call.agentId === user.id && Boolean(call.endedAt))
      .sort((left, right) => {
        const rightEndedAt = new Date(right.endedAt || "").getTime();
        const leftEndedAt = new Date(left.endedAt || "").getTime();
        return (Number.isFinite(rightEndedAt) ? rightEndedAt : 0) - (Number.isFinite(leftEndedAt) ? leftEndedAt : 0);
      })[0]?.endedAt || "";
  }, [calls, user?.id]);
  const agentStatusTimer = useMemo(() => {
    if (isBreakStatus(effectiveAgentStatus)) return formatElapsedTimeFrom(breakStartTime, statusClock);
    if (callPhase !== "idle") return formatElapsedTimeFrom(callStartedAt || user?.activeCallStartedAt || null, statusClock);
    if (effectiveAgentStatus === "follow-up") return formatElapsedTimeFrom(followUpStartTime || user?.followUpStartedAt || null, statusClock);
    return formatElapsedTimeFrom(
      latestAgentCallEndedAt
        || user?.lastCallEndedAt
        || user?.callStateUpdatedAt
        || user?.lastLoginAt
        || user?.loginTime
        || null,
      statusClock,
    );
  }, [
    breakStartTime,
    callPhase,
    callStartedAt,
    effectiveAgentStatus,
    followUpStartTime,
    latestAgentCallEndedAt,
    statusClock,
    user?.activeCallStartedAt,
    user?.callStateUpdatedAt,
    user?.followUpStartedAt,
    user?.lastCallEndedAt,
    user?.lastLoginAt,
    user?.loginTime,
  ]);
  const sipAgentIdentity = useMemo(() => {
    if (!user?.id) return null;
    return buildSipAgentProfile({
      id: user.id,
      extension: user.extension,
      name: user.name,
      role: user.role,
      sipPassword: user.sipPassword,
    });
  }, [user?.extension, user?.id, user?.name, user?.role, user?.sipPassword]);
  const backendSipReachable = useMemo(() => (
    user?.role === "agent" && isBackendSipEndpointReachable(backendSipSnapshot?.sipStatus)
  ), [backendSipSnapshot?.sipStatus, user?.role]);
  const sipRegistered = sipTransportRegistered;
  const sipStatusLabel = sipRegistered ? "SIP Online" : "SIP Offline";
  const resolvedSipStatusReason = useMemo(() => {
    if (sipTransportRegistered) {
      if (user?.role === "agent" && backendSipSnapshot?.sipStatus) {
        return `Web phone ready. PBX status: ${backendSipSnapshot.sipStatus}`;
      }
      return sipStatusReason;
    }

    if (user?.role === "agent" && backendSipReachable) {
      return `${sipStatusReason} PBX status: ${backendSipSnapshot?.sipStatus || "reachable"}.`;
    }

    if (user?.role === "agent" && backendSipSnapshot?.sipStatus) {
      return `${sipStatusReason} PBX status: ${backendSipSnapshot.sipStatus}`;
    }

    return sipStatusReason;
  }, [backendSipReachable, backendSipSnapshot?.sipStatus, sipStatusReason, sipTransportRegistered, user?.role]);
  useEffect(() => {
    backendSipStatusRef.current = backendSipSnapshot?.sipStatus || "";
  }, [backendSipSnapshot?.sipStatus]);
  const getVisiblePhoneLabel = useCallback((value: string | null | undefined) => {
    const normalized = normalizePhoneNumber(value);
    if (!normalized) return "Unknown";
    return user?.role === "agent" ? hidePhoneDisplay(normalized) : normalized;
  }, [user?.role]);
  const resolveIncomingCallerPhones = useCallback((session: SipSessionLike | null) => {
    const request = session?.request;
    const headerValues = SIP_ORIGINAL_CALLER_HEADERS.flatMap((headerName) => ([
      request?.getHeader?.(headerName),
      ...(request?.getHeaders?.(headerName) || []),
    ]));
    return uniqueNormalizedPhones([
      session?.remoteIdentity?.uri?.user,
      session?.remoteIdentity?.displayName,
      session?.remoteIdentity?.friendlyName,
      request?.from?.uri?.user,
      request?.from?.displayName,
      request?.from?.friendlyName,
      ...headerValues,
    ]);
  }, []);
  const refreshOperationalData = useCallback(async () => {
    if (!isAuthenticated) return;
    if (operationalRefreshInFlightRef.current) return;
    operationalRefreshInFlightRef.current = true;
    try {
      const isAgentUser = user?.role === "agent";
      const [callsData, fuData, breaksData] = isAgentUser
        ? await Promise.all([
          api.getCalls(operationalCallsLimit),
          api.getFollowUps(),
          user?.id ? api.getBreaks({ agentId: user.id, limit: 40 }) : Promise.resolve([]),
        ])
        : await Promise.all([
          Promise.resolve([]),
          Promise.resolve([]),
          api.getBreaks({ limit: 80 }),
        ]);
      if (isAgentUser && Array.isArray(callsData)) {
        setCalls((prev) => mergeCallsPreservingLocalLiveCall({
          incomingCalls: callsData,
          existingCalls: prev,
          activeCallId: activeCallIdRef.current,
        }));
      }
      if (isAgentUser && Array.isArray(fuData)) setFollowUps(fuData);
      if (Array.isArray(breaksData)) setBreakLogs(dedupeBreakLogs(breaksData));
    } catch (error) {
      console.error("Operational data refresh failed:", error);
    } finally {
      operationalRefreshInFlightRef.current = false;
    }
  }, [isAuthenticated, operationalCallsLimit, user?.id, user?.role]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCalls([]);
      setFollowUps([]);
      setBreakLogs([]);
      return;
    }

    let cancelled = false;
    const loadRates = async () => {
      try {
        const ratesData = await api.getRates();
        if (cancelled) return;
        if (Array.isArray(ratesData) && ratesData.length) setMetalRates(ratesData);
      } catch (e) { console.error("DB load error:", e); }
    };
    void loadRates();

    const savedBreak = readSessionStorageJson<{ id?: string; start?: number; breakType?: AgentBreakStatus; startedAt?: string } | null>(BREAK_SESSION_KEY, null);
    const backendBreakStatus = normalizeBreakStatus(user?.status);
    if (savedBreak && backendBreakStatus && (typeof savedBreak.start === "number" || Boolean(savedBreak.id))) {
      try {
        const start = typeof savedBreak.start === "number" ? savedBreak.start : null;
        setAgentStatus(savedBreak.breakType || backendBreakStatus);
        setBreakStartTime(start);
      } catch (error) {
        console.error("Failed to restore break state:", error);
      }
    } else if (savedBreak) {
      removeSessionStorageItem(BREAK_SESSION_KEY);
    }

    const savedFollowUp = readSessionStorageJson<{ start?: number } | null>(FOLLOWUP_SESSION_KEY, null);
    const shouldRestoreFollowUp = user?.role === "agent"
      && user?.status === "follow-up";
    if (shouldRestoreFollowUp && savedFollowUp && typeof savedFollowUp.start === "number") {
      try {
        const start = savedFollowUp.start;
        setAgentStatus("follow-up");
        setFollowUpStartTime(start);
      } catch (error) {
        console.error("Failed to restore followup state:", error);
      }
    } else if (savedFollowUp) {
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
    }

    const operationalLoadDelay = user?.role === "agent" ? 5000 : 0;
    const initialOperationalLoad = window.setTimeout(() => {
      void refreshOperationalData();
    }, operationalLoadDelay);
    const intervalMs = user?.role === "agent" ? 60000 : 120000;
    const interval = window.setInterval(() => {
      void refreshOperationalData();
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearTimeout(initialOperationalLoad);
      window.clearInterval(interval);
    };
  }, [isAuthenticated, operationalCallsLimit, refreshOperationalData, user?.followUpStartedAt, user?.role, user?.status]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let inFlight = false;
    const interval = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void api.getRates()
        .then((ratesData) => {
          if (Array.isArray(ratesData) && ratesData.length) setMetalRates(ratesData);
        })
        .finally(() => {
          inFlight = false;
        });
    }, 120000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent") return;

    const persistedBreakStatus = normalizeBreakStatus(user.status)
      || normalizeBreakStatus(activeBreakLog?.breakType)
      || (hasActiveBreak ? "on-break" : null);

    if (persistedBreakStatus && agentStatus !== persistedBreakStatus) {
      const activeBreakStartedAt = activeBreakLog?.startedAt
        ? new Date(activeBreakLog.startedAt).getTime()
        : (activeBreakLog?.createdAt ? new Date(activeBreakLog.createdAt).getTime() : Date.now());
      setAgentStatus(persistedBreakStatus);
      setFollowUpStartTime(null);
      setBreakStartTime((current) => current ?? activeBreakStartedAt);
      if (activeBreakLog) {
        writeSessionStorageItem(BREAK_SESSION_KEY, JSON.stringify({
          id: activeBreakLog.id,
          start: activeBreakStartedAt,
          breakType: normalizeBreakStatus(activeBreakLog.breakType) || persistedBreakStatus,
          startedAt: activeBreakLog.startedAt || activeBreakLog.createdAt || "",
        }));
      }
      return;
    }

    if (user.status === "outbound-auto" && agentStatus !== "outbound-auto") {
      setAgentStatus("outbound-auto");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      return;
    }

    if (user.status === "manual-outgoing" && hasOutgoingAccess && agentStatus !== "manual-outgoing") {
      setAgentStatus("manual-outgoing");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      return;
    }

    if (user.status === "follow-up" && hasFollowUpAccess && agentStatus !== "follow-up") {
      const startedAt = new Date(user.followUpStartedAt || "").getTime();
      const safeStart = Number.isNaN(startedAt) ? Date.now() : startedAt;
      setAgentStatus("follow-up");
      setBreakStartTime(null);
      setFollowUpStartTime((current) => current ?? safeStart);
      writeSessionStorageItem(FOLLOWUP_SESSION_KEY, JSON.stringify({ start: safeStart }));
      removeSessionStorageItem(BREAK_SESSION_KEY);
      return;
    }

    if (user.status === "follow-up" && !hasFollowUpAccess && agentStatus === "follow-up") {
      setAgentStatus(hasOutgoingAccess ? "outbound-auto" : "active");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      void api.updateAgent(user.id, {
        status: hasOutgoingAccess ? "outbound-auto" : "active",
        followUpStartedAt: "",
        followUpDuration: "",
      });
      return;
    }

    if ((user.status === "active" || user.status === "inactive") && !hasActiveBreak && !user.followUpStartedAt && (agentStatus === "follow-up" || agentStatus === "outbound-auto" || agentStatus === "manual-outgoing")) {
      setAgentStatus("active");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      return;
    }

    if ((user.status === "active" || user.status === "inactive") && !hasActiveBreak && !user.followUpStartedAt && !followUpStartTime && agentStatus !== "active") {
      setAgentStatus("active");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
    }
  }, [activeBreakLog, agentStatus, followUpStartTime, hasActiveBreak, hasFollowUpAccess, hasOutgoingAccess, isAuthenticated, user?.followUpStartedAt, user?.id, user?.role, user?.status]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent") return;
    setStatusClock(Date.now());
    const interval = window.setInterval(() => {
      setStatusClock(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent" || effectiveAgentStatus !== "follow-up" || !followUpStartTime) return;

    const syncFollowUpStatus = () => {
      void api.updateAgent(user.id, {
        status: "follow-up",
        followUpStartedAt: new Date(followUpStartTime).toISOString(),
        followUpDuration: formatElapsedTimeFrom(followUpStartTime),
      });
    };

    syncFollowUpStatus();
    const interval = window.setInterval(syncFollowUpStatus, 30000);
    return () => window.clearInterval(interval);
  }, [effectiveAgentStatus, followUpStartTime, isAuthenticated, user?.id, user?.role]);

  const updateMetalRate = (label: string, value: string) => { setMetalRates(prev => prev.map(r => r.label === label ? { ...r, value } : r)); toast.success(`${label} updated`); api.updateRate(label, value); };
  const setAgentWorkStatus = useCallback((nextStatus: AgentWorkStatus) => {
    if (user?.role !== "agent") return;
    if (callPhase !== "idle") {
      toast.error("End the current call before changing agent status");
      return;
    }
    if (user.status === "inactive") {
      toast.error("Your account is inactive");
      return;
    }
    if (nextStatus === "outbound-auto" && !hasOutgoingAccess) {
      toast.error("Outgoing access is not enabled for your user");
      return;
    }
    if (nextStatus === "manual-outgoing" && !hasOutgoingAccess) {
      toast.error("Outgoing access is not enabled for your user");
      return;
    }
    if (nextStatus === "follow-up" && !hasFollowUpAccess) {
      toast.error("Follow-Up access is not enabled for your user");
      return;
    }
    if (effectiveAgentStatus === nextStatus) return;
    let resolvedNextStatus: AgentWorkStatus = nextStatus;

    if (isBreakStatus(effectiveAgentStatus)) {
      const breakEndedAt = Date.now();
      const duration = formatElapsedTimeFrom(breakStartTime, breakEndedAt);
      const savedBreak = readSessionStorageJson<{
        id?: string;
        createdAt?: string;
        breakType?: AgentBreakStatus;
        startedAt?: string;
        returnStatus?: "active" | "outbound-auto" | "follow-up" | "manual-outgoing";
      }>(BREAK_SESSION_KEY, {});
      resolvedNextStatus = nextStatus === "active"
        ? (isAgentWorkMode(savedBreak.returnStatus) ? savedBreak.returnStatus : resolveAgentModeFromAccess(user))
        : nextStatus;
      const breakId = savedBreak.id || activeBreakLog?.id || "BRK-" + breakEndedAt;
      const endTime = new Date(breakEndedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const startedAt = savedBreak.startedAt
        || activeBreakLog?.startedAt
        || activeBreakLog?.createdAt
        || new Date(breakStartTime || breakEndedAt).toISOString();
      const endedAt = new Date(breakEndedAt).toISOString();
      setBreakLogs((prev) => dedupeBreakLogs(prev.map((breakLog) => (
        breakLog.id === breakId ? { ...breakLog, startTime: breakLog.startTime || new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }), startedAt, endTime, endedAt, duration } : breakLog
      ))));
      setBreakStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      toast.success(`Break ended (${duration})`);
      void api.updateAgent(user.id, {
        status: resolvedNextStatus,
        breakId,
        breakType: activeBreakLog?.breakType || savedBreak.breakType || effectiveAgentStatus,
        breakStartTime: activeBreakLog?.startTime || new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
        breakStartedAt: startedAt,
        breakEndTime: endTime,
        breakEndedAt: endedAt,
        breakDuration: duration,
        followUpStartedAt: "",
        followUpDuration: "",
      });
    }

    if (effectiveAgentStatus === "follow-up") {
      const duration = formatElapsedTimeFrom(followUpStartTime || user.followUpStartedAt || null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      void api.updateAgent(user.id, {
        status: resolvedNextStatus,
        followUpStartedAt: "",
        followUpDuration: duration,
      });
      toast.success(`Followup ended (${duration})`);
    }

    if (isBreakStatus(nextStatus)) {
      const now = Date.now();
      const createdAt = new Date(now).toISOString();
      const startTime = new Date(now).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const returnStatus = isAgentWorkMode(effectiveAgentStatus) ? effectiveAgentStatus : resolveAgentModeFromAccess(user);
      setAgentStatus(nextStatus);
      setFollowUpStartTime(null);
      setBreakStartTime(now);
      updateUser({
        status: nextStatus,
        followUpStartedAt: "",
        followUpDuration: "",
      });
      const breakId = "BRK-" + now;
      const breakLog = {
        id: breakId,
        agentId: user.id,
        agentName: user.name || "",
        breakType: nextStatus,
        startTime,
        startedAt: createdAt,
        createdAt,
      };
      setBreakLogs((prev) => dedupeBreakLogs([breakLog, ...prev]));
      void api.updateAgent(user.id, {
        status: nextStatus,
        breakId,
        breakStartTime: breakLog.startTime,
        breakStartedAt: createdAt,
        agentName: user.name || "",
        breakType: nextStatus,
      });
      writeSessionStorageItem(BREAK_SESSION_KEY, JSON.stringify({ id: breakId, start: now, createdAt, breakType: nextStatus, startedAt: createdAt, returnStatus }));
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      toast.info(nextStatus === "on-break" ? "You are now on break" : `${getAgentStatusLabel(nextStatus)} started`);
      return;
    }

    if (resolvedNextStatus === "outbound-auto") {
      setAgentStatus("outbound-auto");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      updateUser({
        status: "outbound-auto",
        followUpStartedAt: "",
        followUpDuration: "",
      });
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      void api.updateAgent(user.id, {
        status: "outbound-auto",
        followUpStartedAt: "",
        followUpDuration: "",
      });
      toast.info("You are now in Outbound Auto Calls");
      return;
    }

    if (resolvedNextStatus === "manual-outgoing") {
      setAgentStatus("manual-outgoing");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      updateUser({
        status: "manual-outgoing",
        followUpStartedAt: "",
        followUpDuration: "",
      });
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
      void api.updateAgent(user.id, {
        status: "manual-outgoing",
        followUpStartedAt: "",
        followUpDuration: "",
      });
      toast.info("You are now in Manual Dial");
      return;
    }

    if (resolvedNextStatus === "follow-up" && hasFollowUpAccess) {
      const now = Date.now();
      const followUpStartedAt = new Date(now).toISOString();
      setAgentStatus("follow-up");
      setBreakStartTime(null);
      setFollowUpStartTime(now);
      updateUser({
        status: "follow-up",
        followUpStartedAt,
        followUpDuration: "00:00",
      });
      writeSessionStorageItem(FOLLOWUP_SESSION_KEY, JSON.stringify({ start: now }));
      removeSessionStorageItem(BREAK_SESSION_KEY);
      void api.updateAgent(user.id, {
        status: "follow-up",
        followUpStartedAt,
        followUpDuration: "00:00",
      });
      toast.info("You are now in Follow-Up");
      return;
    }

    setAgentStatus("active");
    setBreakStartTime(null);
    setFollowUpStartTime(null);
    updateUser({
      status: "active",
      followUpStartedAt: "",
      followUpDuration: "",
    });
    removeSessionStorageItem(BREAK_SESSION_KEY);
    removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
    if (!isBreakStatus(effectiveAgentStatus)) {
      void api.updateAgent(user.id, {
        status: "active",
        followUpStartedAt: "",
        followUpDuration: "",
      });
    }
  }, [activeBreakLog, breakStartTime, callPhase, effectiveAgentStatus, followUpStartTime, hasFollowUpAccess, hasIncomingAccess, hasOutgoingAccess, updateUser, user]);

  const toggleBreak = () => {
    setAgentWorkStatus(isBreakStatus(effectiveAgentStatus) ? "active" : "on-break");
  };

  const activeAgentExts = Array.from({ length: MAX_AGENT_COUNT }, (_, index) => String(2001 + index));
  const addMetalRate = (label: string, value: string) => { setMetalRates(prev => [...prev, { label, value }]); toast.success(`${label} added`); api.addRate(label, value); };
  const deleteMetalRate = (label: string) => {
    setMetalRates((prev) => prev.filter((rate) => rate.label !== label));
    toast.success(`${label} deleted`);
    void api.deleteRate(label);
  };
  const reminderShownRef = useRef<string | null>(null);
  const dismissedReminderKeysRef = useRef<Set<string>>(new Set());

  // SIP.js refs
  const uaRef = useRef<SipUserAgent | null>(null);
  const regRef = useRef<SipRegisterer | null>(null);
  const sessionRef = useRef<SipSessionLike | null>(null);
  const liveMonitorSessionRef = useRef<PendingLiveMonitorRequest | null>(null);
  const sipModuleRef = useRef<SipModule | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const pendingOutboundCallIdRef = useRef("");
  const nextFinalizeStatusRef = useRef<ManagedCall["status"] | null>(null);
  const finalizeActiveCallRef = useRef<(finalStatus: ManagedCall["status"], fallbackDuration?: string) => void>(() => {});
  const skipSessionTerminationSideEffectsRef = useRef<SipSessionLike | null>(null);
  const activeAutoDialLeadRef = useRef<AutoDialLeadRecord | null>(null);
  const queuedAutoDialLeadRef = useRef<AutoDialLeadRecord | null>(null);
  const queuedAutoDialClaimedLeadIdRef = useRef("");
  const autoDialConnectedRef = useRef(false);
  const autoDialPollingRef = useRef(false);
  const autoDialAlertLeadRef = useRef<AutoDialLeadRecord | null>(null);
  const autoDialSnoozeRef = useRef<{ leadId: string; until: number } | null>(null);
  const lastAutoDialLeadIdRef = useRef<string | null>(null);
  const autoDialEnabledRef = useRef<boolean | null>(autoDialEnabled);
  const freshLeadAutoConnectEnabledRef = useRef(true);
  const freshLeadAutoConnectIntervalSecondsRef = useRef(10);
  const previousAutoDialEnabledRef = useRef<boolean | null>(null);
  const backendSipStatusRef = useRef("");
  const recentlyEndedCustomerRef = useRef<RecentEndedCustomer | null>(null);
  const reconnectSuppressionNoticeRef = useRef<string | null>(null);
  const sipReconnectTimerRef = useRef<number | null>(null);
  const manualOutboundCancelRef = useRef(false);
  const manualCallEndRef = useRef(false);
  const outboundDialStartInFlightRef = useRef(false);
  const incomingAnswerInFlightRef = useRef(false);
  const incomingTransferContextRef = useRef<TransferContextRecord | null>(null);
  const callRingStartedAtRef = useRef<string>("");
  const callAnsweredAtRef = useRef<string>("");
  const incomingRingStartedAtRef = useRef<string>("");
  const finalizedCallSnapshotsRef = useRef<Map<string, FinalizedCallSnapshot>>(new Map());
  const outboundRingbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const outboundRingbackPlaybackTokenRef = useRef(0);
  const ringbackContextRef = useRef<AudioContext | null>(null);
  const ringbackIntervalRef = useRef<number | null>(null);
  const incomingAlertAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingAlertPlaybackTokenRef = useRef(0);
  const incomingAlertContextRef = useRef<AudioContext | null>(null);
  const incomingAlertIntervalRef = useRef<number | null>(null);
  const incomingAlertSuspendTimeoutRef = useRef<number | null>(null);
  const incomingAutoAnswerTimerRef = useRef<number | null>(null);
  const answerIncomingRef = useRef<() => Promise<boolean>>(async () => false);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAudioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const remoteAudioGainRef = useRef<GainNode | null>(null);
  const remoteAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const remoteAudioStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioPrimeTokenRef = useRef(0);
  const remoteAudioTrackSignatureRef = useRef("");
  const remoteAudioPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioTrackHandlerRef = useRef<((event: RTCTrackEvent) => void) | null>(null);
  const attachAudioRetryTimeoutsRef = useRef<number[]>([]);
  const fallbackLocalAudioStreamRef = useRef<MediaStream | null>(null);
  const microphoneRepairInFlightRef = useRef(false);
  const microphonePreparationAttemptRef = useRef(0);
  const localAudioHealthIntervalRef = useRef<number | null>(null);
  const lastSenderPacketCountRef = useRef<number | null>(null);
  const lastSenderBytesSentRef = useRef<number | null>(null);
  const lastSenderAudioEnergyRef = useRef<number | null>(null);
  const lastReceiverPacketCountRef = useRef<number | null>(null);
  const lastReceiverBytesReceivedRef = useRef<number | null>(null);
  const stalledSenderChecksRef = useRef(0);
  const silentSenderChecksRef = useRef(0);
  const stalledReceiverChecksRef = useRef(0);
  const connectedMediaRepairInFlightRef = useRef(false);
  const microphoneFallbackToastRef = useRef("");
  const disconnectedInputToastRef = useRef("");
  const disconnectedOutputToastRef = useRef("");
  const repairSessionMicrophoneRef = useRef<() => void>(() => {});
  const attachAudioRef = useRef<() => void>(() => {});
  const canReceiveIncomingCallsRef = useRef(canReceiveIncomingCalls);
  const effectiveAgentStatusRef = useRef(effectiveAgentStatus);
  const callPhaseRef = useRef(callPhase);
  const callWrapUpPendingRef = useRef(callWrapUpPending);
  const callStartedAtRef = useRef<number | null>(callStartedAt);
  const lastPersistedLiveDurationRef = useRef<{ callId: string; seconds: number }>({ callId: "", seconds: 0 });
  const assignedLanguagesRef = useRef<string[]>(assignedLanguages);
  const isMutedRef = useRef(isMuted);
  const isOnHoldRef = useRef(isOnHold);
  const blockedPhonesRef = useRef<Set<string>>(new Set());
  const callsRef = useRef<ManagedCall[]>(calls);
  const dialedNumberRef = useRef(dialedNumber);
  const incomingDialogOpenRef = useRef(incomingDialogOpen);
  const incomingDraftPhoneRef = useRef(incomingDraftPhone);
  const incomingDialogCallIdRef = useRef(incomingDialogCallId);
  const holdMusicEngineRef = useRef<HoldMusicEngine | null>(null);
  const holdToggleInFlightRef = useRef(false);
  const holdModeRef = useRef<"sip" | "stream" | null>(null);

  const beginMicrophonePreparationAttempt = useCallback(() => {
    microphonePreparationAttemptRef.current += 1;
    return microphonePreparationAttemptRef.current;
  }, []);

  const invalidateMicrophonePreparationAttempt = useCallback(() => {
    microphonePreparationAttemptRef.current += 1;
  }, []);

  const isCurrentMicrophonePreparationAttempt = useCallback((attempt: number) => (
    microphonePreparationAttemptRef.current === attempt
  ), []);

  useEffect(() => {
    canReceiveIncomingCallsRef.current = canReceiveIncomingCalls;
  }, [canReceiveIncomingCalls]);

  useEffect(() => {
    effectiveAgentStatusRef.current = effectiveAgentStatus;
  }, [effectiveAgentStatus]);

  useEffect(() => {
    autoDialAlertLeadRef.current = autoDialAlertLead;
  }, [autoDialAlertLead]);

  useEffect(() => {
    queuedAutoDialLeadRef.current = queuedAutoDialLead;
  }, [queuedAutoDialLead]);

  useEffect(() => {
    autoDialEnabledRef.current = autoDialEnabled;
  }, [autoDialEnabled]);
  useEffect(() => {
    freshLeadAutoConnectEnabledRef.current = freshLeadAutoConnectEnabled;
  }, [freshLeadAutoConnectEnabled]);
  useEffect(() => {
    freshLeadAutoConnectIntervalSecondsRef.current = freshLeadAutoConnectIntervalSeconds;
  }, [freshLeadAutoConnectIntervalSeconds]);

  useEffect(() => {
    callPhaseRef.current = callPhase;
  }, [callPhase]);

  useEffect(() => {
    callsRef.current = calls;
  }, [calls]);

  useEffect(() => {
    dialedNumberRef.current = dialedNumber;
  }, [dialedNumber]);

  useEffect(() => {
    incomingDialogOpenRef.current = incomingDialogOpen;
  }, [incomingDialogOpen]);

  useEffect(() => {
    incomingDraftPhoneRef.current = incomingDraftPhone;
  }, [incomingDraftPhone]);

  useEffect(() => {
    incomingDialogCallIdRef.current = incomingDialogCallId;
  }, [incomingDialogCallId]);

  useEffect(() => {
    if (!isProtectedCallWorkflowActive({
      callPhase,
      incomingDialogOpen,
      callWrapUpPending,
      hasAutoDialAlert: Boolean(autoDialAlertLead),
    })) {
      markActiveCallFinished();
      return;
    }

    markActiveCallStarted();
  }, [autoDialAlertLead, callPhase, callWrapUpPending, incomingDialogOpen]);

  useEffect(() => {
    if (!shouldWarnBeforeUnloadForCallWorkflow({ callPhase, incomingDialogOpen })) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [callPhase, incomingDialogOpen]);

  useEffect(() => {
    callWrapUpPendingRef.current = callWrapUpPending;
  }, [callWrapUpPending]);

  useEffect(() => {
    callStartedAtRef.current = callStartedAt;
  }, [callStartedAt]);

  const getLiveCallRestoreTimestamp = useCallback((call: ManagedCall) => {
    const candidates = [
      call.answeredAt,
      call.ringStartedAt,
      call.createdAt,
      call.date && call.time ? `${call.date} ${call.time}` : "",
      call.date,
    ];

    for (const candidate of candidates) {
      const timestamp = new Date(candidate || "").getTime();
      if (Number.isFinite(timestamp)) return timestamp;
    }

    return 0;
  }, []);

  const restoreAgentLiveCallWorkflow = useCallback((nextCalls: ManagedCall[]) => {
    if (user?.role !== "agent" || !user.id) return;
    if (callPhaseRef.current !== "idle") return;
    if (activeCallIdRef.current || incomingDialogOpenRef.current || callWrapUpPendingRef.current) return;

    const now = Date.now();
    const restorableCall = nextCalls
      .filter((call) => {
        if (call.agentId !== user.id) return false;
        if (!isLiveManagedCall(call)) return false;
        const timestamp = getLiveCallRestoreTimestamp(call);
        if (!timestamp) return true;
        return now - timestamp <= RESTORABLE_LIVE_CALL_MAX_AGE_MS;
      })
      .sort((a, b) => getLiveCallRestoreTimestamp(b) - getLiveCallRestoreTimestamp(a))[0];

    if (!restorableCall) return;

    const normalizedPhone = normalizePhoneNumber(restorableCall.callerId);
    const visiblePhone = normalizedPhone || restorableCall.callerId || "";
    const answeredAt = restorableCall.answeredAt || restorableCall.ringStartedAt || restorableCall.createdAt || new Date().toISOString();
    const ringStartedAt = restorableCall.ringStartedAt || answeredAt;
    const startedAt = new Date(answeredAt).getTime();

    activeCallIdRef.current = restorableCall.id;
    callRingStartedAtRef.current = ringStartedAt;
    callAnsweredAtRef.current = answeredAt;
    callWrapUpPendingRef.current = false;
    setCallWrapUpPending(false);
    callPhaseRef.current = "connected";
    setCallPhase("connected");

    if (Number.isFinite(startedAt)) {
      callStartedAtRef.current = startedAt;
      setCallStartedAt(startedAt);
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }

    if (restorableCall.direction === "incoming") {
      incomingDialogCallIdRef.current = restorableCall.id;
      incomingDraftPhoneRef.current = visiblePhone;
      incomingDialogOpenRef.current = true;
      setIncomingDialogCallId(restorableCall.id);
      setIncomingDraftPhone(visiblePhone);
      setIncomingDialogOpen(true);
      return;
    }

    setDialedNumber(visiblePhone);
  }, [getLiveCallRestoreTimestamp, user?.id, user?.role]);

  useEffect(() => {
    restoreAgentLiveCallWorkflow(calls);
  }, [calls, restoreAgentLiveCallWorkflow]);

  const resetLiveCallTiming = useCallback(() => {
    pendingOutboundCallIdRef.current = "";
    callStartedAtRef.current = null;
    callRingStartedAtRef.current = "";
    callAnsweredAtRef.current = "";
    incomingRingStartedAtRef.current = "";
    lastPersistedLiveDurationRef.current = { callId: "", seconds: 0 };
    setElapsedSeconds(0);
    setCallStartedAt(null);
  }, []);

  const clearIncomingDialogSession = useCallback(() => {
    incomingDialogCallIdRef.current = "";
    setIncomingDialogCallId("");
  }, []);

  useEffect(() => {
    assignedLanguagesRef.current = assignedLanguages;
  }, [assignedLanguages]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isOnHoldRef.current = isOnHold;
  }, [isOnHold]);

  const resetMuteState = useCallback(() => {
    isMutedRef.current = false;
    setIsMuted(false);

    try {
      fallbackLocalAudioStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      const peerConnection = getSessionPeerConnection(sessionRef.current);
      peerConnection?.getSenders().forEach((sender) => {
        if (sender.track?.kind === "audio") {
          sender.track.enabled = true;
        }
      });
    } catch (error) {
      console.error("Mute reset failed:", error);
    }
  }, []);

  const scheduleHoldMusicNotes = useCallback((engine: HoldMusicEngine) => {
    const lookAheadSeconds = 1.6;

    while (engine.nextBeatTime < engine.context.currentTime + lookAheadSeconds) {
      const step = engine.step;
      const beatTime = engine.nextBeatTime;
      const melodyFrequency = HOLD_MUSIC_MELODY[step % HOLD_MUSIC_MELODY.length] ?? HOLD_MUSIC_MELODY[0];
      const bassFrequency = HOLD_MUSIC_BASS[step % HOLD_MUSIC_BASS.length] ?? HOLD_MUSIC_BASS[0];

      engine.melodyOscillator.frequency.setValueAtTime(melodyFrequency, beatTime);
      engine.melodyGain.gain.cancelScheduledValues(beatTime);
      engine.melodyGain.gain.setValueAtTime(0.0001, beatTime);
      engine.melodyGain.gain.linearRampToValueAtTime(0.05, beatTime + 0.04);
      engine.melodyGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + (HOLD_MUSIC_BEAT_SECONDS * 0.92));

      engine.bassOscillator.frequency.setValueAtTime(bassFrequency, beatTime);
      engine.bassGain.gain.cancelScheduledValues(beatTime);
      engine.bassGain.gain.setValueAtTime(step % 2 === 0 ? 0.018 : 0.012, beatTime);
      engine.bassGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + (HOLD_MUSIC_BEAT_SECONDS * 1.2));

      if (step % 4 === 0) {
        const padFrequency = HOLD_MUSIC_PAD[Math.floor(step / 4) % HOLD_MUSIC_PAD.length] ?? HOLD_MUSIC_PAD[0];
        engine.padOscillator.frequency.setValueAtTime(padFrequency, beatTime);
        engine.padGain.gain.cancelScheduledValues(beatTime);
        engine.padGain.gain.setValueAtTime(0.0001, beatTime);
        engine.padGain.gain.linearRampToValueAtTime(0.01, beatTime + 0.08);
        engine.padGain.gain.linearRampToValueAtTime(0.006, beatTime + (HOLD_MUSIC_BEAT_SECONDS * 3.4));
        engine.padGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + (HOLD_MUSIC_BEAT_SECONDS * 4));
      }

      engine.nextBeatTime += HOLD_MUSIC_BEAT_SECONDS;
      engine.step += 1;
    }
  }, []);

  const stopHoldMusicPlayback = useCallback(() => {
    const engine = holdMusicEngineRef.current;
    if (!engine) return;

    if (engine.schedulerIntervalId !== null) {
      window.clearInterval(engine.schedulerIntervalId);
    }

    try {
      engine.melodyOscillator.stop();
      engine.bassOscillator.stop();
      engine.padOscillator.stop();
    } catch (error) {
      console.debug("Hold music stop skipped:", error);
    }

    holdMusicEngineRef.current = null;
    void engine.context.close().catch((error) => {
      console.debug("Hold music context close skipped:", error);
    });
  }, []);

  const ensureHoldMusicStream = useCallback(async () => {
    const existingEngine = holdMusicEngineRef.current;
    if (existingEngine) {
      if (existingEngine.context.state === "suspended") {
        await existingEngine.context.resume();
      }
      return existingEngine.destination.stream;
    }

    const AudioContextCtor = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("This browser does not support hold music");
    }

    const context = new AudioContextCtor();
    const destination = context.createMediaStreamDestination();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 16;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.24;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;

    const masterGain = context.createGain();
    masterGain.gain.value = 0.9;

    const melodyOscillator = context.createOscillator();
    melodyOscillator.type = "triangle";
    const melodyGain = context.createGain();
    melodyGain.gain.value = 0.0001;
    melodyOscillator.connect(melodyGain);
    melodyGain.connect(filter);

    const bassOscillator = context.createOscillator();
    bassOscillator.type = "sine";
    const bassGain = context.createGain();
    bassGain.gain.value = 0.0001;
    bassOscillator.connect(bassGain);
    bassGain.connect(filter);

    const padOscillator = context.createOscillator();
    padOscillator.type = "sawtooth";
    const padGain = context.createGain();
    padGain.gain.value = 0.0001;
    padOscillator.connect(padGain);
    padGain.connect(filter);

    filter.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(destination);

    melodyOscillator.start();
    bassOscillator.start();
    padOscillator.start();

    const engine: HoldMusicEngine = {
      context,
      destination,
      melodyOscillator,
      melodyGain,
      bassOscillator,
      bassGain,
      padOscillator,
      padGain,
      schedulerIntervalId: null,
      nextBeatTime: context.currentTime + 0.05,
      step: 0,
    };

    scheduleHoldMusicNotes(engine);
    engine.schedulerIntervalId = window.setInterval(() => {
      scheduleHoldMusicNotes(engine);
    }, 250);
    holdMusicEngineRef.current = engine;

    if (context.state === "suspended") {
      await context.resume();
    }

    return destination.stream;
  }, [scheduleHoldMusicNotes]);

  const replaceSessionAudioStream = useCallback(async (
    session: SipSessionLike | null,
    stream: MediaStream,
  ) => {
    const peerConnection = getSessionPeerConnection(session);
    const sessionDescriptionHandler = getSessionDescriptionHandler(session);
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    if (!peerConnection || !audioTrack) {
      throw new Error("Active call audio is not available");
    }

    audioTrack.enabled = true;
    sessionDescriptionHandler?.enableSenderTracks?.(true);

    const audioSender = peerConnection.getSenders().find((sender) => sender.track?.kind === "audio")
      || getAudioTransceiver(peerConnection)?.sender
      || null;
    if (audioSender) {
      await audioSender.replaceTrack(audioTrack);
      if ("setStreams" in audioSender && typeof audioSender.setStreams === "function") {
        audioSender.setStreams(stream);
      }
    } else {
      peerConnection.addTrack(audioTrack, stream);
    }

    const localMediaStream = sessionDescriptionHandler?.localMediaStream ?? new MediaStream();
    localMediaStream.getAudioTracks().forEach((track) => {
      if (track.id !== audioTrack.id) {
        localMediaStream.removeTrack(track);
      }
    });
    if (!localMediaStream.getAudioTracks().some((track) => track.id === audioTrack.id)) {
      localMediaStream.addTrack(audioTrack);
    }
    if (sessionDescriptionHandler) {
      sessionDescriptionHandler.localMediaStream = localMediaStream;
    }

    const audioTransceiver = getAudioTransceiver(peerConnection, audioSender);
    if (audioTransceiver && (audioTransceiver.direction === "inactive" || audioTransceiver.direction === "recvonly")) {
      audioTransceiver.direction = "sendrecv";
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      blockedPhonesRef.current = new Set();
      return;
    }

    let cancelled = false;
    const loadBlockedPhones = async () => {
      const rows = await api.getBlockedNumbers().catch(() => []);
      if (cancelled || !Array.isArray(rows)) return;
      blockedPhonesRef.current = new Set(
        rows
          .map((row) => normalizePhoneNumber(row.phone))
          .filter(Boolean),
      );
    };

    void loadBlockedPhones();
    const interval = window.setInterval(() => {
      void loadBlockedPhones();
    // Blocked numbers change infrequently. Per-call checks still query the
    // exact number when needed, so the directory refresh can be much slower
    // without affecting call safety or routing.
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated]);

  const isBlockedPhone = useCallback(async (phone: string) => {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return false;
    if (blockedPhonesRef.current.has(normalized)) return true;

    const blockedState = await api
      .getBlockedNumber(normalized)
      .catch(() => ({ phone: normalized, blocked: false }));
    if (blockedState.blocked) {
      blockedPhonesRef.current.add(normalized);
      return true;
    }
    return false;
  }, []);

  const stopIncomingAlert = useCallback(() => {
    incomingAlertPlaybackTokenRef.current += 1;
    if (incomingAlertIntervalRef.current !== null) {
      window.clearInterval(incomingAlertIntervalRef.current);
      incomingAlertIntervalRef.current = null;
    }
    if (incomingAlertSuspendTimeoutRef.current !== null) {
      window.clearTimeout(incomingAlertSuspendTimeoutRef.current);
      incomingAlertSuspendTimeoutRef.current = null;
    }
    if (incomingAlertContextRef.current?.state === "running") {
      incomingAlertSuspendTimeoutRef.current = window.setTimeout(() => {
        if (incomingAlertIntervalRef.current === null && incomingAlertContextRef.current?.state === "running") {
          void incomingAlertContextRef.current.suspend().catch(() => {});
        }
        incomingAlertSuspendTimeoutRef.current = null;
      }, 900);
    }
    const incomingAlertAudio = incomingAlertAudioRef.current;
    if (incomingAlertAudio) {
      incomingAlertAudio.pause();
      incomingAlertAudio.currentTime = 0;
    }
  }, []);

  const clearIncomingAutoAnswerTimer = useCallback(() => {
    if (incomingAutoAnswerTimerRef.current !== null) {
      window.clearTimeout(incomingAutoAnswerTimerRef.current);
      incomingAutoAnswerTimerRef.current = null;
    }
  }, []);

  const scheduleIncomingAutoAnswer = useCallback((invitation: SipSessionLike) => {
    clearIncomingAutoAnswerTimer();
    incomingAutoAnswerTimerRef.current = window.setTimeout(() => {
      incomingAutoAnswerTimerRef.current = null;
      if (
        sessionRef.current !== invitation
        || callPhaseRef.current !== "dialing"
        || incomingAnswerInFlightRef.current
        || callWrapUpPendingRef.current
      ) {
        return;
      }
      void answerIncomingRef.current();
    }, INCOMING_AUTO_ANSWER_DELAY_MS);
  }, [clearIncomingAutoAnswerTimer]);

  const getBlockedIncomingPhone = useCallback(async (session: SipSessionLike | null) => {
    const candidates = resolveIncomingCallerPhones(session);
    for (const candidate of candidates) {
      if (await isBlockedPhone(candidate)) {
        return candidate;
      }
    }
    return "";
  }, [isBlockedPhone, resolveIncomingCallerPhones]);

  const hasLocalActiveCall = useCallback(() => (
    Boolean(sessionRef.current)
    || Boolean(activeCallIdRef.current)
    || outboundDialStartInFlightRef.current
    || incomingAnswerInFlightRef.current
    || callWrapUpPendingRef.current
    || callPhaseRef.current !== "idle"
  ), []);

  const claimAgentCallSlot = useCallback(async (
    callId: string,
    direction: "incoming" | "outgoing" | "follow-up" | "manual-outgoing",
    fallbackError: string,
    customerNumber = "",
  ) => {
    if (user?.role !== "agent" || !user.id) return true;
    const preservedAgentStatus = (
      effectiveAgentStatus === "outbound-auto" || effectiveAgentStatus === "follow-up" || effectiveAgentStatus === "manual-outgoing"
    ) ? effectiveAgentStatus : "active";

    const reserveSlot = () => api.claimAgentCallSlot(user.id, {
      callId,
      direction,
      fallbackAgentStatus: preservedAgentStatus,
      customerNumber,
    });

    let result = await reserveSlot();
    const isActiveCallConflictError = (error: unknown) => {
      const normalizedError = String(error || "").trim().toLowerCase();
      return Boolean(normalizedError) && normalizedError.includes("another live call is already active");
    };
    const isRetryableClaimFailure = (error: unknown) => {
      const normalizedError = String(error || "").trim().toLowerCase();
      return Boolean(normalizedError) && (
      normalizedError.includes("unable to reserve the live call slot (503)")
      || normalizedError.includes("unable to reserve the live call slot (500)")
      || normalizedError.includes("lock wait timeout")
      || normalizedError.includes("deadlock")
      );
    };

    if (result?.error && isRetryableClaimFailure(result.error)) {
      for (let retryAttempt = 1; retryAttempt <= 2; retryAttempt += 1) {
        await waitForRuntimeMilliseconds(250 * retryAttempt);
        result = await reserveSlot();
        if (!result?.error) {
          break;
        }
      }
    }

    if (result?.error && isActiveCallConflictError(result.error)) {
      const resetResult = await api.resetAgentCallState(user.id, {
        nextStatus: preservedAgentStatus,
        finalCallStatus: "failed",
        reason: direction === "incoming"
          ? "Recovered stale live call slot before answering a new call"
          : "Recovered stale live call slot before starting a new call",
        forceHangup: true,
      });

      if (resetResult?.success) {
        result = await reserveSlot();
      }
    }

    if (result?.error) {
      toast.error(getUserFacingRuntimeErrorMessage(result.error, fallbackError));
      return false;
    }

    return true;
  }, [effectiveAgentStatus, user?.id, user?.role]);

  const releaseAgentCallSlotQuietly = useCallback(async (
    callId?: string,
    nextStatus: "active" | "inactive" | "outbound-auto" | "follow-up" | "manual-outgoing" = "active",
    force = false,
    options?: {
      forceHangup?: boolean;
      keepalive?: boolean;
    },
  ) => {
    if (user?.role !== "agent" || !user.id) return;

    const normalizedCallId = String(callId || "").trim();
    const preservedAgentStatus = (
      nextStatus === "active" && (effectiveAgentStatus === "outbound-auto" || effectiveAgentStatus === "follow-up" || effectiveAgentStatus === "manual-outgoing")
    ) ? effectiveAgentStatus : nextStatus;
    await api.releaseAgentCallSlot(user.id, {
      callId: normalizedCallId || undefined,
      nextStatus: preservedAgentStatus,
      force,
      forceHangup: options?.forceHangup,
      keepalive: options?.keepalive,
    }).catch((error) => {
      console.error("Failed to release agent call slot:", error);
    });
  }, [effectiveAgentStatus, user?.id, user?.role]);

  const ensureAgentCallSlotAvailable = useCallback(async (intent: "dial" | "answer") => {
    const activeCall = activeCallIdRef.current
      ? callsRef.current.find((call) => call.id === activeCallIdRef.current)
      : null;
    const isAnsweringCurrentIncomingDialog = canAnswerIncomingDialogWithoutBrowserConflict({
      currentSessionMatchesIncoming: (
        intent === "answer" &&
        Boolean(sessionRef.current) &&
        callPhaseRef.current === "dialing"
      ),
      callPhase: callPhaseRef.current,
      outboundDialStartInFlight: outboundDialStartInFlightRef.current,
      incomingAnswerInFlight: incomingAnswerInFlightRef.current,
      callWrapUpPending: callWrapUpPendingRef.current,
      activeCall,
      allowedCallId: incomingDialogCallIdRef.current,
    });
    if (isAnsweringCurrentIncomingDialog) {
      return true;
    }

    if (hasLocalActiveCall()) {
      toast.error(
        intent === "answer"
          ? "Another call is already active in this browser. Finish it before answering."
          : "Another call is already active in this browser. Finish it before dialing again.",
      );
      return false;
    }

    return true;
  }, [hasLocalActiveCall]);

  const resetAutoDialLead = useCallback(() => {
    activeAutoDialLeadRef.current = null;
    autoDialConnectedRef.current = false;
    lastAutoDialLeadIdRef.current = null;
    autoDialSnoozeRef.current = null;
    autoDialAlertLeadRef.current = null;
    setCurrentAutoDialLead(null);
    setAutoDialAlertLead(null);
  }, []);

  const clearQueuedAutoDialLead = useCallback(() => {
    queuedAutoDialLeadRef.current = null;
    queuedAutoDialClaimedLeadIdRef.current = "";
    setQueuedAutoDialLead(null);
  }, []);

  const releaseQueuedAutoDialLead = useCallback(async (
    lead: AutoDialLeadRecord | null | undefined = queuedAutoDialLeadRef.current,
    options?: { silent?: boolean },
  ) => {
    const queuedLead = lead || null;
    const claimedLeadId = queuedAutoDialClaimedLeadIdRef.current;
    if (!queuedLead?.id) {
      clearQueuedAutoDialLead();
      return true;
    }

    const shouldReleaseClaim = claimedLeadId === queuedLead.id && activeAutoDialLeadRef.current?.id !== queuedLead.id;
    clearQueuedAutoDialLead();

    if (!shouldReleaseClaim) {
      return true;
    }

    const result = await api.updateAutoDialLead(queuedLead.id, {
      status: "pending",
      lastError: "",
      retryAllowed: true,
    });

    if (result.success === false && !options?.silent) {
      toast.error(getUserFacingRuntimeErrorMessage(
        result.error,
        "Unable to return the selected auto call to the queue.",
      ));
    }

    return result.success !== false;
  }, [clearQueuedAutoDialLead]);

  useEffect(() => {
    const leadMatchesCurrentMode = (lead?: AutoDialLeadRecord | null) => (
      !lead
      || (effectiveAgentStatus === "outbound-auto" && isFreshAutoDialLead(lead))
      || (effectiveAgentStatus === "follow-up" && isFollowUpAutoDialLead(lead))
    );

    if (
      currentUserRole !== "agent"
      || (
        canReceiveAutoDialAssignments
        && leadMatchesCurrentMode(autoDialAlertLeadRef.current)
        && leadMatchesCurrentMode(currentAutoDialLead)
        && leadMatchesCurrentMode(queuedAutoDialLeadRef.current)
      )
    ) {
      return;
    }
    if (!autoDialAlertLeadRef.current && !currentAutoDialLead && !queuedAutoDialLeadRef.current) return;
    if (queuedAutoDialLeadRef.current) {
      void releaseQueuedAutoDialLead(undefined, { silent: true });
    }
    resetAutoDialLead();
  }, [canReceiveAutoDialAssignments, currentAutoDialLead, currentUserRole, effectiveAgentStatus, releaseQueuedAutoDialLead, resetAutoDialLead]);

  const loadAutoDialControlState = useCallback(async () => {
    if (!isAuthenticated || user?.role !== "agent") {
      setAutoDialEnabled(true);
      return;
    }

    try {
      const control = await api.getAutoDialControl();
      setAutoDialEnabled(control?.enabled !== false);
      setFreshLeadAutoConnectEnabled(control?.freshLeadAutoConnectEnabled !== false);
      setFreshLeadAutoConnectIntervalSeconds(Math.max(5, Math.min(120, Number(control?.freshLeadAutoConnectIntervalSeconds) || 10)));
    } catch (error) {
      console.error("Auto dial control poll failed:", error);
    }
  }, [isAuthenticated, user?.role]);

  const rememberRecentlyEndedCustomer = useCallback((phone: string | null | undefined) => {
    recentlyEndedCustomerRef.current = createRecentEndedCustomer(phone);
    reconnectSuppressionNoticeRef.current = null;
  }, []);

  const getReconnectSuppressedCustomer = useCallback((phone: string | null | undefined) => {
    const activeCustomer = getActiveRecentEndedCustomer(recentlyEndedCustomerRef.current);
    if (!activeCustomer) {
      recentlyEndedCustomerRef.current = null;
      reconnectSuppressionNoticeRef.current = null;
      return null;
    }
    return isReconnectSuppressed(phone, activeCustomer) ? activeCustomer : null;
  }, []);

  const notifyReconnectSuppressed = useCallback((phone: string | null | undefined, source: "incoming" | "auto-dial") => {
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) return;

    const suppressionKey = `${source}:${normalizedPhone}`;
    if (reconnectSuppressionNoticeRef.current === suppressionKey) return;

    reconnectSuppressionNoticeRef.current = suppressionKey;
    const visiblePhone = getVisiblePhoneLabel(normalizedPhone);
    toast.info(
      source === "incoming"
        ? `Ignored immediate reconnect for ${visiblePhone} after agent hangup`
        : `Skipped immediate auto-redial for ${visiblePhone} after agent hangup`,
    );
  }, [getVisiblePhoneLabel]);

  const getCurrentCallPhone = useCallback(() => {
    if (liveMonitorSessionRef.current) {
      return "";
    }

    const activeCall = activeCallIdRef.current
      ? calls.find((call) => call.id === activeCallIdRef.current)
      : null;

    return normalizePhoneNumber(
      activeCall?.callerId
      || dialedNumber
      || incomingDraftPhone
      || currentAutoDialLead?.mobileNumber
      || autoDialAlertLeadRef.current?.mobileNumber
      || "",
    );
  }, [calls, currentAutoDialLead?.mobileNumber, dialedNumber, incomingDraftPhone]);

  // Load SIP.js dynamically
  const getSIP = useCallback(async () => {
    if (!sipModuleRef.current) sipModuleRef.current = await import("sip.js");
    return sipModuleRef.current;
  }, []);

  const getSessionTerminationIntent = useCallback((
    phase: CallPhase,
    options?: { incomingDialog?: boolean; liveMonitor?: boolean },
  ): SessionTerminationIntent => {
    if (phase === "connected") return "hangup";
    if (options?.incomingDialog || options?.liveMonitor) return "reject";
    return "cancel";
  }, []);

  const issueSipSessionTerminationRequest = useCallback((
    session: SipSessionLike | null,
    intent: SessionTerminationIntent,
    options?: { preferDispose?: boolean },
  ) => {
    if (!session) {
      return Promise.resolve();
    }

    const attemptTermination = async () => {
      if (options?.preferDispose && session.dispose) {
        try {
          await session.dispose();
        } catch (error) {
          console.error("Failed to dispose the SIP session during termination:", error);
        }
      }

      switch (intent) {
        case "hangup":
          if (session.bye) return Promise.resolve(session.bye());
          if (session.cancel) return Promise.resolve(session.cancel());
          if (session.reject) return Promise.resolve(session.reject());
          return Promise.resolve();
        case "reject":
          if (session.reject) return Promise.resolve(session.reject());
          if (session.cancel) return Promise.resolve(session.cancel());
          if (session.bye) return Promise.resolve(session.bye());
          return Promise.resolve();
        case "cancel":
        default:
          if (session.cancel) return Promise.resolve(session.cancel());
          if (session.reject) return Promise.resolve(session.reject());
          if (session.bye) return Promise.resolve(session.bye());
          return Promise.resolve();
      }
    };

    return attemptTermination();
  }, []);

  const sendPageExitCallStateReset = useCallback(() => {
    if (user?.role !== "agent" || !user.id) return;
    const currentPhase = callPhaseRef.current;
    if (currentPhase === "connected" || currentPhase === "dialing") {
      return;
    }

    const hasActiveWorkflow = callPhaseRef.current !== "idle"
      || Boolean(sessionRef.current)
      || Boolean(activeCallIdRef.current)
      || Boolean(pendingOutboundCallIdRef.current)
      || Boolean(incomingDialogCallIdRef.current)
      || callWrapUpPendingRef.current;
    if (!hasActiveWorkflow) return;

    const payload = JSON.stringify({
      nextStatus: "active",
      finalCallStatus: "ended",
      reason: "Browser page exit cleanup",
      forceHangup: false,
    });
    const url = buildApiUrl(`/agents/${encodeURIComponent(user.id)}/call-state/reset`);

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) {
          return;
        }
      }
    } catch (error) {
      console.error("Page-exit call cleanup beacon failed:", error);
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch((error) => {
      console.error("Page-exit call cleanup request failed:", error);
    });
  }, [user?.id, user?.role]);

  const waitForSipSessionTermination = useCallback(async (
    session: SipSessionLike | null,
    timeoutMs = 4000,
  ) => {
    if (!session) return true;

    const SIP = await getSIP();
    if (session.state === SIP.SessionState.Terminated) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (terminated: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(terminated);
      };

      const timeoutId = window.setTimeout(() => {
        settle(false);
      }, Math.max(500, timeoutMs));

      session.stateChange.addListener((state) => {
        if (state === SIP.SessionState.Terminated) {
          settle(true);
        }
      });
    });
  }, [getSIP]);

  const terminateSipSession = useCallback(async (
    session: SipSessionLike | null,
    intent: SessionTerminationIntent,
    options?: { timeoutMs?: number; retryOnTimeout?: boolean },
  ) => {
    if (!session) return true;

    const SIP = await getSIP();
    if (session.state === SIP.SessionState.Terminated) {
      return true;
    }

    try {
      await issueSipSessionTerminationRequest(session, intent);
    } catch (error) {
      console.error("Failed to send SIP session termination request:", error);
    }

    const firstTimeoutMs = Math.max(1500, options?.timeoutMs ?? 4000);
    let terminated = await waitForSipSessionTermination(session, firstTimeoutMs);

    if (!terminated && options?.retryOnTimeout !== false && session.state !== SIP.SessionState.Terminated) {
      try {
        await issueSipSessionTerminationRequest(session, intent);
      } catch (error) {
        console.error("Failed to retry SIP session termination request:", error);
      }
      terminated = await waitForSipSessionTermination(session, Math.max(1500, Math.round(firstTimeoutMs / 2)));
    }

    return terminated || session.state === SIP.SessionState.Terminated;
  }, [getSIP, issueSipSessionTerminationRequest, waitForSipSessionTermination]);

  useEffect(() => {
    const handlePageHide = () => {
      const currentSession = sessionRef.current;
      const currentPhase = callPhaseRef.current;
      if (currentPhase === "connected" || currentPhase === "dialing") {
        return;
      }
      if (!currentSession) {
        sendPageExitCallStateReset();
        return;
      }

      const terminationIntent = getSessionTerminationIntent(currentPhase, {
        incomingDialog: incomingDialogOpenRef.current,
        liveMonitor: Boolean(liveMonitorSessionRef.current),
      });

      skipSessionTerminationSideEffectsRef.current = currentSession;
      void issueSipSessionTerminationRequest(currentSession, terminationIntent, { preferDispose: true }).catch((error) => {
        console.error("Page-exit SIP session termination failed:", error);
      });
      sendPageExitCallStateReset();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [getSessionTerminationIntent, issueSipSessionTerminationRequest, sendPageExitCallStateReset]);

  const ensureRemoteAudioElement = useCallback(() => {
    if (typeof document === "undefined") return null;
    const existing = document.getElementById("remoteAudio") as HTMLAudioElement | null;
    if (existing) return existing;

    const audio = document.createElement("audio");
    audio.id = "remoteAudio";
    audio.autoplay = true;
    audio.playsInline = true;
    audio.setAttribute("aria-hidden", "true");
    Object.assign(audio.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      bottom: "0",
      right: "0",
    });
    audio.addEventListener("pause", () => {
      if ((callPhaseRef.current === "connected"
        || (callPhaseRef.current === "dialing" && !incomingDialogOpenRef.current))
        && !isOnHoldRef.current) {
        audio.muted = false;
        audio.volume = 1;
        void audio.play().catch(() => {});
      }
    });
    audio.addEventListener("stalled", () => {
      if ((callPhaseRef.current === "connected"
        || (callPhaseRef.current === "dialing" && !incomingDialogOpenRef.current))
        && !isOnHoldRef.current) {
        attachAudioRef.current();
      }
    });
    audio.addEventListener("emptied", () => {
      if (callPhaseRef.current !== "idle") {
        attachAudioRef.current();
      }
    });
    const mount = getHiddenMediaMount();
    if (!mount) return null;
    mount.appendChild(audio);
    return audio;
  }, []);

  const ensureIncomingAlertAudio = useCallback(() => {
    if (typeof document === "undefined") return null;
    if (incomingAlertAudioRef.current) return incomingAlertAudioRef.current;

    const existing = document.getElementById("incomingAlertAudio") as HTMLAudioElement | null;
    if (existing) {
      incomingAlertAudioRef.current = existing;
      return existing;
    }

    const audio = document.createElement("audio");
    audio.id = "incomingAlertAudio";
    audio.preload = "auto";
    audio.loop = true;
    audio.playsInline = true;
    audio.volume = 1;
    audio.muted = false;
    audio.src = INCOMING_ALERT_AUDIO_SRC;
    audio.setAttribute("aria-hidden", "true");
    Object.assign(audio.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      bottom: "0",
      right: "0",
    });
    const mount = getHiddenMediaMount();
    if (!mount) return null;
    mount.appendChild(audio);
    incomingAlertAudioRef.current = audio;
    return audio;
  }, []);

  const ensureOutboundRingbackAudio = useCallback(() => {
    if (typeof document === "undefined") return null;
    if (outboundRingbackAudioRef.current) return outboundRingbackAudioRef.current;

    const existing = document.getElementById("outboundRingbackAudio") as HTMLAudioElement | null;
    if (existing) {
      outboundRingbackAudioRef.current = existing;
      return existing;
    }

    const audio = document.createElement("audio");
    audio.id = "outboundRingbackAudio";
    audio.preload = "auto";
    audio.loop = true;
    audio.playsInline = true;
    audio.volume = 1;
    audio.muted = false;
    audio.src = OUTBOUND_RINGBACK_AUDIO_SRC;
    audio.setAttribute("aria-hidden", "true");
    audio.addEventListener("error", () => {
      console.error("Outbound ringback audio load error:", audio.error || OUTBOUND_RINGBACK_AUDIO_SRC);
    });
    Object.assign(audio.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      bottom: "0",
      right: "0",
    });
    const mount = getHiddenMediaMount();
    if (!mount) return null;
    mount.appendChild(audio);
    outboundRingbackAudioRef.current = audio;
    return audio;
  }, []);

  useEffect(() => {
    const audio = ensureRemoteAudioElement();
    void applyPreferredAudioOutput(audio).catch(() => {});
  }, [ensureRemoteAudioElement]);

  useEffect(() => {
    const audio = ensureIncomingAlertAudio();
    if (!audio) return;
    audio.load();
    void applyPreferredAudioOutput(audio).catch(() => {});
  }, [ensureIncomingAlertAudio]);

  useEffect(() => {
    const audio = ensureOutboundRingbackAudio();
    if (!audio) return;
    audio.load();
    void applyPreferredAudioOutput(audio).catch(() => {});
  }, [ensureOutboundRingbackAudio]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let primed = false;
    const primeIncomingAlertAudio = () => {
      if (primed) return;
      primed = true;
      const audio = ensureIncomingAlertAudio();
      if (!audio) return;

      audio.muted = true;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (!playPromise || typeof playPromise.then !== "function") {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        return;
      }

      void playPromise
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        });
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((eventName) => {
      window.addEventListener(eventName, primeIncomingAlertAudio, { once: true, passive: true });
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, primeIncomingAlertAudio);
      });
    };
  }, [ensureIncomingAlertAudio]);

  const stopLocalAudioHealthMonitor = useCallback(() => {
    if (localAudioHealthIntervalRef.current !== null) {
      window.clearInterval(localAudioHealthIntervalRef.current);
      localAudioHealthIntervalRef.current = null;
    }
    lastSenderPacketCountRef.current = null;
    lastSenderBytesSentRef.current = null;
    lastSenderAudioEnergyRef.current = null;
    lastReceiverPacketCountRef.current = null;
    lastReceiverBytesReceivedRef.current = null;
    stalledSenderChecksRef.current = 0;
    silentSenderChecksRef.current = 0;
    stalledReceiverChecksRef.current = 0;
    connectedMediaRepairInFlightRef.current = false;
  }, []);

  const stopFallbackLocalAudio = useCallback(() => {
    fallbackLocalAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackLocalAudioStreamRef.current = null;
  }, []);

  const clearAttachAudioRetryTimeouts = useCallback(() => {
    attachAudioRetryTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    attachAudioRetryTimeoutsRef.current = [];
  }, []);

  const bindLocalAudioTrackHealth = useCallback((track: MediaStreamTrack) => {
    track.enabled = !isMutedRef.current;
    track.onended = () => {
      if (!isOnHoldRef.current && shouldRepairSessionMicrophone({ callPhase: callPhaseRef.current })) {
        repairSessionMicrophoneRef.current();
      }
    };
    track.onmute = () => {
      if (isMutedRef.current || isOnHoldRef.current || !shouldRepairSessionMicrophone({ callPhase: callPhaseRef.current })) return;
      window.setTimeout(() => {
        if (
          !isMutedRef.current
          && !isOnHoldRef.current
          && shouldRepairSessionMicrophone({ callPhase: callPhaseRef.current })
          && track.readyState === "live"
          && track.muted
        ) {
          repairSessionMicrophoneRef.current();
        }
      }, 400);
    };
    track.onunmute = () => {
      track.enabled = !isMutedRef.current;
    };
  }, []);

  const bindRemoteAudioTrackHealth = useCallback((track: MediaStreamTrack | null | undefined) => {
    if (!track || track.kind !== "audio") return;

    track.onunmute = () => {
      if (callPhaseRef.current !== "idle") {
        attachAudioRef.current();
      }
    };
    track.onended = () => {
      if (callPhaseRef.current !== "idle") {
        attachAudioRef.current();
      }
    };
  }, []);

  const prepareSessionLocalAudio = useCallback(async (forceFresh = false) => {
    const existingStream = fallbackLocalAudioStreamRef.current;
    const existingTrack = existingStream?.getAudioTracks().find((track) => isLiveAudioTrack(track)) ?? null;
    if (!forceFresh && existingStream && existingTrack) {
      existingTrack.enabled = !isMutedRef.current;
      return existingStream;
    }

    const preferredInputDeviceId = getPreferredAudioInputDeviceId();
    const { stream: nextStream, usedFallbackDevice } = await ensureUsableAudioInputStream(preferredInputDeviceId);
    const nextTrack = nextStream.getAudioTracks()[0] ?? null;
    if (!nextTrack) {
      nextStream.getTracks().forEach((track) => track.stop());
      throw new Error("No live microphone track available");
    }

    if (usedFallbackDevice) {
      if (microphoneFallbackToastRef.current !== preferredInputDeviceId) {
        microphoneFallbackToastRef.current = preferredInputDeviceId;
        toast.info("Saved microphone did not activate. Using the browser default microphone for this call.");
      }
    } else {
      microphoneFallbackToastRef.current = "";
    }

    bindLocalAudioTrackHealth(nextTrack);
    stopFallbackLocalAudio();
    fallbackLocalAudioStreamRef.current = nextStream;
    return nextStream;
  }, [bindLocalAudioTrackHealth, stopFallbackLocalAudio]);

  const prewarmIncomingLocalAudio = useCallback(() => {
    void prepareSessionLocalAudio(false).catch((error) => {
      console.warn("Incoming microphone prewarm failed:", error);
    });
  }, [prepareSessionLocalAudio]);

  const resetRemoteAudioGraph = useCallback(() => {
    try {
      remoteAudioSourceRef.current?.disconnect();
    } catch (error) {
      console.error("Remote audio source reset error:", error);
    }
    try {
      remoteAudioGainRef.current?.disconnect();
    } catch (error) {
      console.error("Remote audio gain reset error:", error);
    }
    try {
      remoteAudioDestinationRef.current?.disconnect();
    } catch (error) {
      console.debug("Remote audio destination reset skipped:", error);
    }

    remoteAudioSourceRef.current = null;
    remoteAudioGainRef.current = null;
    remoteAudioDestinationRef.current = null;
  }, []);

  const detachRemoteAudioPeerListeners = useCallback(() => {
    const peerConnection = remoteAudioPeerConnectionRef.current;
    const trackHandler = remoteAudioTrackHandlerRef.current;
    if (peerConnection && trackHandler) {
      peerConnection.removeEventListener("track", trackHandler);
    }
    remoteAudioPeerConnectionRef.current = null;
    remoteAudioTrackHandlerRef.current = null;
  }, []);

  const clearRemoteAudioOutput = useCallback(() => {
    try {
      const audio = ensureRemoteAudioElement();
      if (!audio) return;
      resetRemoteAudioGraph();
      remoteAudioTrackSignatureRef.current = "";
      audio.pause();
      audio.srcObject = null;
      audio.currentTime = 0;
    } catch (error) {
      console.error("Audio clear error:", error);
    }
  }, [ensureRemoteAudioElement, resetRemoteAudioGraph]);

  const resetRemoteAudio = useCallback(() => {
    try {
      stopLocalAudioHealthMonitor();
      stopFallbackLocalAudio();
      clearAttachAudioRetryTimeouts();
      detachRemoteAudioPeerListeners();
      remoteAudioStreamRef.current = null;
      clearRemoteAudioOutput();
    } catch (error) {
      console.error("Audio reset error:", error);
    }
  }, [clearAttachAudioRetryTimeouts, clearRemoteAudioOutput, detachRemoteAudioPeerListeners, stopFallbackLocalAudio, stopLocalAudioHealthMonitor]);

  const requestRemoteAudioPlayback = useCallback((audio: HTMLAudioElement) => {
    const playAudio = () => {
      audio.muted = false;
      audio.volume = 1;
      void audio.play().catch(() => {});
    };

    audio.addEventListener("loadedmetadata", playAudio, { once: true });
    audio.addEventListener("canplay", playAudio, { once: true });
    playAudio();
    window.setTimeout(playAudio, 120);
    window.setTimeout(playAudio, 400);
    window.setTimeout(playAudio, 900);
    window.setTimeout(playAudio, 1800);
  }, []);

  // Unlock this specific audio element while the agent still has a trusted
  // user gesture (clicking Call or Answer).  SIP negotiation happens later,
  // outside that gesture, and browsers can otherwise reject the remote
  // MediaStream playback even though the RTP receiver is healthy.
  const primeRemoteAudioPlayback = useCallback(() => {
    const audio = ensureRemoteAudioElement();
    if (!audio) return;

    const token = remoteAudioPrimeTokenRef.current + 1;
    remoteAudioPrimeTokenRef.current = token;
    const activeStream = audio.srcObject;
    audio.srcObject = null;
    audio.src = REMOTE_AUDIO_PRIME_SRC;
    audio.preload = "auto";
    audio.muted = true;
    audio.volume = 0;
    audio.load();

    const restore = () => {
      if (remoteAudioPrimeTokenRef.current !== token) return;
      // Do not replace a live stream that arrived while the prime clip was
      // loading.  The receiver stream always wins.
      const liveStream = audio.srcObject;
      audio.pause();
      // load() can tear down a MediaStream-backed resource in Chromium. Keep
      // the stream detached while removing the unlock clip, then attach it
      // again explicitly so the remote track cannot be left silent.
      audio.srcObject = null;
      audio.removeAttribute("src");
      audio.load();
      if (liveStream) {
        audio.srcObject = liveStream;
      } else if (activeStream) {
        audio.srcObject = activeStream;
      }
      audio.muted = false;
      audio.volume = 1;
      if (audio.srcObject) requestRemoteAudioPlayback(audio);
    };

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === "function") {
      void playPromise.then(() => window.setTimeout(restore, 120)).catch(() => restore());
    } else {
      window.setTimeout(restore, 120);
    }
  }, [ensureRemoteAudioElement, requestRemoteAudioPlayback]);

  // Auto-dial can start without a Call-button click.  Unlock the playback
  // element on the first normal agent interaction while the panel is idle so
  // an automatically assigned call can also deliver remote audio.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let primed = false;
    const unlockRemoteAudio = () => {
      if (primed || callPhaseRef.current !== "idle") return;
      primed = true;
      primeRemoteAudioPlayback();
      events.forEach((eventName) => window.removeEventListener(eventName, unlockRemoteAudio));
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, unlockRemoteAudio, { once: true, passive: true }));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, unlockRemoteAudio));
  }, [primeRemoteAudioPlayback]);

  const applyRemoteAudioPlaybackState = useCallback((shouldMute: boolean) => {
    const audio = ensureRemoteAudioElement();
    if (!audio) return;

    audio.muted = shouldMute;
    audio.volume = shouldMute ? 0 : 1;
    if (!shouldMute) {
      requestRemoteAudioPlayback(audio);
    }
  }, [ensureRemoteAudioElement, requestRemoteAudioPlayback]);

  useEffect(() => {
    const outboundEarlyMedia = callPhase === "dialing" && !incomingDialogOpen;
    applyRemoteAudioPlaybackState((callPhase !== "connected" && !outboundEarlyMedia) || isOnHold);
  }, [applyRemoteAudioPlaybackState, callPhase, incomingDialogOpen, isOnHold]);

  useEffect(() => {
    const outboundEarlyMedia = callPhase === "dialing" && !incomingDialogOpen;
    if (callPhase === "connected" || outboundEarlyMedia) return;

    stopHoldMusicPlayback();
    applyRemoteAudioPlaybackState(true);
    holdModeRef.current = null;
    if (isOnHoldRef.current) {
      isOnHoldRef.current = false;
      setIsOnHold(false);
    }
  }, [applyRemoteAudioPlaybackState, callPhase, stopHoldMusicPlayback]);

  useEffect(() => () => {
    stopHoldMusicPlayback();
  }, [stopHoldMusicPlayback]);

  const playRemoteAudioStream = useCallback((stream: MediaStream) => {
    try {
      const audio = ensureRemoteAudioElement();
      const liveAudioTracks = stream.getAudioTracks().filter((track) => track.readyState === "live");
      const nextTrackSignature = liveAudioTracks.map((track) => track.id).sort().join("|");
      if (!audio || !nextTrackSignature) return;
      const outboundEarlyMedia = callPhaseRef.current === "dialing" && !incomingDialogOpenRef.current;
      const shouldMuteRemoteAudio = (callPhaseRef.current !== "connected" && !outboundEarlyMedia) || isOnHoldRef.current;
      const attachedTrackSignature = getMediaStreamAudioTrackSignature(
        audio.srcObject instanceof MediaStream ? audio.srcObject : null,
      );
      const shouldRebindAudioOutput = (
        remoteAudioTrackSignatureRef.current !== nextTrackSignature
        || attachedTrackSignature !== nextTrackSignature
        || audio.srcObject === null
      );

      if (!shouldRebindAudioOutput) {
        audio.muted = shouldMuteRemoteAudio;
        audio.volume = shouldMuteRemoteAudio ? 0 : 1;
        void applyPreferredAudioOutput(audio).catch(() => {});
        if (!shouldMuteRemoteAudio) {
          requestRemoteAudioPlayback(audio);
        }
        return;
      }

      const reboundStream = new MediaStream(liveAudioTracks);
      remoteAudioStreamRef.current = reboundStream;
      clearRemoteAudioOutput();
      remoteAudioTrackSignatureRef.current = nextTrackSignature;

      audio.autoplay = true;
      audio.playsInline = true;
      audio.srcObject = reboundStream;
      audio.muted = shouldMuteRemoteAudio;
      audio.volume = shouldMuteRemoteAudio ? 0 : 1;
      void applyPreferredAudioOutput(audio).catch(() => {});
      if (!shouldMuteRemoteAudio) {
        requestRemoteAudioPlayback(audio);
      }
    } catch (error) {
      console.error("Remote audio playback error:", error);
    }
  }, [clearRemoteAudioOutput, ensureRemoteAudioElement, requestRemoteAudioPlayback]);

  // Attach remote audio
  const attachAudio = useCallback(() => {
    try {
      const pc = getSessionPeerConnection(sessionRef.current);
      if (!pc) return;

      if (remoteAudioPeerConnectionRef.current !== pc) {
        detachRemoteAudioPeerListeners();
        const trackHandler = (event: RTCTrackEvent) => {
          if (event.track.kind !== "audio") return;
          bindRemoteAudioTrackHealth(event.track);

          if (event.streams?.[0]?.getAudioTracks().length) {
            playRemoteAudioStream(event.streams[0]);
            return;
          }

          playRemoteAudioStream(new MediaStream([event.track]));
        };

        pc.addEventListener("track", trackHandler);
        remoteAudioPeerConnectionRef.current = pc;
        remoteAudioTrackHandlerRef.current = trackHandler;
      }

      const stream = new MediaStream();
      pc.getReceivers().forEach((receiver) => {
        if (receiver.track && receiver.track.kind === "audio") {
          bindRemoteAudioTrackHealth(receiver.track);
          stream.addTrack(receiver.track);
        }
      });
      if (stream.getAudioTracks().length > 0) {
        playRemoteAudioStream(stream);
      }
    } catch (e) { console.error("Audio attach error:", e); }
  }, [bindRemoteAudioTrackHealth, detachRemoteAudioPeerListeners, playRemoteAudioStream]);

  useEffect(() => {
    attachAudioRef.current = attachAudio;
  }, [attachAudio]);

  const ensureSessionMicrophone = useCallback(async (
    session: SipSessionLike | null,
    options?: { forceRefresh?: boolean; allowWhileOnHold?: boolean },
  ) => {
    if (!session || session !== sessionRef.current) return;
    if (isOnHoldRef.current && options?.allowWhileOnHold !== true) return;
    // Delay sender repair until the call is fully connected. Replacing tracks
    // during early media or inbound answer setup can cause some PBXs to drop
    // the call right as the remote party connects.
    if (!shouldRepairSessionMicrophone({ callPhase: callPhaseRef.current })) return;

    const sessionDescriptionHandler = getSessionDescriptionHandler(session);
    const peerConnection = sessionDescriptionHandler?.peerConnection;
    if (!peerConnection) return;

    const shouldForceRefresh = options?.forceRefresh === true;
    if (shouldForceRefresh) {
      if (microphoneRepairInFlightRef.current) return;
      microphoneRepairInFlightRef.current = true;
    }

    try {
      sessionDescriptionHandler.enableSenderTracks?.(true);

      let preferredLocalStream = fallbackLocalAudioStreamRef.current;
      const existingSender = peerConnection.getSenders().find((sender) => sender.track?.kind === "audio");
      const existingAudioTransceiver = getAudioTransceiver(peerConnection, existingSender);
      let preferredTrack = preferredLocalStream?.getAudioTracks().find((track) => isLiveAudioTrack(track)) ?? null;

      if (shouldForceRefresh) {
        try {
          // A sender can stay "live" while its RTP flow is stuck at zero.
          // Force-refresh gets a brand new microphone track for replaceTrack().
          preferredLocalStream = await prepareSessionLocalAudio(true);
          if (sessionRef.current !== session) {
            return;
          }
          preferredTrack = preferredLocalStream?.getAudioTracks().find((track) => isLiveAudioTrack(track)) ?? null;
        } catch (error) {
          console.error("Microphone refresh failed:", error);
          preferredLocalStream = fallbackLocalAudioStreamRef.current;
          preferredTrack = preferredLocalStream?.getAudioTracks().find((track) => isLiveAudioTrack(track)) ?? null;
        }
      }

      const senderTrack =
        existingSender?.track?.kind === "audio" && isLiveAudioTrack(existingSender.track)
          ? existingSender.track
          : null;
      const handlerTrack = sessionDescriptionHandler?.localMediaStream?.getAudioTracks().find((track) => isLiveAudioTrack(track)) ?? null;
      const liveAudioTrack = shouldForceRefresh
        ? getPreferredLiveAudioTrack(
          preferredTrack && !preferredTrack.muted ? preferredTrack : null,
          senderTrack && !senderTrack.muted ? senderTrack : null,
          handlerTrack && !handlerTrack.muted ? handlerTrack : null,
        )
        : getPreferredLiveAudioTrack(preferredTrack, senderTrack, handlerTrack);

      if (liveAudioTrack) {
        bindLocalAudioTrackHealth(liveAudioTrack);
        liveAudioTrack.enabled = !isMutedRef.current;
        const ensuredLocalStream = preferredLocalStream
          ?? sessionDescriptionHandler?.localMediaStream
          ?? new MediaStream([liveAudioTrack]);
        if (!sessionDescriptionHandler?.localMediaStream) {
          sessionDescriptionHandler.localMediaStream = ensuredLocalStream;
        }
        const localMediaStream = sessionDescriptionHandler?.localMediaStream;
        if (localMediaStream && !localMediaStream.getAudioTracks().some((track) => track.id === liveAudioTrack.id)) {
          localMediaStream.getAudioTracks().forEach((track) => {
            if (track.id !== liveAudioTrack.id) {
              localMediaStream.removeTrack(track);
            }
          });
          localMediaStream.addTrack(liveAudioTrack);
        }
        const senderForAudio = existingSender || existingAudioTransceiver?.sender || null;
        if (senderForAudio && senderForAudio.track !== liveAudioTrack) {
          await senderForAudio.replaceTrack(liveAudioTrack);
        } else if (!senderForAudio) {
          peerConnection.addTrack(
            liveAudioTrack,
            ensuredLocalStream,
          );
        }
        if (senderForAudio && "setStreams" in senderForAudio && typeof senderForAudio.setStreams === "function") {
          senderForAudio.setStreams(ensuredLocalStream);
        }
        const senderTransceiver = getAudioTransceiver(peerConnection, senderForAudio);
        if (senderTransceiver && (senderTransceiver.direction === "inactive" || senderTransceiver.direction === "recvonly")) {
          senderTransceiver.direction = "sendrecv";
        }
        return;
      }

      const mutedSenderTrack =
        existingSender?.track?.kind === "audio" && isLiveAudioTrack(existingSender.track)
          ? existingSender.track
          : null;
      if (mutedSenderTrack) {
        mutedSenderTrack.stop();
      }

      if (!shouldForceRefresh) {
        if (microphoneRepairInFlightRef.current) return;
        microphoneRepairInFlightRef.current = true;
      }

      try {
        const fallbackStream = await prepareSessionLocalAudio(true);
        if (sessionRef.current !== session) {
          fallbackStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const fallbackTrack = fallbackStream.getAudioTracks()[0];
        if (!fallbackTrack) {
          fallbackStream.getTracks().forEach((track) => track.stop());
          return;
        }

        bindLocalAudioTrackHealth(fallbackTrack);
        fallbackTrack.enabled = !isMutedRef.current;
        const audioSender = peerConnection.getSenders().find((sender) => sender.track?.kind === "audio")
          || getAudioTransceiver(peerConnection)?.sender
          || null;

        if (audioSender) {
          await audioSender.replaceTrack(fallbackTrack);
          if ("setStreams" in audioSender && typeof audioSender.setStreams === "function") {
            audioSender.setStreams(fallbackStream);
          }
        } else {
          peerConnection.addTrack(fallbackTrack, fallbackStream);
        }

        const localMediaStream = sessionDescriptionHandler?.localMediaStream;
        const staleTrack = localMediaStream?.getAudioTracks().find((track) => track.id !== fallbackTrack.id) ?? null;
        if (staleTrack) {
          staleTrack.stop();
          localMediaStream?.removeTrack(staleTrack);
        }
        if (localMediaStream && !localMediaStream.getAudioTracks().some((track) => track.id === fallbackTrack.id)) {
          localMediaStream.addTrack(fallbackTrack);
        }
        if (!sessionDescriptionHandler?.localMediaStream) {
          sessionDescriptionHandler.localMediaStream = fallbackStream;
        }
        const audioTransceiver = getAudioTransceiver(peerConnection, audioSender);
        if (audioTransceiver && (audioTransceiver.direction === "inactive" || audioTransceiver.direction === "recvonly")) {
          audioTransceiver.direction = "sendrecv";
        }
      } catch (error) {
        console.error("Microphone repair failed:", error);
      } finally {
        if (!shouldForceRefresh) {
          microphoneRepairInFlightRef.current = false;
        }
      }
    } finally {
      if (shouldForceRefresh) {
        microphoneRepairInFlightRef.current = false;
      }
    }
  }, [bindLocalAudioTrackHealth, prepareSessionLocalAudio]);

  useEffect(() => {
    repairSessionMicrophoneRef.current = () => {
      void ensureSessionMicrophone(sessionRef.current, { forceRefresh: true });
    };
  }, [ensureSessionMicrophone]);

  const repairConnectedCallMedia = useCallback(async (
    session: SipSessionLike | null,
    options?: { refreshMicrophone?: boolean },
  ) => {
    if (!session || session !== sessionRef.current) return;
    if (connectedMediaRepairInFlightRef.current) return;

    connectedMediaRepairInFlightRef.current = true;
    try {
      attachAudioRef.current();

      const remoteAudio = ensureRemoteAudioElement();
      if (remoteAudio && callPhaseRef.current === "connected" && !isOnHoldRef.current) {
        await applyPreferredAudioOutput(remoteAudio).catch(() => {});
        requestRemoteAudioPlayback(remoteAudio);
      }

      if (options?.refreshMicrophone !== false) {
        await ensureSessionMicrophone(session, { forceRefresh: true });
      }
    } finally {
      connectedMediaRepairInFlightRef.current = false;
    }
  }, [ensureRemoteAudioElement, ensureSessionMicrophone, requestRemoteAudioPlayback]);

  const startLocalAudioHealthMonitor = useCallback(() => {
    stopLocalAudioHealthMonitor();

    const inspectAudioSender = async () => {
      if (callPhaseRef.current !== "connected" || isOnHoldRef.current) return;

      const session = sessionRef.current;
      const peerConnection = getSessionPeerConnection(session);
      if (!peerConnection) return;

      const audioSender = peerConnection.getSenders().find((sender) => sender.track?.kind === "audio");
      const localTrack =
        audioSender?.track
        ?? fallbackLocalAudioStreamRef.current?.getAudioTracks().find((track) => track.readyState === "live")
        ?? null;

      if (!localTrack || localTrack.readyState !== "live") {
        await ensureSessionMicrophone(session, { forceRefresh: true });
        return;
      }

      localTrack.enabled = !isMutedRef.current;
      const connectedForMs = callStartedAtRef.current ? Date.now() - callStartedAtRef.current : 0;

      const remoteTrack = peerConnection.getReceivers().find((receiver) => receiver.track?.kind === "audio")?.track ?? null;
      if (remoteTrack && isLiveAudioTrack(remoteTrack)) {
        bindRemoteAudioTrackHealth(remoteTrack);
        const attachedRemoteTrackIds = remoteAudioStreamRef.current?.getAudioTracks().map((track) => track.id) ?? [];
        if (!attachedRemoteTrackIds.includes(remoteTrack.id)) {
          attachAudioRef.current();
        }
      }

      const remoteAudio = ensureRemoteAudioElement();
      if (remoteAudio && connectedForMs >= 1000 && callPhaseRef.current === "connected") {
        if (remoteAudio.muted || remoteAudio.volume === 0 || remoteAudio.paused) {
          remoteAudio.muted = false;
          remoteAudio.volume = 1;
          requestRemoteAudioPlayback(remoteAudio);
        }
      }

      const audioReceiver = peerConnection.getReceivers().find((receiver) => receiver.track?.kind === "audio") ?? null;
      if (audioReceiver?.getStats) {
        try {
          const stats = await audioReceiver.getStats();
          let packetsReceived: number | null = null;
          let bytesReceived: number | null = null;

          stats.forEach((report) => {
            const mediaReport = report as RTCStats & {
              isRemote?: boolean;
              packetsReceived?: unknown;
              bytesReceived?: unknown;
              kind?: unknown;
              mediaType?: unknown;
            };
            const reportKind = typeof mediaReport.kind === "string"
              ? mediaReport.kind
              : typeof mediaReport.mediaType === "string"
                ? mediaReport.mediaType
                : "";

            if (report.type !== "inbound-rtp" || ("isRemote" in report && report.isRemote) || (reportKind && reportKind !== "audio")) {
              return;
            }

            const inboundPackets = "packetsReceived" in report ? report.packetsReceived : null;
            if (typeof inboundPackets === "number") {
              packetsReceived = inboundPackets;
            }

            const inboundBytes = "bytesReceived" in report ? report.bytesReceived : null;
            if (typeof inboundBytes === "number") {
              bytesReceived = inboundBytes;
            }
          });

          if (packetsReceived !== null || bytesReceived !== null) {
            const packetsStalled = packetsReceived !== null
              && lastReceiverPacketCountRef.current !== null
              && packetsReceived <= lastReceiverPacketCountRef.current;
            const bytesStalled = bytesReceived !== null
              && lastReceiverBytesReceivedRef.current !== null
              && bytesReceived <= lastReceiverBytesReceivedRef.current;

            if (connectedForMs >= 2500 && (packetsStalled || bytesStalled)) {
              stalledReceiverChecksRef.current += 1;
            } else {
              stalledReceiverChecksRef.current = 0;
            }

            if (packetsReceived !== null) {
              lastReceiverPacketCountRef.current = packetsReceived;
            }
            if (bytesReceived !== null) {
              lastReceiverBytesReceivedRef.current = bytesReceived;
            }

            if (stalledReceiverChecksRef.current >= 2) {
              stalledReceiverChecksRef.current = 0;
              await repairConnectedCallMedia(session, { refreshMicrophone: false });
              return;
            }
          }
        } catch (error) {
          console.error("Audio receiver inspection failed:", error);
        }
      }

      if (!audioSender?.getStats || isMutedRef.current) {
        if (!isMutedRef.current && localTrack.muted && connectedForMs >= 4000) {
          await ensureSessionMicrophone(session, { forceRefresh: true });
        }
        return;
      }

      try {
        const stats = await audioSender.getStats();
        let packetsSent: number | null = null;
        let bytesSent: number | null = null;
        let totalAudioEnergy: number | null = null;
        let audioLevel: number | null = null;

        stats.forEach((report) => {
          const mediaReport = report as RTCStats & {
            isRemote?: boolean;
            packetsSent?: unknown;
            bytesSent?: unknown;
            kind?: unknown;
            mediaType?: unknown;
            totalAudioEnergy?: unknown;
            audioLevel?: unknown;
          };
          if (report.type === "outbound-rtp" && !("isRemote" in report && report.isRemote)) {
            const outboundPackets = "packetsSent" in report ? report.packetsSent : null;
            if (typeof outboundPackets === "number") {
              packetsSent = outboundPackets;
            }
            const outboundBytes = "bytesSent" in report ? report.bytesSent : null;
            if (typeof outboundBytes === "number") {
              bytesSent = outboundBytes;
            }
          }
          if (report.type === "media-source" || report.type === "track") {
            const reportKind = typeof mediaReport.kind === "string"
              ? mediaReport.kind
              : typeof mediaReport.mediaType === "string"
                ? mediaReport.mediaType
                : "";
            if (reportKind !== "audio") {
              return;
            }
            if (typeof mediaReport.totalAudioEnergy === "number") {
              totalAudioEnergy = mediaReport.totalAudioEnergy;
            }
            if (typeof mediaReport.audioLevel === "number") {
              audioLevel = mediaReport.audioLevel;
            }
          }
        });

        if (packetsSent === null && bytesSent === null) return;

        const packetsStalled = packetsSent !== null
          && lastSenderPacketCountRef.current !== null
          && packetsSent <= lastSenderPacketCountRef.current;
        const bytesStalled = bytesSent !== null
          && lastSenderBytesSentRef.current !== null
          && bytesSent <= lastSenderBytesSentRef.current;

        if (connectedForMs >= 1200 && (packetsStalled || bytesStalled || localTrack.muted)) {
          stalledSenderChecksRef.current += 1;
        } else {
          stalledSenderChecksRef.current = 0;
        }

        const hadPreviousAudioEnergy = lastSenderAudioEnergyRef.current !== null;
        const audioEnergyStalled = totalAudioEnergy !== null
          && hadPreviousAudioEnergy
          && totalAudioEnergy <= (lastSenderAudioEnergyRef.current ?? 0);
        const senderTrafficAdvancing = Boolean(
          (packetsSent !== null && (lastSenderPacketCountRef.current === null || packetsSent > lastSenderPacketCountRef.current))
          || (bytesSent !== null && (lastSenderBytesSentRef.current === null || bytesSent > lastSenderBytesSentRef.current))
        );
        const sourceLooksSilent = audioLevel !== null && audioLevel <= 0.0001;

        if (
          connectedForMs >= 5000
          && senderTrafficAdvancing
          && !localTrack.muted
          && audioEnergyStalled
          && sourceLooksSilent
        ) {
          silentSenderChecksRef.current += 1;
        } else {
          silentSenderChecksRef.current = 0;
        }

        if (packetsSent !== null) {
          lastSenderPacketCountRef.current = packetsSent;
        }
        if (bytesSent !== null) {
          lastSenderBytesSentRef.current = bytesSent;
        }
        if (totalAudioEnergy !== null) {
          lastSenderAudioEnergyRef.current = totalAudioEnergy;
        }

        if (stalledSenderChecksRef.current >= 2 || silentSenderChecksRef.current >= 2) {
          stalledSenderChecksRef.current = 0;
          silentSenderChecksRef.current = 0;
          await repairConnectedCallMedia(session);
        }
      } catch (error) {
        console.error("Audio sender inspection failed:", error);
      }
    };

    localAudioHealthIntervalRef.current = window.setInterval(() => {
      void inspectAudioSender();
    }, 1500);
  }, [bindRemoteAudioTrackHealth, ensureRemoteAudioElement, repairConnectedCallMedia, requestRemoteAudioPlayback, ensureSessionMicrophone, stopLocalAudioHealthMonitor]);

  const ensureSessionMicrophoneWithRetry = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !shouldRepairSessionMicrophone({ callPhase: callPhaseRef.current })) return;

    void ensureSessionMicrophone(session);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 150);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 500);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 1000);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 2000);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 4000);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 8000);
    window.setTimeout(() => {
      void ensureSessionMicrophone(session);
    }, 12000);
  }, [ensureSessionMicrophone]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;

    const handleDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const preferredInput = getPreferredAudioInputDeviceId();
        const preferredOutput = getPreferredAudioOutputDeviceId();

        if (preferredInput && !devices.some((device) => device.kind === "audioinput" && device.deviceId === preferredInput)) {
          clearPreferredAudioInputDeviceId();
          if (disconnectedInputToastRef.current !== preferredInput) {
            disconnectedInputToastRef.current = preferredInput;
            toast.info("Saved microphone disconnected. Switched back to the browser default microphone.");
          }
          if (callPhaseRef.current !== "idle") {
            await ensureSessionMicrophone(sessionRef.current, { forceRefresh: true });
          }
        } else if (preferredInput) {
          disconnectedInputToastRef.current = "";
        }

        if (preferredOutput && !devices.some((device) => device.kind === "audiooutput" && device.deviceId === preferredOutput)) {
          clearPreferredAudioOutputDeviceId();
          if (disconnectedOutputToastRef.current !== preferredOutput) {
            disconnectedOutputToastRef.current = preferredOutput;
            toast.info("Saved speaker disconnected. Switched back to the browser default speaker.");
          }
        } else if (preferredOutput) {
          disconnectedOutputToastRef.current = "";
        }

        const remoteAudio = ensureRemoteAudioElement();
        if (remoteAudio) {
          await applyPreferredAudioOutput(remoteAudio).catch(() => {});
        }

        const incomingAlertAudio = ensureIncomingAlertAudio();
        if (incomingAlertAudio) {
          await applyPreferredAudioOutput(incomingAlertAudio).catch(() => {});
        }

        const outboundRingbackAudio = ensureOutboundRingbackAudio();
        if (outboundRingbackAudio) {
          await applyPreferredAudioOutput(outboundRingbackAudio).catch(() => {});
        }
      } catch (error) {
        console.error("Audio device refresh failed:", error);
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [ensureIncomingAlertAudio, ensureOutboundRingbackAudio, ensureRemoteAudioElement, ensureSessionMicrophone]);

  const attachAudioWithRetry = useCallback(() => {
    const targetSession = sessionRef.current;
    clearAttachAudioRetryTimeouts();

    const guardedAttachAudio = () => {
      if (!targetSession || targetSession !== sessionRef.current || callPhaseRef.current === "idle") {
        return;
      }
      attachAudio();
    };

    guardedAttachAudio();
    [150, 500, 1000, 2000, 4000, 8000, 12000].forEach((delayMs) => {
      const timeoutId = window.setTimeout(guardedAttachAudio, delayMs);
      attachAudioRetryTimeoutsRef.current.push(timeoutId);
    });
  }, [attachAudio, clearAttachAudioRetryTimeouts]);

  const scheduleConnectedMediaVerification = useCallback((targetSession: SipSessionLike | null, delayMs = 1500) => {
    if (!targetSession) return;

    [Math.max(0, delayMs), Math.max(500, delayMs * 2), Math.max(1500, delayMs * 4)].forEach((nextDelayMs) => {
      window.setTimeout(() => {
        if (!targetSession || targetSession !== sessionRef.current) return;
        if (callPhaseRef.current !== "connected") return;
        void repairConnectedCallMedia(targetSession, { refreshMicrophone: false });
      }, nextDelayMs);
    });
  }, [repairConnectedCallMedia]);

  const stopLocalRingback = useCallback(() => {
    outboundRingbackPlaybackTokenRef.current += 1;
    const outboundRingbackAudio = outboundRingbackAudioRef.current;
    if (outboundRingbackAudio) {
      outboundRingbackAudio.pause();
      outboundRingbackAudio.currentTime = 0;
    }
    if (ringbackIntervalRef.current !== null) {
      window.clearInterval(ringbackIntervalRef.current);
      ringbackIntervalRef.current = null;
    }
    if (ringbackContextRef.current?.state === "running") {
      void ringbackContextRef.current.suspend().catch(() => {});
    }
  }, []);

  const silenceResidualCallAudio = useCallback(() => {
    clearIncomingAutoAnswerTimer();
    stopIncomingAlert();
    stopLocalRingback();
    resetRemoteAudio();
  }, [clearIncomingAutoAnswerTimer, resetRemoteAudio, stopIncomingAlert, stopLocalRingback]);

  useEffect(() => {
    if (!incomingDialogOpen || callPhase !== "dialing") {
      stopIncomingAlert();
    }
  }, [callPhase, incomingDialogOpen, stopIncomingAlert]);

  useEffect(() => {
    if (callPhase !== "idle") return;
    silenceResidualCallAudio();
  }, [callPhase, silenceResidualCallAudio]);

  useEffect(() => () => {
    silenceResidualCallAudio();
  }, [silenceResidualCallAudio]);

  const finalizeLiveMonitorSession = useCallback((options?: { mode?: LiveCallMonitorMode; notify?: boolean }) => {
    const resolvedMode = options?.mode || liveMonitorSessionRef.current?.mode || null;
    invalidateMicrophonePreparationAttempt();
    liveMonitorSessionRef.current = null;
    stopIncomingAlert();
    stopLocalAudioHealthMonitor();
    stopFallbackLocalAudio();
    resetRemoteAudio();
    sessionRef.current = null;
    clearIncomingDialogSession();
    setIncomingDialogOpen(false);
    setIncomingDraftPhone("");
    setCallWrapUpPending(false);
    callWrapUpPendingRef.current = false;
    setCallPhase("idle");
    callPhaseRef.current = "idle";
    resetMuteState();
    setIsOnHold(false);
    resetLiveCallTiming();
    manualCallEndRef.current = false;

    if (options?.notify === false || !resolvedMode) {
      return;
    }

    toast.info(resolvedMode === "listen" ? "Live listening ended" : "Call barging ended");
  }, [clearIncomingDialogSession, invalidateMicrophonePreparationAttempt, resetLiveCallTiming, resetMuteState, resetRemoteAudio, stopFallbackLocalAudio, stopIncomingAlert, stopLocalAudioHealthMonitor]);

  const answerLiveMonitorInvite = useCallback(async (invitation: SipSessionLike, monitorRequest: PendingLiveMonitorRequest) => {
    if (incomingAnswerInFlightRef.current) return false;

    incomingAnswerInFlightRef.current = true;
    manualCallEndRef.current = false;
    const microphonePreparationAttempt = monitorRequest.mode === "barge"
      ? beginMicrophonePreparationAttempt()
      : 0;

    try {
      resetMuteState();
      setIsOnHold(false);
      setIncomingDialogOpen(false);
      setIncomingDraftPhone("");
      setCallWrapUpPending(false);
      callWrapUpPendingRef.current = false;
      setCallPhase("dialing");
      callPhaseRef.current = "dialing";

      let acceptOptions: LiveMonitorAcceptOptions;
      if (monitorRequest.mode === "barge") {
        let localMediaStream: MediaStream;
        try {
          localMediaStream = await prepareSessionLocalAudio(true);
        } catch (error) {
          if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || sessionRef.current !== invitation) {
            return false;
          }
          toast.error(getMicrophonePreparationErrorMessage(
            error,
            "Microphone permission denied. Allow microphone access in the browser before call barging.",
          ));
          return false;
        }

        if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || sessionRef.current !== invitation) {
          localMediaStream.getTracks().forEach((track) => track.stop());
          return false;
        }

        acceptOptions = {
          sessionDescriptionHandlerOptions: {
            constraints: buildAudioOnlyConstraints(getPreferredAudioInputDeviceId()),
            localMediaStream,
          },
        };
      } else {
        acceptOptions = {
          sessionDescriptionHandlerOptions: {
            constraints: {
              audio: false,
              video: false,
            },
          },
        };
      }

      if (!invitation.accept) {
        toast.error("Live monitor session is not ready to connect");
        stopFallbackLocalAudio();
        return false;
      }

      liveMonitorSessionRef.current = monitorRequest;
      await invitation.accept(acceptOptions);
      const SIP = await getSIP();
      if (sessionRef.current !== invitation || invitation.state === SIP.SessionState.Terminated) {
        finalizeLiveMonitorSession({ mode: monitorRequest.mode, notify: false });
        return false;
      }

      stopIncomingAlert();
      const answeredAt = new Date().toISOString();
      const ringStartedAt = incomingRingStartedAtRef.current || answeredAt;
      callRingStartedAtRef.current = ringStartedAt;
      callAnsweredAtRef.current = answeredAt;
      setCallWrapUpPending(false);
      callWrapUpPendingRef.current = false;
      setCallPhase("connected");
      callPhaseRef.current = "connected";
      const answeredTimestamp = new Date(answeredAt).getTime();
      callStartedAtRef.current = answeredTimestamp;
      setElapsedSeconds(0);
      setCallStartedAt(answeredTimestamp);
      attachAudioWithRetry();

      if (monitorRequest.mode === "barge") {
        // Avoid touching sender tracks during the first connected instant.
        startLocalAudioHealthMonitor();
      } else {
        stopLocalAudioHealthMonitor();
      }

      toast.success(monitorRequest.mode === "listen" ? "Live listening connected" : "Call barging connected");
      return true;
    } catch (error) {
      console.error("Live monitor answer failed:", error);
      finalizeLiveMonitorSession({ mode: monitorRequest.mode, notify: false });
      if (monitorRequest.mode === "barge" && !isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt)) {
        return false;
      }
      toast.error(error instanceof Error ? error.message : "Unable to connect the live monitor session");
      return false;
    } finally {
      incomingAnswerInFlightRef.current = false;
    }
  }, [attachAudioWithRetry, beginMicrophonePreparationAttempt, finalizeLiveMonitorSession, getSIP, isCurrentMicrophonePreparationAttempt, prepareSessionLocalAudio, resetMuteState, startLocalAudioHealthMonitor, stopFallbackLocalAudio, stopIncomingAlert, stopLocalAudioHealthMonitor]);

  const reconcileLocalCallState = useCallback(async () => {
    let cleared = false;
    const currentSession = sessionRef.current;

    if (currentSession) {
      try {
        const SIP = await getSIP();
        if (currentSession === sessionRef.current && currentSession.state === SIP.SessionState.Terminated) {
          sessionRef.current = null;
          clearIncomingDialogSession();
          cleared = true;
        }
      } catch (error) {
        console.error("Failed to reconcile local SIP session state:", error);
      }
    }

    const activeCallId = activeCallIdRef.current;
    const activeCallRecord = activeCallId
      ? calls.find((call) => call.id === activeCallId)
      : null;
    if (activeCallId && (!activeCallRecord || !isLiveManagedCall(activeCallRecord))) {
      const hasConnectedSession = Boolean(sessionRef.current) && callPhaseRef.current === "connected";
      if (hasConnectedSession) {
        return cleared;
      }
      activeCallIdRef.current = null;
      void releaseAgentCallSlotQuietly(activeCallId, "active", false, { forceHangup: true });
      cleared = true;
    }

    const hasTransientGhostState = (
      !sessionRef.current
      && !liveMonitorSessionRef.current
      && !activeCallIdRef.current
      && !callWrapUpPendingRef.current
      && !outboundDialStartInFlightRef.current
      && !incomingAnswerInFlightRef.current
      && callPhaseRef.current !== "idle"
    );

    if (hasTransientGhostState) {
      skipSessionTerminationSideEffectsRef.current = null;
      invalidateMicrophonePreparationAttempt();
      stopIncomingAlert();
      stopLocalRingback();
      resetRemoteAudio();
      resetMuteState();
      callPhaseRef.current = "idle";
      setIncomingDialogOpen(false);
      setIncomingDraftPhone("");
      clearIncomingDialogSession();
      setCallPhase("idle");
      setIsOnHold(false);
      resetLiveCallTiming();
      cleared = true;
    }

    return cleared;
  }, [calls, clearIncomingDialogSession, getSIP, invalidateMicrophonePreparationAttempt, releaseAgentCallSlotQuietly, resetLiveCallTiming, resetMuteState, resetRemoteAudio, stopIncomingAlert, stopLocalRingback]);

  useEffect(() => {
    if (callPhase === "idle") return;

    let cancelled = false;
    const reconcile = async () => {
      const cleared = await reconcileLocalCallState();
      if (cancelled || cleared || callPhaseRef.current !== "connected") {
        return;
      }

      const activeCallId = activeCallIdRef.current;
      const activeCallRecord = activeCallId
        ? calls.find((call) => call.id === activeCallId && ["active", "on-hold"].includes(call.status))
        : null;
      const hasBackedConnectedState = Boolean(
        sessionRef.current ||
        liveMonitorSessionRef.current ||
        activeCallRecord,
      );

      if (hasBackedConnectedState) {
        return;
      }

      stopIncomingAlert();
      stopLocalAudioHealthMonitor();
      stopFallbackLocalAudio();
      stopLocalRingback();
      resetRemoteAudio();
      sessionRef.current = null;
      if (activeCallId) {
        void releaseAgentCallSlotQuietly(activeCallId, "active", false, { forceHangup: true });
      }
      activeCallIdRef.current = null;
      setIncomingDialogOpen(false);
      setIncomingDraftPhone("");
      setCallWrapUpPending(false);
      callWrapUpPendingRef.current = false;
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      resetMuteState();
      setIsOnHold(false);
      resetLiveCallTiming();
    };

    void reconcile();
    const interval = window.setInterval(() => {
      void reconcile();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    callPhase,
    calls,
    reconcileLocalCallState,
    releaseAgentCallSlotQuietly,
    resetLiveCallTiming,
    resetMuteState,
    resetRemoteAudio,
    stopFallbackLocalAudio,
    stopIncomingAlert,
    stopLocalAudioHealthMonitor,
    stopLocalRingback,
  ]);

  const playFallbackRingbackPulse = useCallback(() => {
    const AudioContextCtor = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!ringbackContextRef.current) {
      ringbackContextRef.current = new AudioContextCtor();
    }

    const context = ringbackContextRef.current;
    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }

    const playBurst = (offsetSeconds: number) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      gainNode.gain.value = 0.0001;
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      const startAt = context.currentTime + offsetSeconds;
      gainNode.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.38);

      oscillator.start(startAt);
      oscillator.stop(startAt + 0.4);
    };

    playBurst(0);
    playBurst(0.6);
  }, []);

  const startFallbackRingback = useCallback(() => {
    if (ringbackIntervalRef.current !== null) return;
    playFallbackRingbackPulse();
    ringbackIntervalRef.current = window.setInterval(() => {
      playFallbackRingbackPulse();
    }, 3000);
  }, [playFallbackRingbackPulse]);

  const startLocalRingback = useCallback(() => {
    stopLocalRingback();

    const outboundRingbackAudio = ensureOutboundRingbackAudio();
    if (!outboundRingbackAudio) {
      startFallbackRingback();
      return;
    }

    const playbackToken = outboundRingbackPlaybackTokenRef.current + 1;
    outboundRingbackPlaybackTokenRef.current = playbackToken;
    outboundRingbackAudio.loop = true;
    outboundRingbackAudio.currentTime = 0;
    outboundRingbackAudio.muted = false;
    void applyPreferredAudioOutput(outboundRingbackAudio).catch((error) => {
      console.error("Outbound ringback audio output switch error:", error);
    });

    const playPromise = outboundRingbackAudio.play();
    if (!playPromise || typeof playPromise.then !== "function") {
      return;
    }

    void playPromise.then(() => {
      if (outboundRingbackPlaybackTokenRef.current !== playbackToken) {
        outboundRingbackAudio.pause();
        outboundRingbackAudio.currentTime = 0;
      }
    }).catch((error) => {
      if (outboundRingbackPlaybackTokenRef.current !== playbackToken) {
        return;
      }
      console.error("Outbound ringback audio load error:", error);
      outboundRingbackAudio.pause();
      outboundRingbackAudio.currentTime = 0;
      startFallbackRingback();
    });
  }, [ensureOutboundRingbackAudio, startFallbackRingback, stopLocalRingback]);

  const playIncomingAlertPulse = useCallback(() => {
    const AudioContextCtor = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!incomingAlertContextRef.current) {
      incomingAlertContextRef.current = new AudioContextCtor();
    }

    const context = incomingAlertContextRef.current;
    if (incomingAlertSuspendTimeoutRef.current !== null) {
      window.clearTimeout(incomingAlertSuspendTimeoutRef.current);
      incomingAlertSuspendTimeoutRef.current = null;
    }
    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }

    const playTone = (frequency: number, offsetSeconds: number, durationSeconds: number, peak = 0.08) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gainNode.gain.value = 0.0001;
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      const startAt = context.currentTime + offsetSeconds;
      gainNode.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);

      oscillator.start(startAt);
      oscillator.stop(startAt + durationSeconds + 0.02);
    };

    playTone(880, 0, 0.16, 0.06);
    playTone(988, 0.22, 0.16, 0.06);
    playTone(880, 0.44, 0.28, 0.08);
  }, []);

  const startIncomingAlert = useCallback(() => {
    if (incomingAlertIntervalRef.current !== null) return;
    const playbackToken = incomingAlertPlaybackTokenRef.current + 1;
    incomingAlertPlaybackTokenRef.current = playbackToken;

    const incomingAlertAudio = ensureIncomingAlertAudio();
    if (!incomingAlertAudio) {
      playIncomingAlertPulse();
      incomingAlertIntervalRef.current = window.setInterval(() => {
        playIncomingAlertPulse();
      }, 2200);
      return;
    }
    incomingAlertAudio.muted = false;
    void applyPreferredAudioOutput(incomingAlertAudio).catch(() => {});
    incomingAlertAudio.currentTime = 0;
    const playPromise = incomingAlertAudio.play();

    if (!playPromise || typeof playPromise.then !== "function") {
      return;
    }

    void playPromise.catch(() => {
      if (incomingAlertPlaybackTokenRef.current !== playbackToken || incomingAlertIntervalRef.current !== null) {
        return;
      }
      playIncomingAlertPulse();
      incomingAlertIntervalRef.current = window.setInterval(() => {
        playIncomingAlertPulse();
      }, 2200);
    });
  }, [ensureIncomingAlertAudio, playIncomingAlertPulse]);

  const getCallIvrMetadata = useCallback(async (callerId: string): Promise<CallIvrMetadata> => {
    try {
      const response = await fetch(buildApiUrl(`/call-ivr/${encodeURIComponent(callerId)}`), {
        cache: "no-store",
      });
      if (!response.ok) {
        return {};
      }
      return await response.json() as CallIvrMetadata;
    } catch (error) {
      console.error("IVR metadata detection failed:", error);
      return {};
    }
  }, []);

  const updateCallById = useCallback((callId: string, updater: (call: ManagedCall) => ManagedCall) => {
    setCalls((prev) => prev.map((call) => (call.id === callId ? updater(call) : call)));
  }, []);

  const recordMissedIncomingCall = useCallback((payload: {
    callId: string;
    callerId: string;
    callbackStatus: string;
    followUpFlag?: boolean;
    note: string;
    ringStartedAt?: string;
    endedAt?: string;
    language?: string;
    businessType?: string;
    purpose?: string;
    callSource?: string;
    carrierTrunk?: string;
    trunkCode?: string;
    pilot?: string;
    didOrCli?: string;
  }) => {
    if (!user) return null;

    const missedCall = buildIncomingCallRecord({
      id: payload.callId,
      callerId: payload.callerId,
      customerName: "",
      agentId: user.id,
      agentName: user.name,
      time: getCurrentTime(),
      date: getCurrentDate(),
      language: String(payload.language || "").trim(),
      purpose: String(payload.purpose || "").trim() || "Inbound Enquiry",
      businessType: String(payload.businessType || "").trim(),
      lead: payload.callSource || "",
      leadSource: payload.callSource || "",
      carrierTrunk: payload.carrierTrunk || "",
      trunkCode: payload.trunkCode || "",
      pilot: payload.pilot || "",
      didOrCli: payload.didOrCli || "",
      ringStartedAt: payload.ringStartedAt || new Date().toISOString(),
      endedAt: payload.endedAt || new Date().toISOString(),
      talkDurationSeconds: 0,
      status: "missed",
      callbackStatus: payload.callbackStatus,
      followUpFlag: payload.followUpFlag ?? false,
      notes: payload.note,
      hasRecording: false,
    });

    const nextSnapshots = new Map(finalizedCallSnapshotsRef.current);
    nextSnapshots.delete(missedCall.id);
    nextSnapshots.set(missedCall.id, {
      id: missedCall.id,
      status: missedCall.status,
      duration: normalizeCallDuration(missedCall.duration),
      ringStartedAt: missedCall.ringStartedAt,
      answeredAt: missedCall.answeredAt,
      endedAt: missedCall.endedAt,
      talkDurationSeconds: missedCall.talkDurationSeconds,
    });
    while (nextSnapshots.size > 25) {
      const oldestKey = nextSnapshots.keys().next().value;
      if (!oldestKey) break;
      nextSnapshots.delete(oldestKey);
    }
    finalizedCallSnapshotsRef.current = nextSnapshots;
    setCalls((prev) => {
      const existingIndex = prev.findIndex((call) => call.id === missedCall.id);
      if (existingIndex === -1) {
        return [missedCall, ...prev];
      }
      return prev.map((call) => (call.id === missedCall.id ? { ...call, ...missedCall } : call));
    });
    void api.saveCall(missedCall);

    return missedCall;
  }, [user]);

  const hasServerManagedActiveCall = useCallback(async () => {
    if (user?.role !== "agent" || !user.id) return false;

    try {
      const agentRecords = await api.getAgents();
      const matchedAgent = Array.isArray(agentRecords)
        ? agentRecords.find((agentRecord) => agentRecord.id === user.id)
        : null;
      if (!matchedAgent) return false;

      const activeCallId = String(matchedAgent.activeCallId || "").trim();
      const isBusy = Boolean(activeCallId) || matchedAgent.status === "on-call";

      if (isBusy) {
        updateUser({
          status: matchedAgent.status || user.status,
          activeCallId,
          activeCallDirection: matchedAgent.activeCallDirection || "",
          activeCallStartedAt: matchedAgent.activeCallStartedAt || "",
          callStateUpdatedAt: matchedAgent.callStateUpdatedAt || "",
          lastCallEndedAt: matchedAgent.lastCallEndedAt || "",
        });
      }

      return isBusy;
    } catch (error) {
      console.error("Failed to verify server-side active call state before processing incoming invite:", error);
      return false;
    }
  }, [updateUser, user?.id, user?.role, user?.status]);

  const sipInviteRuntimeRef = useRef({
    answerLiveMonitorInvite,
    finalizeLiveMonitorSession,
    getBlockedIncomingPhone,
    getCallIvrMetadata,
    hasServerManagedActiveCall,
    getReconnectSuppressedCustomer,
    getVisiblePhoneLabel,
    notifyReconnectSuppressed,
    reconcileLocalCallState,
    invalidateMicrophonePreparationAttempt,
    resetLiveCallTiming,
    resetMuteState,
    resetRemoteAudio,
    resolveIncomingCallerPhones,
    recordMissedIncomingCall,
    prewarmIncomingLocalAudio,
    scheduleIncomingAutoAnswer,
    startIncomingAlert,
    stopIncomingAlert,
    clearIncomingAutoAnswerTimer,
    updateCallById,
  });

  useEffect(() => {
    sipInviteRuntimeRef.current = {
      answerLiveMonitorInvite,
      finalizeLiveMonitorSession,
      getBlockedIncomingPhone,
      getCallIvrMetadata,
      hasServerManagedActiveCall,
      getReconnectSuppressedCustomer,
      getVisiblePhoneLabel,
      notifyReconnectSuppressed,
      reconcileLocalCallState,
      invalidateMicrophonePreparationAttempt,
      resetLiveCallTiming,
      resetMuteState,
      resetRemoteAudio,
      resolveIncomingCallerPhones,
      recordMissedIncomingCall,
      prewarmIncomingLocalAudio,
      scheduleIncomingAutoAnswer,
      startIncomingAlert,
      stopIncomingAlert,
      clearIncomingAutoAnswerTimer,
      updateCallById,
    };
  }, [
    answerLiveMonitorInvite,
    finalizeLiveMonitorSession,
    getBlockedIncomingPhone,
    getCallIvrMetadata,
    hasServerManagedActiveCall,
    getReconnectSuppressedCustomer,
    getVisiblePhoneLabel,
    notifyReconnectSuppressed,
    reconcileLocalCallState,
    invalidateMicrophonePreparationAttempt,
    resetLiveCallTiming,
    resetMuteState,
    resetRemoteAudio,
    resolveIncomingCallerPhones,
    recordMissedIncomingCall,
    prewarmIncomingLocalAudio,
    scheduleIncomingAutoAnswer,
    startIncomingAlert,
    stopIncomingAlert,
    clearIncomingAutoAnswerTimer,
    updateCallById,
  ]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent" || !user.id) {
      setBackendSipSnapshot(null);
      return;
    }

    let cancelled = false;
    const syncBackendSipSnapshot = async () => {
      try {
        // The backend keeps a short live-agent/SIP snapshot cache. Routine
        // health refreshes should use it; forcing a fresh Asterisk query here
        // made every open agent panel compete for the PBX command channel.
        const snapshot = await api.getLiveAgentsSnapshot();
        if (cancelled || !snapshot.ok) return;
        const matchedAgent = snapshot.data.find((agent) => (
          agent.agentId === user.id
          || (user.extension && agent.extension === user.extension)
        )) || null;
        if (!cancelled) {
          setBackendSipSnapshot(matchedAgent);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to refresh backend SIP snapshot:", error);
        }
      }
    };

    void syncBackendSipSnapshot();
    const interval = window.setInterval(() => {
      void syncBackendSipSnapshot();
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated, user?.extension, user?.id, user?.role]);

  const scheduleSipReconnect = useCallback((delayMs = 2500) => {
    if (!isAuthenticated || !sipAgentIdentity) return;
    if (sipReconnectTimerRef.current) return;

    const reconnectWhenIdle = () => {
      sipReconnectTimerRef.current = null;
      if (uaRef.current?.isConnected() && regRef.current?.state === "Registered") return;
      // A WSS outage must not tear down an established media session.
      if (!canRebuildSipClient(callPhaseRef.current, sessionRef.current?.state)) {
        sipReconnectTimerRef.current = window.setTimeout(reconnectWhenIdle, 4000);
        return;
      }
      setSipReconnectNonce((current) => current + 1);
    };
    sipReconnectTimerRef.current = window.setTimeout(reconnectWhenIdle, Math.max(500, delayMs));
  }, [isAuthenticated, sipAgentIdentity]);

  // SIP Registration on login
  useEffect(() => {
    if (!isAuthenticated || !sipAgentIdentity) return;
    const agent = sipAgentIdentity;
    if (!agent) {
      setSipTransportRegistered(false);
      setSipStatusReason("SIP agent identity is unavailable");
      return;
    }
    if (!agent.sipPassword) {
      setSipTransportRegistered(false);
      setSipStatusReason("SIP password is missing");
      console.warn("SIP registration skipped: missing VITE_SIP_AUTH_PASSWORD");
      return;
    }

    let mounted = true;
    let currentUa: SipUserAgent | null = null;
    let currentRegisterer: SipRegisterer | null = null;
    let disposeRegistrationObserver: (() => void) | null = null;
    const connectSip = async () => {
      try {
        const SIP = await getSIP();
        if (!mounted) return;
        const uri = SIP.UserAgent.makeURI(`sip:${agent.ext}@${SIP_SERVER}`);
        if (!uri) return;
        const defaultMediaStreamFactory = SIP.Web.defaultMediaStreamFactory();
        const sessionDescriptionHandlerFactory = SIP.Web.defaultSessionDescriptionHandlerFactory(
          (
            constraints: MediaStreamConstraints,
            sessionDescriptionHandler: unknown,
            options?: SessionDescriptionHandlerOptionsWithLocalMediaStream,
          ) => {
            if (options?.localMediaStream) {
              return Promise.resolve(options.localMediaStream);
            }

            return defaultMediaStreamFactory(constraints, sessionDescriptionHandler);
          },
        );

        const ua = new SIP.UserAgent({
          uri,
          logBuiltinEnabled: false,
          logConfiguration: false,
          logLevel: "warn",
          transportOptions: {
            server: WSS_URL,
            keepAliveInterval: 10,
            keepAliveDebounce: 5,
          },
          reconnectionAttempts: 5,
          reconnectionDelay: 4,
          authorizationUsername: agent.ext,
          authorizationPassword: agent.sipPassword,
          displayName: agent.name,
          sessionDescriptionHandlerFactory,
          delegate: {
            onInvite: (invitation) => {
              const processInvite = async () => {
                const runtime = sipInviteRuntimeRef.current;
                await runtime.reconcileLocalCallState();
                const clearStaleIncomingWorkflowForNewInvite = () => {
                  const ringStartedAt = new Date(incomingRingStartedAtRef.current || "").getTime();
                  const hasStaleIncomingDialog = (
                    incomingDialogOpenRef.current
                    && callPhaseRef.current === "dialing"
                    && Number.isFinite(ringStartedAt)
                    && Date.now() - ringStartedAt > STALE_INCOMING_RING_MS
                  );

                  if (!hasStaleIncomingDialog) return false;

                  const staleSession = sessionRef.current;
                  if (staleSession && staleSession !== invitation) {
                    try {
                      staleSession.reject?.();
                    } catch (error) {
                      console.warn("Failed to reject stale incoming SIP session before accepting next invite:", error);
                    }
                  }

                  runtime.stopIncomingAlert();
                  runtime.invalidateMicrophonePreparationAttempt();
                  runtime.resetRemoteAudio();
                  runtime.resetMuteState();
                  runtime.resetLiveCallTiming();
                  runtime.clearIncomingAutoAnswerTimer();
                  sessionRef.current = null;
                  activeCallIdRef.current = null;
                  incomingDialogCallIdRef.current = "";
                  incomingRingStartedAtRef.current = "";
                  incomingDialogOpenRef.current = false;
                  incomingDraftPhoneRef.current = "";
                  callWrapUpPendingRef.current = false;
                  callPhaseRef.current = "idle";
                  setIncomingDialogOpen(false);
                  setIncomingDraftPhone("");
                  clearIncomingDialogSession();
                  setCallWrapUpPending(false);
                  setCallPhase("idle");
                  return true;
                };
                clearStaleIncomingWorkflowForNewInvite();
                const hasBusyIncomingWorkflow = () => (
                  callPhaseRef.current !== "idle"
                  || callWrapUpPendingRef.current
                  || sessionRef.current
                  || activeCallIdRef.current
                  || outboundDialStartInFlightRef.current
                  || incomingAnswerInFlightRef.current
                );

                if (hasBusyIncomingWorkflow()) {
                  try {
                    invitation.reject?.();
                  } catch (error) {
                    console.error("Failed to reject incoming call while unavailable:", error);
                  }
                  toast.info(
                    "Incoming call ignored while another call or wrap-up is in progress",
                  );
                  return;
                }

                const callerCandidates = runtime.resolveIncomingCallerPhones(invitation);
                let caller = callerCandidates[0] || normalizePhoneNumber(invitation.remoteIdentity?.uri?.user || "Unknown");
                let transferContextForInvite: TransferContextRecord | null = null;
                let isTransferInvite = false;
                if (agent.role === "agent") {
                  transferContextForInvite = await api.getTransferContext(undefined, undefined, agent.ext).catch(() => null);
                  isTransferInvite = shouldBypassLanguageFilterForTransfer(transferContextForInvite, agent.ext);
                  if (isTransferInvite && transferContextForInvite?.phone) {
                    caller = normalizePhoneNumber(transferContextForInvite.phone) || caller;
                  }
                }
                const displayName =
                  (isTransferInvite && transferContextForInvite?.customerName) ||
                  invitation.remoteIdentity?.displayName ||
                  invitation.remoteIdentity?.friendlyName ||
                  invitation.request?.from?.displayName ||
                  invitation.request?.from?.friendlyName ||
                  caller;
                const pendingLiveMonitorRequest = isAdminRole(agent.role)
                  ? consumePendingLiveMonitorRequest()
                  : null;

                if (shouldRejectUnmatchedAdminSipInvite(agent.role, pendingLiveMonitorRequest)) {
                  try {
                    invitation.reject?.();
                  } catch (error) {
                    console.error("Failed to reject unmatched admin SIP invite:", error);
                  }
                  console.warn("Rejected admin SIP invite without a pending live monitor request", {
                    agentId: agent.id,
                    caller,
                  });
                  return;
                }

                if (pendingLiveMonitorRequest) {
                  await runtime.reconcileLocalCallState();
                  if (
                    callPhaseRef.current !== "idle" ||
                    callWrapUpPendingRef.current ||
                    sessionRef.current ||
                    activeCallIdRef.current ||
                    outboundDialStartInFlightRef.current ||
                    incomingAnswerInFlightRef.current
                  ) {
                    try {
                      invitation.reject?.();
                    } catch (error) {
                      console.error("Failed to reject live monitor invite while busy:", error);
                    }
                    return;
                  }

                  sessionRef.current = invitation;
                  clearIncomingDialogSession();
                  incomingRingStartedAtRef.current = new Date().toISOString();
                  runtime.resetRemoteAudio();

                  invitation.stateChange.addListener((state) => {
                    if (state === SIP.SessionState.Terminated) {
                      const activeMonitorMode = liveMonitorSessionRef.current?.mode;
                      if (!activeMonitorMode && callPhaseRef.current === "idle") {
                        return;
                      }
                      runtime.finalizeLiveMonitorSession({
                        mode: activeMonitorMode || pendingLiveMonitorRequest.mode,
                        notify: true,
                      });
                    }
                  });

                  const connected = await runtime.answerLiveMonitorInvite(invitation, pendingLiveMonitorRequest);
                  if (!connected) {
                    try {
                      invitation.reject?.();
                    } catch (error) {
                      console.error("Failed to reject live monitor invite after answer failure:", error);
                    }
                  }
                  return;
                }

                const reconnectSuppressedCustomer = runtime.getReconnectSuppressedCustomer(caller);

                if (reconnectSuppressedCustomer) {
                  try {
                    invitation.reject?.();
                  } catch (error) {
                    console.error("Failed to reject suppressed immediate reconnect:", error);
                  }
                  runtime.notifyReconnectSuppressed(caller, "incoming");
                  return;
                }

                if (!canReceiveIncomingCallsRef.current && !isTransferInvite) {
                  try {
                    invitation.reject?.();
                  } catch (error) {
                    console.error("Failed to reject incoming call while agent status blocks incoming calls:", error);
                  }
                  toast.info(`Incoming call ignored while your status is ${getAgentStatusLabel(effectiveAgentStatusRef.current)}`);
                  return;
                }

                if (hasBusyIncomingWorkflow() || (!canReceiveIncomingCallsRef.current && !isTransferInvite)) {
                  try {
                    invitation.reject?.();
                  } catch (error) {
                    console.error("Failed to reject incoming call after validation:", error);
                  }
                  return;
                }

                let ivrPayload: CallIvrMetadata = {};
                if (caller) {
                  void runtime.getCallIvrMetadata(caller)
                    .then((payload) => {
                      ivrPayload = payload || {};
                    })
                    .catch((error) => {
                      console.warn("Incoming IVR metadata lookup failed after invite presentation:", error);
                    });
                  void runtime.getBlockedIncomingPhone(invitation)
                    .then((blockedIncomingPhone) => {
                      if (!blockedIncomingPhone) return;
                      console.warn(
                        "Blocked incoming phone was detected after call presentation:",
                        runtime.getVisiblePhoneLabel(blockedIncomingPhone),
                      );
                    })
                    .catch(() => {});
                }

                // Handle incoming SIP call
                const nextIncomingDialogCallId = buildIncomingDialogCallId(invitation, caller);
                sessionRef.current = invitation;
                incomingTransferContextRef.current = isTransferInvite ? transferContextForInvite : null;
                incomingDialogCallIdRef.current = nextIncomingDialogCallId;
                setIncomingDialogCallId(nextIncomingDialogCallId);
                incomingRingStartedAtRef.current = new Date().toISOString();
                runtime.resetRemoteAudio();

                setIncomingDraftPhone(caller);
                setIncomingDialogOpen(true);
                setCallPhase("dialing");
                callPhaseRef.current = "dialing";
                runtime.prewarmIncomingLocalAudio();
                runtime.startIncomingAlert();
                runtime.scheduleIncomingAutoAnswer(invitation);
                const visibleCaller = runtime.getVisiblePhoneLabel(caller);
                const visibleDisplayName = displayName.replace(/\D/g, "").length >= 7 ? visibleCaller : displayName;
                if (agent.role !== "agent") {
                  toast.warning(`Incoming call from ${visibleDisplayName} (${visibleCaller})`);
                } else if (isTransferInvite) {
                  toast.info(`Transfer call from ${visibleDisplayName}. Auto connecting audio.`);
                }
                let inviteWasEstablished = false;

                invitation.stateChange.addListener((state) => {
                  if (state === SIP.SessionState.Established) {
                    inviteWasEstablished = true;
                    runtime.stopIncomingAlert();
                    runtime.clearIncomingAutoAnswerTimer();
                  }
                  if (state === SIP.SessionState.Terminated) {
                    if (skipSessionTerminationSideEffectsRef.current === invitation) {
                      skipSessionTerminationSideEffectsRef.current = null;
                      if (sessionRef.current === invitation) {
                        sessionRef.current = null;
                      }
                      return;
                    }
                    runtime.stopIncomingAlert();
                    runtime.clearIncomingAutoAnswerTimer();
                    runtime.invalidateMicrophonePreparationAttempt();
                    const wasManualCallEnd = manualCallEndRef.current;
                    manualCallEndRef.current = false;
                    let toastMessage = "";
                    const activeCallId = activeCallIdRef.current;

                    const incomingInviteWasConnected = didIncomingInviteReachConnectedState({
                      inviteWasEstablished,
                      incomingDialogCallId: nextIncomingDialogCallId,
                      activeCallId,
                    });

                    if (incomingInviteWasConnected) {
                      const isTransferred = nextFinalizeStatusRef.current === "transferred";
                      const disconnectOutcome = getEstablishedDisconnectOutcome({
                        isTransferred,
                        endedByAgent: wasManualCallEnd,
                      });
                      if (activeCallId) {
                        runtime.updateCallById(activeCallId, (call) => ({
                          ...call,
                          callbackStatus: resolveDisconnectCallbackStatus(call.callbackStatus, disconnectOutcome.callbackStatus),
                          notes: appendCallNote(call.notes, disconnectOutcome.note),
                        }));
                      }
                      finalizeActiveCallRef.current("completed");
                      toastMessage = disconnectOutcome.toastMessage;
                    } else {
                      nextFinalizeStatusRef.current = null;
                      const wasCanceledDuringAnswer = incomingAnswerInFlightRef.current;
                      if (wasCanceledDuringAnswer) {
                        toastMessage = "Incoming call was no longer available.";
                      } else {
                        const preAnswerOutcome = getIncomingPreAnswerOutcome({
                          endedByAgent: wasManualCallEnd,
                        });
                        toastMessage = preAnswerOutcome.toastMessage;
                        if (!wasManualCallEnd) {
                        const attribution = readIncomingCallAttribution(invitation.request);
                        runtime.recordMissedIncomingCall({
                          callId: nextIncomingDialogCallId,
                          callerId: caller,
                          callbackStatus: preAnswerOutcome.callbackStatus,
                          followUpFlag: preAnswerOutcome.followUpFlag,
                          note: preAnswerOutcome.note,
                          ringStartedAt: incomingRingStartedAtRef.current,
                          language: ivrPayload.language,
                          businessType: ivrPayload.businessType,
                          purpose: ivrPayload.purpose,
                          callSource: attribution.callSource,
                          carrierTrunk: attribution.carrierTrunk,
                          trunkCode: attribution.trunkCode,
                          pilot: attribution.pilot,
                          didOrCli: attribution.didOrCli,
                        });
                        }
                      }
                    }

                    runtime.resetRemoteAudio();
                    sessionRef.current = null;
                    clearIncomingDialogSession();
                    if (!incomingInviteWasConnected) {
                      setIncomingDialogOpen(false);
                      setIncomingDraftPhone("");
                      setCallWrapUpPending(false);
                      callWrapUpPendingRef.current = false;
                    }
                    setCallPhase("idle");
                    callPhaseRef.current = "idle";
                    runtime.resetMuteState();
                    setIsOnHold(false);
                    runtime.resetLiveCallTiming();
                    toast.info(toastMessage);
                  }
                });
              };

              void processInvite();
            },
          },
        });

        currentUa = ua;
        uaRef.current = ua;
        currentRegisterer = new SIP.Registerer(ua, {
          expires: REGISTER_EXPIRES_SECONDS,
          refreshFrequency: REGISTER_REFRESH_FREQUENCY,
        });
        regRef.current = currentRegisterer;

        const registrationObserver = observeSipRegistration(currentRegisterer, () => ua.isConnected(), (registered, state) => {
          if (!mounted || uaRef.current !== ua || regRef.current !== currentRegisterer) return;
          setSipTransportRegistered(registered);
          if (registered) {
            setSipStatusReason("Web phone registered");
            if (sipReconnectTimerRef.current) {
              window.clearTimeout(sipReconnectTimerRef.current);
              sipReconnectTimerRef.current = null;
            }
          } else if (state === "Unregistered" || state === "Terminated") {
            setSipStatusReason("PBX registration unavailable. Reconnecting...");
            scheduleSipReconnect(15000);
          }
        });
        disposeRegistrationObserver = registrationObserver.dispose;

        const registerWebPhone = async () => {
          const registerer = currentRegisterer;
          if (!registerer) {
            throw new Error("SIP registerer is unavailable");
          }

          await registerer.register({
            requestDelegate: {
              onAccept: () => {
                // register() resolves on submission; acceptance confirms the PBX response.
                if (mounted && uaRef.current === ua && regRef.current === registerer) registrationObserver.refresh();
              },
              onReject: (response) => {
                if (!mounted || uaRef.current !== ua || regRef.current !== registerer) return;
                setSipTransportRegistered(false);
                setSipStatusReason(`PBX rejected registration (SIP ${response.message.statusCode}).`);
                scheduleSipReconnect(15000);
              },
            },
          });
        };

        await ua.start();
        if (!mounted || uaRef.current !== ua) return;
        await registerWebPhone();

        ua.transport.onDisconnect = () => {
          if (!mounted || uaRef.current !== ua) return;
          setSipTransportRegistered(false);
          const backendReason = isBackendSipEndpointReachable(backendSipStatusRef.current)
            ? "PBX still sees the extension online. Browser transport is reconnecting."
            : "Browser SIP transport disconnected. Reconnecting...";
          setSipStatusReason(backendReason);
          toast.error("SIP disconnected");
          scheduleSipReconnect();
        };
        ua.transport.onConnect = () => {
          if (!mounted || uaRef.current !== ua || regRef.current !== currentRegisterer) return;
          setSipTransportRegistered(false);
          setSipStatusReason("Web phone transport connected. Registering with PBX...");
          void registerWebPhone().catch((error) => {
            if (!mounted || uaRef.current !== ua || regRef.current !== currentRegisterer) return;
            console.error("SIP reconnect registration failed:", error);
            setSipTransportRegistered(false);
            setSipStatusReason(getUserFacingRuntimeErrorMessage(error, "SIP registration failed after reconnect"));
            scheduleSipReconnect(4000);
          });
        };
      } catch (e) {
        console.error("SIP connect error:", e);
        if (mounted) {
          setSipTransportRegistered(false);
          setSipStatusReason(getUserFacingRuntimeErrorMessage(
            e,
            `SIP connection failed at ${WSS_URL}`,
          ));
          scheduleSipReconnect(4000);
        }
        if (mounted) toast.error(`SIP connection failed — verify the certificate and WSS endpoint at ${WSS_URL}`);
      }
    };

    connectSip();
    return () => {
      mounted = false;
      disposeRegistrationObserver?.();
      if (sipReconnectTimerRef.current) {
        window.clearTimeout(sipReconnectTimerRef.current);
        sipReconnectTimerRef.current = null;
      }
      const currentSession = sessionRef.current;
      if (currentSession) {
        const terminationIntent = getSessionTerminationIntent(callPhaseRef.current, {
          incomingDialog: incomingDialogOpenRef.current,
          liveMonitor: Boolean(liveMonitorSessionRef.current),
        });
        skipSessionTerminationSideEffectsRef.current = currentSession;
        void issueSipSessionTerminationRequest(currentSession, terminationIntent, { preferDispose: true }).catch((error) => {
          console.error("SIP cleanup termination request failed:", error);
        });
      }
      try {
        void currentRegisterer?.unregister();
        void currentUa?.stop();
      } catch (error) {
        console.error("SIP cleanup error:", error);
      }
      if (regRef.current === currentRegisterer) {
        regRef.current = null;
      }
      if (uaRef.current === currentUa) {
        uaRef.current = null;
      }
      setSipTransportRegistered(false);
    };
  }, [clearIncomingDialogSession, getSIP, getSessionTerminationIntent, isAuthenticated, issueSipSessionTerminationRequest, scheduleSipReconnect, sipAgentIdentity, sipReconnectNonce]);

  // Call timer
  useEffect(() => {
    if (callPhase !== "connected" || !callStartedAt) return;
    const syncLiveCallDuration = () => {
      const talkDurationSeconds = getDurationSecondsFromStartedAt(callStartedAt);
      setElapsedSeconds(talkDurationSeconds);

      const activeCallId = activeCallIdRef.current;
      if (!activeCallId) return;

      const previousPersist = lastPersistedLiveDurationRef.current;
      const shouldPersistDuration = (
        talkDurationSeconds > 0
        && (
          previousPersist.callId !== activeCallId
          || (talkDurationSeconds <= 5 && talkDurationSeconds > previousPersist.seconds)
          || (talkDurationSeconds > 5 && (talkDurationSeconds - previousPersist.seconds) >= 10)
        )
      );

      if (!shouldPersistDuration) return;

      lastPersistedLiveDurationRef.current = {
        callId: activeCallId,
        seconds: talkDurationSeconds,
      };
      void api.saveCall({
        id: activeCallId,
        status: "active",
        duration: formatDuration(talkDurationSeconds),
        talkDurationSeconds,
        ringStartedAt: callRingStartedAtRef.current || "",
        answeredAt: callAnsweredAtRef.current || "",
      });
    };

    syncLiveCallDuration();
    const interval = window.setInterval(() => {
      syncLiveCallDuration();
    }, LIVE_CALL_DURATION_SAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [callPhase, callStartedAt]);

  // Reset on logout
  useEffect(() => {
    if (!isAuthenticated) {
      const currentSession = sessionRef.current;
      if (currentSession) {
        const terminationIntent = getSessionTerminationIntent(callPhaseRef.current, {
          incomingDialog: incomingDialogOpenRef.current,
          liveMonitor: Boolean(liveMonitorSessionRef.current),
        });
        skipSessionTerminationSideEffectsRef.current = currentSession;
        void issueSipSessionTerminationRequest(currentSession, terminationIntent, { preferDispose: true }).catch((error) => {
          console.error("Logout SIP session termination failed:", error);
        });
      }
      invalidateMicrophonePreparationAttempt();
      reminderShownRef.current = null;
      if (!currentSession) {
        skipSessionTerminationSideEffectsRef.current = null;
      }
      activeCallIdRef.current = null;
      pendingOutboundCallIdRef.current = "";
      sessionRef.current = null;
      liveMonitorSessionRef.current = null;
      finalizedCallSnapshotsRef.current = new Map();
      manualOutboundCancelRef.current = false;
      manualCallEndRef.current = false;
      outboundDialStartInFlightRef.current = false;
      incomingAnswerInFlightRef.current = false;
      recentlyEndedCustomerRef.current = null;
      reconnectSuppressionNoticeRef.current = null;
      resetAutoDialLead();
      setReminderFollowUp(null);
      // Form stays open: setIncomingDialogOpen(false);
      setCallWrapUpPending(false);
      setDialedNumber("");
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      stopLocalAudioHealthMonitor();
      stopLocalRingback();
      resetMuteState();
      setIsOnHold(false);
      resetLiveCallTiming();
      setAgentStatus("active");
      setBreakStartTime(null);
      setFollowUpStartTime(null);
      removeSessionStorageItem(BREAK_SESSION_KEY);
      removeSessionStorageItem(FOLLOWUP_SESSION_KEY);
    }
  }, [getSessionTerminationIntent, invalidateMicrophonePreparationAttempt, isAuthenticated, issueSipSessionTerminationRequest, resetAutoDialLead, resetLiveCallTiming, resetMuteState, stopLocalAudioHealthMonitor, stopLocalRingback]);

  const rateTicker = useMemo(() => metalRates.map((rate) => `Today's ${rate.label} ${rate.value}`), [metalRates]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent" || !user.id) {
      setAssignedLanguages([]);
      return;
    }

    let ignore = false;
    const loadAssignedLanguages = async () => {
      try {
        const [languageMap, agentRecords] = await Promise.all([
          api.getAgentLanguages(),
          api.getAgents(),
        ]);
        if (ignore) return;

        const nextLanguages = Array.from(new Set(
          [
            ...(Array.isArray(languageMap?.[user.id]) ? languageMap[user.id] : []),
            ...(Array.isArray(agentRecords.find((agent) => agent.id === user.id)?.languages)
              ? agentRecords.find((agent) => agent.id === user.id)?.languages ?? []
              : []),
          ]
            .map((language) => language?.trim())
            .filter((language): language is string => Boolean(language)),
        ));

        setAssignedLanguages(nextLanguages);
      } catch (error) {
        console.error("Failed to load assigned agent languages:", error);
      }
    };

    void loadAssignedLanguages();
    const interval = window.setInterval(() => {
      void loadAssignedLanguages();
    }, 120000);

    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [isAuthenticated, user?.id, user?.role]);

  const rememberFinalizedCall = useCallback((snapshot: FinalizedCallSnapshot) => {
    const nextSnapshots = new Map(finalizedCallSnapshotsRef.current);
    nextSnapshots.delete(snapshot.id);
    nextSnapshots.set(snapshot.id, snapshot);

    while (nextSnapshots.size > 25) {
      const oldestKey = nextSnapshots.keys().next().value;
      if (!oldestKey) break;
      nextSnapshots.delete(oldestKey);
    }

    finalizedCallSnapshotsRef.current = nextSnapshots;
  }, []);

  const getFinalizedCallSnapshot = useCallback((callId?: string) => {
    if (!callId) return null;
    return finalizedCallSnapshotsRef.current.get(callId) || null;
  }, []);

  const getLiveCallSnapshot = useCallback((callId?: string) => {
    const activeCallId = activeCallIdRef.current;
    if (!activeCallId) return null;
    if (callId && callId !== activeCallId) return null;

    const activeCall = callsRef.current.find((call) => call.id === activeCallId);
    if (!activeCall) return null;

    const talkDurationSeconds = getDurationSecondsFromStartedAt(callStartedAtRef.current, 0, Date.now());
    const liveDuration = formatDuration(talkDurationSeconds);

    return {
      id: activeCall.id,
      status: activeCall.status,
      duration: getLongerCallDuration(liveDuration, normalizeCallDuration(activeCall.duration, "00:00")),
      ringStartedAt: activeCall.ringStartedAt || callRingStartedAtRef.current || "",
      answeredAt: activeCall.answeredAt || callAnsweredAtRef.current || "",
      endedAt: activeCall.endedAt || "",
      talkDurationSeconds: Math.max(Number(activeCall.talkDurationSeconds) || 0, talkDurationSeconds),
    };
  }, []);

  const finalizeActiveCall = useCallback((finalStatus: ManagedCall["status"]) => {
    const activeCallId = activeCallIdRef.current;
    if (!activeCallId) return;

    const endedAt = new Date().toISOString();
    const liveElapsedSeconds = getDurationSecondsFromStartedAt(callStartedAtRef.current, elapsedSeconds, Date.now());
    const duration = formatDuration(liveElapsedSeconds);
    const resolvedStatus = nextFinalizeStatusRef.current ?? finalStatus;
    nextFinalizeStatusRef.current = null;

    setCalls((prev) => {
      const target = prev.find((call) => call.id === activeCallId);
      if (!target) return prev;

      const fallbackDuration = normalizeCallDuration(target.duration, "00:01");
      const finalizedCall = {
        ...target,
        status: resolvedStatus,
        ringStartedAt: target.ringStartedAt || callRingStartedAtRef.current || "",
        answeredAt: target.answeredAt || callAnsweredAtRef.current || "",
        endedAt,
        talkDurationSeconds: Math.max(Number(target.talkDurationSeconds) || 0, liveElapsedSeconds),
        duration: getLongerCallDuration(duration, fallbackDuration),
      };
      rememberFinalizedCall({
        id: finalizedCall.id,
        status: finalizedCall.status,
        duration: finalizedCall.duration,
        ringStartedAt: finalizedCall.ringStartedAt,
        answeredAt: finalizedCall.answeredAt,
        endedAt: finalizedCall.endedAt,
        talkDurationSeconds: finalizedCall.talkDurationSeconds,
      });
      void api.saveCall(finalizedCall);
      return prev.map((call) => (call.id === activeCallId ? finalizedCall : call));
    });

    activeCallIdRef.current = null;
    void releaseAgentCallSlotQuietly(activeCallId, "active", false, { forceHangup: true });
  }, [elapsedSeconds, releaseAgentCallSlotQuietly, rememberFinalizedCall]);

  useEffect(() => {
    finalizeActiveCallRef.current = finalizeActiveCall;
  }, [finalizeActiveCall]);

  const fetchCallIvrMetadata = async (callerId: string, callId: string) => {
    const data = await getCallIvrMetadata(callerId);
    if (data.language || data.businessType || data.purpose) {
      setCalls((prev) => prev.map((c) => (
        c.id === callId
          ? {
              ...c,
              language: data.language || c.language,
              businessType: data.businessType || c.businessType,
              purpose: data.purpose || c.purpose,
            }
          : c
      )));
      api.saveCall({
        id: callId,
        language: data.language || "",
        businessType: data.businessType || "",
        purpose: data.purpose || "",
      });
    }
  };

  const syncCallIvrSelection = useCallback(async (payload: {
    phone?: string | null;
    language?: string | null;
    businessType?: string | null;
    purpose?: string | null;
    source: string;
  }) => {
    const phone = normalizePhoneNumber(payload.phone || "");
    const language = String(payload.language || "").trim();
    const businessType = String(payload.businessType || "").trim();
    const purpose = String(payload.purpose || "").trim();

    if (!phone || (!language && !businessType && !purpose)) return;

    console.info("IVR selection sync:", {
      source: payload.source,
      agentId: user?.id || "",
      agentName: user?.name || "",
      phone,
      language,
      businessType,
      purpose,
    });

    const result = await api.saveCallIvrSelection({
      phone,
      language,
      businessType,
      purpose,
      agentId: user?.id || "",
      agentName: user?.name || "",
      source: payload.source,
    });

    if (result.error) {
      console.error("Failed to sync IVR selection:", result.error);
    }
  }, [user?.id, user?.name]);

  const followUpDueCount = useMemo(() => {
    const now = Date.now();
    return followUps.filter((item) => isDueFollowUp(item, now)).length;
  }, [followUps]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "agent" || !user.id) {
      dismissedReminderKeysRef.current.clear();
      setReminderFollowUp(null);
      return;
    }

    dismissedReminderKeysRef.current = new Set(
      Array.from(dismissedReminderKeysRef.current).filter((key) => (
        followUps.some((item) => getFollowUpDismissKey(item) === key && isDueFollowUp(item))
      )),
    );

    const isDismissedReminder = (item: FollowUpRecord | null | undefined) => (
      Boolean(item) && dismissedReminderKeysRef.current.has(getFollowUpDismissKey(item))
    );

    const currentReminder = reminderFollowUp
      ? followUps.find((item) => item.id === reminderFollowUp.id) || reminderFollowUp
      : null;

    if (reminderShownRef.current) {
      const shownReminder = followUps.find((item) => item.id === reminderShownRef.current);
      if (!shownReminder || !isDueFollowUp(shownReminder)) {
        reminderShownRef.current = null;
      }
    }

    if (
      currentReminder
      && currentReminder.agentId === user.id
      && isDueFollowUp(currentReminder)
      && !isDismissedReminder(currentReminder)
    ) {
      if (currentReminder !== reminderFollowUp) {
        setReminderFollowUp(currentReminder);
      }
      return;
    }

    if (reminderFollowUp) {
      setReminderFollowUp(null);
    }

    const shouldDeferReminder = (
      callPhase !== "idle"
      || incomingDialogOpen
      || callWrapUpPending
      || Boolean(autoDialAlertLead)
      || Boolean(currentAutoDialLead)
    );
    if (shouldDeferReminder) {
      return;
    }

    const nextReminder = pickNextDueFollowUp(followUps.filter((item) => !isDismissedReminder(item)), {
      agentId: user.id,
      excludeIds: reminderShownRef.current ? [reminderShownRef.current] : [],
    });

    if (!nextReminder) {
      if (reminderFollowUp) {
        setReminderFollowUp(null);
      }
      return;
    }

    reminderShownRef.current = nextReminder.id;
    setReminderFollowUp(nextReminder);
  }, [
    autoDialAlertLead,
    callPhase,
    callWrapUpPending,
    currentAutoDialLead,
    followUps,
    incomingDialogOpen,
    isAuthenticated,
    reminderFollowUp,
    user?.id,
    user?.role,
  ]);

  const setDialedNumber = useCallback((value: string) => {
    const nextValue = String(value || "");
    const queuedLead = queuedAutoDialLeadRef.current;
    const queuedLeadNumber = normalizePhoneNumber(queuedLead?.mobileNumber);

    if (queuedLead && queuedLeadNumber !== normalizePhoneNumber(nextValue)) {
      void releaseQueuedAutoDialLead(queuedLead, { silent: true });
    }

    setDialedNumberState(nextValue);
  }, [releaseQueuedAutoDialLead]);

  const appendDigit = useCallback((digit: string) => {
    if (callPhase !== "idle") return;
    setDialedNumber(`${dialedNumberRef.current}${digit}`);
  }, [callPhase, setDialedNumber]);

  const backspaceDialedNumber = useCallback(() => {
    if (callPhase !== "idle") return;
    setDialedNumber(dialedNumberRef.current.slice(0, -1));
  }, [callPhase, setDialedNumber]);

  const clearDialedNumber = useCallback(() => {
    if (callPhase !== "idle") return;
    setDialedNumber("");
  }, [callPhase, setDialedNumber]);

  const prefillDialedNumber = useCallback((value: string) => {
    const queuedLead = queuedAutoDialLeadRef.current;
    if (queuedLead) {
      void releaseQueuedAutoDialLead(queuedLead, { silent: true });
    }
    setDialedNumberState(value);
    toast.success("Number loaded in the dialer");
  }, [releaseQueuedAutoDialLead]);

  const getAutoDialLeadAssignmentPayload = useCallback((lead?: AutoDialLeadRecord | null) => {
    const assignedAgentId = String(lead?.assignedAgentId || user?.id || "").trim();
    const assignedAgentName = String(lead?.assignedAgentName || user?.name || "").trim();
    if (!assignedAgentId) {
      return {};
    }
    return {
      assignedAgentId,
      assignedAgentName,
    };
  }, [user?.id, user?.name]);

  const loadAutoDialLeadIntoDialer = useCallback(async (lead: AutoDialLeadRecord) => {
    const normalizedPhone = normalizePhoneNumber(lead.mobileNumber);
    if (!lead?.id || !normalizedPhone) {
      toast.error("This auto call row does not have a valid customer number.");
      return false;
    }
    if (callPhaseRef.current !== "idle") {
      toast.error("Finish the current call before loading another auto call.");
      return false;
    }
    if (callWrapUpPendingRef.current) {
      toast.error("Submit or close the current wrap-up before loading the next auto call.");
      return false;
    }
    if (user?.role === "agent") {
      const isFollowUpLead = isFollowUpAutoDialLead(lead);
      if (effectiveAgentStatus === "active") {
        toast.error("Auto-calling is paused while your status is Incoming");
        return false;
      }
      if (effectiveAgentStatus === "outbound-auto" && isFollowUpLead) {
        toast.error("Follow-up calls are paused while your status is Outbound Auto Calls");
        return false;
      }
      if (effectiveAgentStatus === "follow-up" && !isFollowUpLead) {
        toast.error("Fresh outbound calls are paused while your status is Follow-Up");
        return false;
      }
      if (effectiveAgentStatus !== "outbound-auto" && effectiveAgentStatus !== "follow-up") {
        toast.error("Admin must switch your status to Outbound Auto Calls or Follow-Up before auto-calling");
        return false;
      }
    }

    const previouslyQueuedLead = queuedAutoDialLeadRef.current;
    if (previouslyQueuedLead?.id && previouslyQueuedLead.id !== lead.id) {
      const released = await releaseQueuedAutoDialLead(previouslyQueuedLead, { silent: true });
      if (!released) {
        return false;
      }
    }

    if (lead.status === "pending") {
      const assignmentPayload = getAutoDialLeadAssignmentPayload(lead);
      if (!assignmentPayload.assignedAgentId) {
        toast.error("Your agent session is missing. Refresh and try again.");
        return false;
      }

      const claimResult = await api.updateAutoDialLead(lead.id, {
        status: "assigned",
        retryAllowed: true,
        ...assignmentPayload,
      });
      if (claimResult.success === false) {
        toast.error(getUserFacingRuntimeErrorMessage(
          claimResult.error,
          "Unable to reserve this auto call right now.",
        ));
        return false;
      }
      const claimedLead = {
        ...lead,
        status: "assigned" as const,
        assignedAgentId: assignmentPayload.assignedAgentId,
        assignedAgentName: assignmentPayload.assignedAgentName || "",
        assignedAt: new Date().toISOString(),
      };
      queuedAutoDialClaimedLeadIdRef.current = lead.id;
      setQueuedAutoDialLead(claimedLead);
      queuedAutoDialLeadRef.current = claimedLead;
    } else {
      queuedAutoDialClaimedLeadIdRef.current = "";
      setQueuedAutoDialLead(lead);
      queuedAutoDialLeadRef.current = lead;
    }
    setDialedNumberState(normalizedPhone);
    toast.success("Auto call loaded in the dialer");
    return true;
  }, [effectiveAgentStatus, getAutoDialLeadAssignmentPayload, releaseQueuedAutoDialLead, user?.role]);

  const completeCallWrapUp = useCallback(() => {
    callWrapUpPendingRef.current = false;
    setCallWrapUpPending(false);
  }, []);

  const startOutboundCall = useCallback(async (rawNumber: string, autoDialLead?: AutoDialLeadRecord | null) => {
    const targetNumber = normalizePhoneNumber(rawNumber);
    if (!targetNumber || !user || outboundDialStartInFlightRef.current) return;
    const outboundCallId = buildManagedCallId();
    const autoDialAssignmentPayload = getAutoDialLeadAssignmentPayload(autoDialLead);
    if (autoDialLead && autoDialEnabledRef.current === false) {
      resetAutoDialLead();
      toast.error("Auto call is disconnected by admin");
      return;
    }
    await reconcileLocalCallState();
    if (hasLocalActiveCall()) {
      toast.error("Another call is already active. Finish it before starting a new outbound call.");
      return;
    }
    if (callWrapUpPendingRef.current) {
      toast.error("Submit the current call form before connecting the next call");
      return;
    }
    const isManualOutboundCall = !autoDialLead;
    if (user.role === "agent" && !canStartOutboundCalls) {
      toast.error(
        user.status === "inactive"
          ? "Your account is inactive"
          : isBreakStatus(effectiveAgentStatus)
            ? "End break before starting a call"
            : "Admin must switch your status to Manual Dial, Outbound Auto Calls, or Follow-Up before starting outbound calls",
      );
      return;
    }
    if (user.role === "agent" && isManualOutboundCall && effectiveAgentStatus !== "manual-outgoing") {
      toast.error("Admin must switch your status to Manual Dial before you can dial a number manually");
      return;
    }
    if (
      user.role === "agent"
      && autoDialLead
      && effectiveAgentStatus !== "outbound-auto"
      && effectiveAgentStatus !== "follow-up"
    ) {
      toast.error("Auto-call leads can be dialed only in Outbound Auto Calls or Follow-Up mode");
      return;
    }
    if (!(await ensureAgentCallSlotAvailable("dial"))) {
      return;
    }

    outboundDialStartInFlightRef.current = true;
    manualCallEndRef.current = false;

    if (await isBlockedPhone(targetNumber)) {
      outboundDialStartInFlightRef.current = false;
      if (autoDialLead) {
        void api.updateAutoDialLead(autoDialLead.id, { status: "failed", lastError: "Number blocked by admin" });
        resetAutoDialLead();
      }
      toast.error(`Calls to ${getVisiblePhoneLabel(targetNumber)} are blocked by admin`);
      return;
    }

    const microphonePreparationAttempt = beginMicrophonePreparationAttempt();

    if (autoDialLead) {
      activeAutoDialLeadRef.current = autoDialLead;
      autoDialConnectedRef.current = false;
      lastAutoDialLeadIdRef.current = autoDialLead.id;
      clearQueuedAutoDialLead();
      setCurrentAutoDialLead(autoDialLead);
    } else {
      clearQueuedAutoDialLead();
      setCurrentAutoDialLead(null);
    }

    setDialedNumber(targetNumber);
    setCallPhase("dialing");
    callPhaseRef.current = "dialing";
    // Unlock the remote audio element from the agent's explicit Call click;
    // SIP negotiation completes later, outside the browser user gesture.
    primeRemoteAudioPlayback();
    // Keep a local ringback fallback during the pre-answer period. Tata early
    // media may replace it, but a carrier that sends only SIP 180 without RTP
    // must not leave the agent hearing silence while the call is ringing.
    startLocalRingback();
    manualOutboundCancelRef.current = false;
    resetMuteState();
    setIsOnHold(false);
    resetLiveCallTiming();
    callRingStartedAtRef.current = new Date().toISOString();
    const visibleTargetNumber = getVisiblePhoneLabel(targetNumber);
    toast.info(
      autoDialLead
        ? `${getAutoDialLeadSourceLabel(autoDialLead.sourceFile)}: ${autoDialLead.customerName || visibleTargetNumber}`
        : `Dialing ${visibleTargetNumber}`,
    );

    try {
      const SIP = await getSIP();
      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || manualOutboundCancelRef.current) {
        outboundDialStartInFlightRef.current = false;
        stopLocalRingback();
        return;
      }
        if (!uaRef.current) {
          outboundDialStartInFlightRef.current = false;
          toast.error("SIP not connected");
          if (autoDialLead) {
            void api.updateAutoDialLead(autoDialLead.id, { status: "failed", lastError: "SIP not connected" });
            resetAutoDialLead();
          }
          stopLocalRingback();
          setCallPhase("idle");
          callPhaseRef.current = "idle";
          return;
        }

      const target = SIP.UserAgent.makeURI(`sip:${targetNumber}@${SIP_SERVER}`);
      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || manualOutboundCancelRef.current) {
        outboundDialStartInFlightRef.current = false;
        stopLocalRingback();
        return;
      }
        if (!target) {
          outboundDialStartInFlightRef.current = false;
          toast.error("Invalid number");
          if (autoDialLead) {
            void api.updateAutoDialLead(autoDialLead.id, { status: "failed", lastError: "Invalid number" });
            resetAutoDialLead();
          }
          stopLocalRingback();
          setCallPhase("idle");
          callPhaseRef.current = "idle";
          return;
        }

      const outboundProfile = await api.getCustomerProfile(targetNumber).catch(() => null);
      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || manualOutboundCancelRef.current) {
        outboundDialStartInFlightRef.current = false;
        stopLocalRingback();
        return;
      }
      const outboundAttemptStartedAt = Date.now();
      const resolvedCustomerName = getMeaningfulCustomerName(
        outboundProfile?.customerName,
        autoDialLead?.customerName,
      );
      const resolvedPlace = outboundProfile?.location?.trim() || autoDialLead?.area || "";
      const resolvedLanguage = autoDialLead?.preferredLanguage?.trim() || outboundProfile?.language?.trim() || "";
      const resolvedBusinessType = outboundProfile?.businessType?.trim() || "";
      const resolvedPurpose = outboundProfile?.purpose?.trim() || (autoDialLead ? "Auto Dial" : "Outbound");
      const leadSource = autoDialLead ? getAutoDialLeadSourceLabel(autoDialLead.sourceFile) : "";
      void syncCallIvrSelection({
        phone: targetNumber,
        language: resolvedLanguage,
        businessType: resolvedBusinessType,
        purpose: resolvedPurpose,
        source: autoDialLead ? "outbound-auto-dial" : "outbound-call",
      });
      let outboundLocalAudioStream: MediaStream;
      try {
        outboundLocalAudioStream = await prepareSessionLocalAudio(true);
      } catch (error) {
        outboundDialStartInFlightRef.current = false;
        if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || manualOutboundCancelRef.current) {
          stopLocalRingback();
          return;
        }
        const message = getMicrophonePreparationErrorMessage(
          error,
          "Microphone permission denied. Allow microphone access in the browser and try again.",
        );
        toast.error(message);
        if (autoDialLead) {
          void api.updateAutoDialLead(autoDialLead.id, { status: "failed", lastError: message });
          resetAutoDialLead();
        }
        stopLocalRingback();
        setCallPhase("idle");
        callPhaseRef.current = "idle";
        return;
      }

      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || manualOutboundCancelRef.current) {
        outboundDialStartInFlightRef.current = false;
        outboundLocalAudioStream.getTracks().forEach((track) => track.stop());
        stopLocalRingback();
        return;
      }

      const inviter = new SIP.Inviter(uaRef.current, target, {
        sessionDescriptionHandlerOptions: {
          constraints: buildAudioOnlyConstraints(getPreferredAudioInputDeviceId()),
          localMediaStream: outboundLocalAudioStream,
        },
      });
      const outboundClaimDirection = effectiveAgentStatus === "follow-up"
        ? "follow-up"
        : effectiveAgentStatus === "manual-outgoing"
          ? "manual-outgoing"
          : "outgoing";
      if (!(await claimAgentCallSlot(
        outboundCallId,
        outboundClaimDirection,
        "Another live call is already active for this agent. Finish that call before dialing again.",
        targetNumber,
      ))) {
        outboundDialStartInFlightRef.current = false;
        outboundLocalAudioStream.getTracks().forEach((track) => track.stop());
        stopLocalRingback();
        setCallPhase("idle");
        callPhaseRef.current = "idle";
        if (autoDialLead) {
          void api.updateAutoDialLead(autoDialLead.id, { status: "failed", lastError: "Agent already has another active call" });
          resetAutoDialLead();
        }
        return;
      }

      pendingOutboundCallIdRef.current = outboundCallId;
      sessionRef.current = inviter;
      if (autoDialLead) {
        void api.updateAutoDialLead(autoDialLead.id, {
          status: "dialing",
          callId: outboundCallId,
          ...autoDialAssignmentPayload,
        });
      }
      let connectedCallId = "";
      let callWasEstablished = false;
      let remoteAccepted = false;
      let establishmentHandled = false;
      let terminationHandled = false;
      let lastRejectStatusCode = 0;
      let lastRejectReasonText = "";
      let outboundPreConnectTimeoutId: number | null = null;
      const clearOutboundPreConnectTimeout = () => {
        if (outboundPreConnectTimeoutId !== null) {
          window.clearTimeout(outboundPreConnectTimeoutId);
          outboundPreConnectTimeoutId = null;
        }
      };

      const markOutboundCallConnected = () => {
        if (establishmentHandled) return;
        establishmentHandled = true;
        remoteAccepted = true;
        callWasEstablished = true;
        clearOutboundPreConnectTimeout();
        stopLocalRingback();
        const answeredAt = new Date().toISOString();
        const ringStartedAt = callRingStartedAtRef.current || new Date(outboundAttemptStartedAt).toISOString();
        const activeCall = buildOutgoingConnectedCall({
          id: outboundCallId,
          callerId: targetNumber,
          customerName: resolvedCustomerName,
          agentId: user.id,
          agentName: user.name,
          time: getCurrentTime(),
          date: getCurrentDate(),
          place: resolvedPlace,
          leadSource,
          language: resolvedLanguage,
          branch: outboundProfile?.branch?.trim() || "",
          purpose: resolvedPurpose,
          businessType: resolvedBusinessType,
          metalType: outboundProfile?.metalType?.trim() || "",
          grams: outboundProfile?.grams?.trim() || "",
          releasingAmount: outboundProfile?.releasingAmount?.trim() || "",
          bankName: outboundProfile?.bankName?.trim() || "",
          onlinePrice: outboundProfile?.onlinePrice?.trim() || "",
          pricePerGram: outboundProfile?.pricePerGram?.trim() || "",
          advertisement: outboundProfile?.advertisement?.trim() || "",
          lead: outboundProfile?.lead?.trim() || "",
          formStatus: outboundProfile?.formStatus?.trim() || "",
          mob2: outboundProfile?.mob2?.trim() || "",
          district: outboundProfile?.district?.trim() || "",
          notes: outboundProfile?.notes?.trim() || "",
          ringStartedAt,
          answeredAt,
          talkDurationSeconds: 0,
        });
        connectedCallId = activeCall.id;
        activeCall.pbxSipCallId = inviter.request.callId;
        pendingOutboundCallIdRef.current = "";
        activeCallIdRef.current = activeCall.id;
        callRingStartedAtRef.current = ringStartedAt;
        callAnsweredAtRef.current = answeredAt;
        setCalls((prev) => [activeCall, ...prev]);
        void api.saveCall(activeCall);
        if (autoDialLead) {
          autoDialConnectedRef.current = true;
          void api.updateAutoDialLead(autoDialLead.id, {
            status: "dialing",
            callId: activeCall.id,
            ...autoDialAssignmentPayload,
          });
        }
        callWrapUpPendingRef.current = true;
        setCallWrapUpPending(true);
        setCallPhase("connected");
        callPhaseRef.current = "connected";
        const answeredTimestamp = new Date(answeredAt).getTime();
        callStartedAtRef.current = answeredTimestamp;
        setElapsedSeconds(0);
        setCallStartedAt(answeredTimestamp);
        attachAudioWithRetry();
        // Let the new dialog settle before any microphone repair is attempted.
        startLocalAudioHealthMonitor();
        scheduleConnectedMediaVerification(inviter);
        if (autoDialLead) {
          window.setTimeout(() => {
            if (sessionRef.current !== inviter) return;
            if (callPhaseRef.current !== "connected") return;
            if (activeAutoDialLeadRef.current?.id !== autoDialLead.id) return;
            void ensureSessionMicrophone(inviter, { forceRefresh: true });
          }, 350);
        }
        toast.success("Call connected");
      };

      inviter.stateChange.addListener((state) => {
        if (state === SIP.SessionState.Establishing) {
          attachAudioWithRetry();
        }
        if (state === SIP.SessionState.Established) {
          markOutboundCallConnected();
        }
        if (state === SIP.SessionState.Terminated) {
          if (skipSessionTerminationSideEffectsRef.current === inviter) {
            skipSessionTerminationSideEffectsRef.current = null;
            pendingOutboundCallIdRef.current = "";
            if (sessionRef.current === inviter) {
              sessionRef.current = null;
            }
            return;
          }
          if (terminationHandled) return;
          terminationHandled = true;
          clearOutboundPreConnectTimeout();
          invalidateMicrophonePreparationAttempt();
          pendingOutboundCallIdRef.current = "";
          outboundDialStartInFlightRef.current = false;
          stopLocalRingback();
          const wasManualOutboundCancel = manualOutboundCancelRef.current;
          manualOutboundCancelRef.current = false;
          const wasManualCallEnd = manualCallEndRef.current;
          manualCallEndRef.current = false;
          const isTransferred = nextFinalizeStatusRef.current === "transferred";
          const preConnectReasonText = lastRejectReasonText || (!uaRef.current?.isConnected() ? "Transport disconnected" : "");

          if (callWasEstablished || remoteAccepted) {
            const disconnectOutcome = getEstablishedDisconnectOutcome({
              isTransferred,
              endedByAgent: wasManualCallEnd,
            });
            if (activeCallIdRef.current) {
              updateCallById(activeCallIdRef.current, (call) => ({
                ...call,
                callbackStatus: resolveDisconnectCallbackStatus(call.callbackStatus, disconnectOutcome.callbackStatus),
                notes: appendCallNote(call.notes, disconnectOutcome.note),
              }));
            }
            finalizeActiveCall("completed");
          } else if (!wasManualOutboundCancel) {
            const preConnectOutcome = getOutboundMissedOutcome(lastRejectStatusCode, preConnectReasonText);
            const attemptedDurationSeconds = Math.max(0, Math.round((Date.now() - outboundAttemptStartedAt) / 1000));
            const missedCall = buildOutgoingMissedCall({
              id: outboundCallId,
              callerId: targetNumber,
              customerName: resolvedCustomerName,
              agentId: user.id,
              agentName: user.name,
              status: preConnectOutcome.callStatus,
              duration: formatDuration(attemptedDurationSeconds),
              time: getCurrentTime(),
              date: getCurrentDate(),
              place: resolvedPlace,
              leadSource,
              language: resolvedLanguage,
              branch: outboundProfile?.branch?.trim() || "",
              purpose: resolvedPurpose,
              businessType: resolvedBusinessType,
              metalType: outboundProfile?.metalType?.trim() || "",
              grams: outboundProfile?.grams?.trim() || "",
              releasingAmount: outboundProfile?.releasingAmount?.trim() || "",
              bankName: outboundProfile?.bankName?.trim() || "",
              onlinePrice: outboundProfile?.onlinePrice?.trim() || "",
              pricePerGram: outboundProfile?.pricePerGram?.trim() || "",
              advertisement: outboundProfile?.advertisement?.trim() || "",
              lead: outboundProfile?.lead?.trim() || "",
              formStatus: outboundProfile?.formStatus?.trim() || "",
              mob2: outboundProfile?.mob2?.trim() || "",
              district: outboundProfile?.district?.trim() || "",
              callbackStatus: preConnectOutcome.callbackStatus,
              followUpFlag: preConnectOutcome.followUpFlag,
              notes: appendCallNote(outboundProfile?.notes?.trim() || "", preConnectOutcome.note),
              ringStartedAt: callRingStartedAtRef.current || new Date(outboundAttemptStartedAt).toISOString(),
              endedAt: new Date().toISOString(),
              talkDurationSeconds: 0,
            });
            missedCall.pbxSipCallId = inviter.request.callId;
            rememberFinalizedCall({
              id: missedCall.id,
              status: missedCall.status,
              duration: normalizeCallDuration(missedCall.duration),
            });
            setCalls((prev) => [missedCall, ...prev]);
            void (async () => {
              await api.saveCall(missedCall);
              await refreshOperationalData();
            })();
          } else {
            void releaseAgentCallSlotQuietly(outboundCallId, "active", false, { forceHangup: true });
          }

          if (autoDialLead) {
            const preConnectOutcome = getOutboundMissedOutcome(lastRejectStatusCode, preConnectReasonText);
            void api.updateAutoDialLead(autoDialLead.id, {
              status: autoDialConnectedRef.current ? "completed" : "failed",
              callId: connectedCallId || outboundCallId || undefined,
              lastError: autoDialConnectedRef.current
                ? ""
                : (wasManualOutboundCancel ? "Dial cancelled by agent" : preConnectOutcome.autoDialError),
            });
            resetAutoDialLead();
          }
          const shouldKeepIntakeInWrapUp = !wasManualOutboundCancel;
          callWrapUpPendingRef.current = shouldKeepIntakeInWrapUp;
          setCallWrapUpPending(shouldKeepIntakeInWrapUp);
          resetRemoteAudio();
          sessionRef.current = null;
          setCallPhase("idle");
          callPhaseRef.current = "idle";
          resetMuteState();
          setIsOnHold(false);
          resetLiveCallTiming();
          if (callWasEstablished || remoteAccepted) {
            const disconnectOutcome = getEstablishedDisconnectOutcome({
              isTransferred,
              endedByAgent: wasManualCallEnd,
            });
            const notify = disconnectOutcome.callbackStatus === "Completed" || disconnectOutcome.callbackStatus === "Transferred"
              ? toast.success
              : toast.info;
            notify(disconnectOutcome.toastMessage);
          } else if (wasManualOutboundCancel) {
            toast.info("Dial cancelled");
          } else {
            toast.info(getOutboundMissedOutcome(lastRejectStatusCode, preConnectReasonText).toastMessage);
          }
        }
      });

      outboundPreConnectTimeoutId = window.setTimeout(() => {
        if (terminationHandled || callWasEstablished || remoteAccepted || sessionRef.current !== inviter) return;
        lastRejectStatusCode = 408;
        lastRejectReasonText = "Outbound ring timeout";
        stopLocalRingback();
        void issueSipSessionTerminationRequest(inviter, "cancel", { preferDispose: true }).catch((error) => {
          console.error("Failed to cancel outbound call after ring timeout:", error);
        });
      }, OUTBOUND_PRECONNECT_RING_TIMEOUT_MS);

      await inviter.invite({
        sessionDescriptionHandlerOptions: {
          constraints: buildAudioOnlyConstraints(getPreferredAudioInputDeviceId()),
          localMediaStream: outboundLocalAudioStream,
        },
        requestDelegate: {
          onProgress: () => {
            // 183/early-media audio is attached directly to the WebRTC receiver.
            // Do not overlay it with a browser-generated ringback tone.
            attachAudioWithRetry();
          },
          onRedirect: () => {
            attachAudioWithRetry();
          },
          onAccept: () => {
            lastRejectStatusCode = 200;
            lastRejectReasonText = "";
          },
          onReject: (response) => {
            stopLocalRingback();
            lastRejectStatusCode = Number(response.message.statusCode || 0);
            lastRejectReasonText = String(response.message.reasonPhrase || response.message.statusCode || "").trim();
          },
        },
      });
      outboundDialStartInFlightRef.current = false;
    } catch (e) {
      console.error("Call failed:", e);
      pendingOutboundCallIdRef.current = "";
      outboundDialStartInFlightRef.current = false;
      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || manualOutboundCancelRef.current) {
        stopLocalRingback();
        return;
      }
      const message = e instanceof Error ? e.message : "Unknown error";
      toast.error("Call failed: " + message);
      stopLocalAudioHealthMonitor();
      stopFallbackLocalAudio();
      stopLocalRingback();
      void releaseAgentCallSlotQuietly(outboundCallId, "active", false, { forceHangup: true });
      if (autoDialLead) {
        void api.updateAutoDialLead(autoDialLead.id, { status: "failed", lastError: message });
        resetAutoDialLead();
      }
      setCallPhase("idle");
      callPhaseRef.current = "idle";
    }
  }, [attachAudioWithRetry, beginMicrophonePreparationAttempt, canStartOutboundCalls, claimAgentCallSlot, clearQueuedAutoDialLead, effectiveAgentStatus, ensureAgentCallSlotAvailable, ensureSessionMicrophone, finalizeActiveCall, getAutoDialLeadAssignmentPayload, getSIP, getVisiblePhoneLabel, hasLocalActiveCall, invalidateMicrophonePreparationAttempt, isBlockedPhone, isCurrentMicrophonePreparationAttempt, prepareSessionLocalAudio, primeRemoteAudioPlayback, reconcileLocalCallState, refreshOperationalData, releaseAgentCallSlotQuietly, rememberFinalizedCall, resetAutoDialLead, resetLiveCallTiming, resetMuteState, resetRemoteAudio, startLocalAudioHealthMonitor, startLocalRingback, stopFallbackLocalAudio, stopLocalAudioHealthMonitor, stopLocalRingback, syncCallIvrSelection, updateCallById, user]);

  // ====== REAL SIP CALL ======
  const startCall = async () => {
    // Run synchronously from the Call button so browser user activation is
    // still available when the remote WebRTC stream is attached later.
    primeRemoteAudioPlayback();
    const selectedQueuedLead = queuedAutoDialLeadRef.current;
    const normalizedTargetNumber = normalizePhoneNumber(dialedNumber);
    const activeLead = selectedQueuedLead && normalizePhoneNumber(selectedQueuedLead.mobileNumber) === normalizedTargetNumber
      ? selectedQueuedLead
      : undefined;
    await startOutboundCall(dialedNumber, activeLead);
  };

  const acceptAutoDialAlert = useCallback(() => {
    const lead = autoDialAlertLeadRef.current;
    if (!lead) return;
    if (autoDialEnabledRef.current === false) {
      resetAutoDialLead();
      toast.error("Auto call is disconnected by admin");
      return;
    }
    const reconnectSuppressedCustomer = getReconnectSuppressedCustomer(lead.mobileNumber);
    if (reconnectSuppressedCustomer) {
      autoDialSnoozeRef.current = { leadId: lead.id, until: reconnectSuppressedCustomer.until };
      autoDialAlertLeadRef.current = null;
      setAutoDialAlertLead(null);
      notifyReconnectSuppressed(lead.mobileNumber, "auto-dial");
      return;
    }
    autoDialSnoozeRef.current = null;
    autoDialAlertLeadRef.current = null;
    setAutoDialAlertLead(null);
    void startOutboundCall(lead.mobileNumber, lead);
  }, [getReconnectSuppressedCustomer, notifyReconnectSuppressed, resetAutoDialLead, startOutboundCall]);

  const rejectAutoDialAlert = useCallback(async (reason: AutoDialQueueExitReason) => {
    const lead = autoDialAlertLeadRef.current;
    if (!lead) return false;

    const result = await api.updateAutoDialLead(lead.id, {
      status: "failed",
      lastError: reason,
      queueExitReason: reason,
      retryAllowed: false,
    });

    if (result.success === false || ("removed" in result && result.removed === false)) {
      toast.error(getUserFacingRuntimeErrorMessage(
        result.error,
        `Unable to remove this lead from auto follow-up as ${reason}.`,
      ));
      return false;
    }

    autoDialSnoozeRef.current = null;
    autoDialAlertLeadRef.current = null;
    setAutoDialAlertLead(null);
    lastAutoDialLeadIdRef.current = lead.id;
    if (currentUserId && currentUserRole === "agent" && autoDialEnabledRef.current === true && sipRegistered) {
      try {
        const nextLead = await api.getCurrentAutoDialLead(currentUserId);
        if (nextLead?.id && nextLead.id !== lead.id) {
          lastAutoDialLeadIdRef.current = nextLead.id;
          autoDialAlertLeadRef.current = nextLead;
          setAutoDialAlertLead(nextLead);
          toast.success(`${reason} saved. Loading the next follow-up.`);
          return true;
        }
      } catch (error) {
        console.error("Auto dial queue refresh after reject failed:", error);
      }
    }

    toast.success(`${reason} saved. Lead removed from auto follow-up queue.`);
    return true;
  }, [currentUserId, currentUserRole, sipRegistered]);

  const snoozeAutoDialAlert = useCallback(() => {
    const lead = autoDialAlertLeadRef.current;
    if (!lead) return;
    autoDialSnoozeRef.current = { leadId: lead.id, until: Date.now() + 60_000 };
    autoDialAlertLeadRef.current = null;
    setAutoDialAlertLead(null);
    toast.info("Follow-up alert snoozed for 1 minute");
  }, []);

  useEffect(() => {
    const lead = autoDialAlertLead;
    if (!lead) return;
    if (currentUserRole !== "agent") return;
    if (effectiveAgentStatus !== "outbound-auto" && effectiveAgentStatus !== "follow-up") return;
    if (autoDialEnabled !== true || !freshLeadAutoConnectEnabled || !sipRegistered) return;
    if (callPhase !== "idle" || callWrapUpPending || hasLocalActiveCall()) return;
    if (effectiveAgentStatus === "outbound-auto" && !isFreshAutoDialLead(lead)) return;
    if (effectiveAgentStatus === "follow-up" && !isFollowUpAutoDialLead(lead)) return;

    const delayMs = 750;
    const timeout = window.setTimeout(() => {
      if (autoDialAlertLeadRef.current?.id !== lead.id) return;
      if (autoDialEnabledRef.current !== true || !freshLeadAutoConnectEnabledRef.current) return;
      if (freshLeadAutoConnectIntervalSecondsRef.current <= 0) return;
      acceptAutoDialAlert();
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [
    acceptAutoDialAlert,
    autoDialAlertLead,
    autoDialEnabled,
    callPhase,
    callWrapUpPending,
    canReceiveAutoDialAssignments,
    currentUserRole,
    effectiveAgentStatus,
    freshLeadAutoConnectEnabled,
    freshLeadAutoConnectIntervalSeconds,
    hasLocalActiveCall,
    sipRegistered,
  ]);

  useEffect(() => {
    if (!autoDialAlertLead) return;
    if (callPhase === "idle" && !callWrapUpPending && !hasLocalActiveCall()) return;

    autoDialAlertLeadRef.current = null;
    setAutoDialAlertLead(null);
  }, [autoDialAlertLead, callPhase, callWrapUpPending, hasLocalActiveCall]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId || currentUserRole !== "agent") {
      setAutoDialEnabled(true);
      return;
    }

    void loadAutoDialControlState();
    const interval = window.setInterval(() => {
      void loadAutoDialControlState();
    // The control value is cached server-side and changes only from admin
    // actions; polling every 30 seconds across every agent created needless
    // request volume while the panel was already busy.
    }, 60000);

    return () => window.clearInterval(interval);
  }, [currentUserId, currentUserRole, isAuthenticated, loadAutoDialControlState]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId || currentUserRole !== "agent" || autoDialEnabled !== true || !sipRegistered || callWrapUpPending) return;

    const canAutoConnectAssignedLead = (lead: AutoDialLeadRecord) => {
      const currentMode = effectiveAgentStatusRef.current;
      return (
        autoDialEnabledRef.current === true
        && freshLeadAutoConnectEnabledRef.current
        && freshLeadAutoConnectIntervalSecondsRef.current > 0
        && callPhaseRef.current === "idle"
        && !callWrapUpPendingRef.current
        && !hasLocalActiveCall()
        && (
          (currentMode === "outbound-auto" && isFreshAutoDialLead(lead))
          || (currentMode === "follow-up" && isFollowUpAutoDialLead(lead))
        )
      );
    };

    const startAssignedLeadAutomatically = (lead: AutoDialLeadRecord) => {
      lastAutoDialLeadIdRef.current = lead.id;
      autoDialSnoozeRef.current = null;
      autoDialAlertLeadRef.current = null;
      setAutoDialAlertLead(null);
      void startOutboundCall(lead.mobileNumber, lead);
    };

    const pollAutoDialAssignments = async () => {
      if (
        autoDialPollingRef.current
        || callPhaseRef.current !== "idle"
        || callPhase !== "idle"
        || callWrapUpPendingRef.current
        || callWrapUpPending
        || autoDialAlertLeadRef.current
        || hasLocalActiveCall()
      ) return;

      autoDialPollingRef.current = true;
      try {
        const lead = await api.getCurrentAutoDialLead(currentUserId);
        if (callPhaseRef.current !== "idle" || callWrapUpPendingRef.current || hasLocalActiveCall()) return;
        if (!lead || !lead.mobileNumber) return;
        const snoozedLead = autoDialSnoozeRef.current;
        if (snoozedLead?.leadId === lead.id && snoozedLead.until > Date.now()) return;
        if (snoozedLead?.leadId === lead.id && snoozedLead.until <= Date.now()) {
          autoDialSnoozeRef.current = null;
        }
        const reconnectSuppressedCustomer = getReconnectSuppressedCustomer(lead.mobileNumber);
        if (reconnectSuppressedCustomer) {
          autoDialSnoozeRef.current = { leadId: lead.id, until: reconnectSuppressedCustomer.until };
          notifyReconnectSuppressed(lead.mobileNumber, "auto-dial");
          return;
        }
        const shouldRealert = Boolean(snoozedLead?.leadId === lead.id && snoozedLead.until <= Date.now());
        if (lastAutoDialLeadIdRef.current === lead.id && !shouldRealert) {
          if (canAutoConnectAssignedLead(lead)) {
            startAssignedLeadAutomatically(lead);
          } else if (
            callPhaseRef.current === "idle"
            && !callWrapUpPendingRef.current
            && !hasLocalActiveCall()
          ) {
            autoDialAlertLeadRef.current = lead;
            setAutoDialAlertLead(lead);
          }
          return;
        }
        if (callPhaseRef.current !== "idle" || callWrapUpPendingRef.current || hasLocalActiveCall()) return;
        if (canAutoConnectAssignedLead(lead)) {
          startAssignedLeadAutomatically(lead);
          return;
        }
        lastAutoDialLeadIdRef.current = lead.id;
        autoDialAlertLeadRef.current = lead;
        setAutoDialAlertLead(lead);
        toast.info(`${getAutoDialLeadSourceLabel(lead.sourceFile)} ready: ${lead.customerName || getVisiblePhoneLabel(lead.mobileNumber)}`);
      } catch (error) {
        console.error("Auto dial assignment poll failed:", error);
      } finally {
        autoDialPollingRef.current = false;
      }
    };

    void pollAutoDialAssignments();
    // The API throttles agent-poll assignment work to 10 seconds. Polling the
    // same endpoint every 2 seconds only creates overlapping database/Asterisk
    // work across all logged-in agents and can make the panel appear frozen.
    // Five seconds keeps assignment pickup responsive while avoiding the
    // request storm; the in-flight guard still prevents overlap.
    const interval = window.setInterval(() => {
      void pollAutoDialAssignments();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [autoDialEnabled, callPhase, callWrapUpPending, canReceiveAutoDialAssignments, currentUserId, currentUserRole, getReconnectSuppressedCustomer, getVisiblePhoneLabel, hasLocalActiveCall, isAuthenticated, notifyReconnectSuppressed, sipRegistered, startOutboundCall]);

  const answerIncoming = async () => {
    const inboundSession = sessionRef.current;
    if (!inboundSession || incomingAnswerInFlightRef.current) return false;
    // Unlock the remote audio element from the explicit Answer gesture.
    primeRemoteAudioPlayback();
    const inboundCallId = incomingDialogCallIdRef.current || buildManagedCallId();
    const SIP = await getSIP();
    const isInboundSessionNoLongerAnswerable = () => (
      sessionRef.current !== inboundSession
      || inboundSession.state === SIP.SessionState.Terminating
      || inboundSession.state === SIP.SessionState.Terminated
    );
    const closeUnavailableIncomingDialog = () => {
      stopIncomingAlert();
      invalidateMicrophonePreparationAttempt();
      if (sessionRef.current === inboundSession) {
        sessionRef.current = null;
      }
      setIncomingDialogOpen(false);
      setIncomingDraftPhone("");
      clearIncomingDialogSession();
      setCallWrapUpPending(false);
      callWrapUpPendingRef.current = false;
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      toast.info("Incoming call was no longer available.");
    };
    if (isInboundSessionNoLongerAnswerable()) {
      closeUnavailableIncomingDialog();
      return false;
    }
    const isTransferAnswer = shouldBypassLanguageFilterForTransfer(
      incomingTransferContextRef.current,
      user?.extension,
    );
    if (user?.role === "agent" && !canReceiveIncomingCalls && !isTransferAnswer) {
      stopIncomingAlert();
      toast.error(
        user.status === "inactive"
          ? "Your account is inactive"
          : effectiveAgentStatus === "follow-up"
            ? "Set your status to Incoming before answering incoming calls"
            : "End break before answering calls",
      );
      try {
        inboundSession.reject?.();
      } catch (error) {
        console.error("Failed to reject incoming call while unavailable:", error);
      }
      if (sessionRef.current === inboundSession) {
        sessionRef.current = null;
      }
      setIncomingDialogOpen(false);
      setIncomingDraftPhone("");
      clearIncomingDialogSession();
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      return false;
    }
    incomingAnswerInFlightRef.current = true;
    manualCallEndRef.current = false;
    const microphonePreparationAttempt = beginMicrophonePreparationAttempt();

    try {
      resetMuteState();
      let inboundLocalAudioStream: MediaStream;
      try {
        inboundLocalAudioStream = await prepareSessionLocalAudio(false);
      } catch (error) {
        if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || sessionRef.current !== inboundSession) {
          return false;
        }
        toast.error(getMicrophonePreparationErrorMessage(
          error,
          "Microphone permission denied. Allow microphone access in the browser and try again.",
        ));
        return false;
      }
      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || sessionRef.current !== inboundSession) {
        inboundLocalAudioStream.getTracks().forEach((track) => track.stop());
        return false;
      }
      if (isInboundSessionNoLongerAnswerable()) {
        inboundLocalAudioStream.getTracks().forEach((track) => track.stop());
        closeUnavailableIncomingDialog();
        return false;
      }
      if (!inboundSession.accept) {
        toast.error("Incoming call session is not ready to answer");
        stopFallbackLocalAudio();
        return false;
      }
      if (isInboundSessionNoLongerAnswerable()) {
        inboundLocalAudioStream.getTracks().forEach((track) => track.stop());
        closeUnavailableIncomingDialog();
        return false;
      }
      await inboundSession.accept({
        sessionDescriptionHandlerOptions: {
          constraints: buildAudioOnlyConstraints(getPreferredAudioInputDeviceId()),
          localMediaStream: inboundLocalAudioStream,
        },
      });
      if (sessionRef.current !== inboundSession || inboundSession.state === SIP.SessionState.Terminated) {
        stopFallbackLocalAudio();
        return false;
      }
      activeCallIdRef.current = inboundCallId;
      if (user?.role === "agent" && user.id) {
        const preservedAgentStatus = (
          effectiveAgentStatus === "outbound-auto" || effectiveAgentStatus === "follow-up" || effectiveAgentStatus === "manual-outgoing"
        ) ? effectiveAgentStatus : "active";
        void api.claimAgentCallSlot(user.id, {
          callId: inboundCallId,
          direction: "incoming",
          fallbackAgentStatus: preservedAgentStatus,
        }).then((result) => {
          if (result?.error) {
            console.warn("Incoming call was answered before backend slot claim completed:", result.error);
          }
        }).catch((error) => {
          console.warn("Incoming call backend slot claim failed after SIP answer:", error);
        });
      }
      stopIncomingAlert();
      const answeredAt = new Date().toISOString();
      const ringStartedAt = incomingRingStartedAtRef.current || answeredAt;
      callRingStartedAtRef.current = ringStartedAt;
      callAnsweredAtRef.current = answeredAt;
      callWrapUpPendingRef.current = true;
      setCallWrapUpPending(true);
      setCallPhase("connected");
      callPhaseRef.current = "connected";
      const answeredTimestamp = new Date(answeredAt).getTime();
      callStartedAtRef.current = answeredTimestamp;
      setElapsedSeconds(0);
      setCallStartedAt(answeredTimestamp);
      attachAudioWithRetry();
      // The accepted inbound answer already carries the prepared local stream.
      startLocalAudioHealthMonitor();
      scheduleConnectedMediaVerification(inboundSession);

      if (user) {
        const caller = resolveIncomingCallerPhones(inboundSession)[0] || normalizePhoneNumber(incomingDraftPhone);
        const ivrMetadata = caller ? await getCallIvrMetadata(caller) : {};
        const attribution = readIncomingCallAttribution(inboundSession.request);
        const newCall = buildIncomingCallRecord({
          id: inboundCallId,
          callerId: caller,
          customerName: "",
          agentId: user.id,
          agentName: user.name,
          time: getCurrentTime(),
          date: getCurrentDate(),
          place: "",
          mob2: "",
          district: "",
          language: String(ivrMetadata.language || "").trim(),
          branch: "",
          purpose: String(ivrMetadata.purpose || "").trim() || "Inbound Enquiry",
          businessType: String(ivrMetadata.businessType || "").trim(),
          metalType: "",
          grams: "",
          releasingAmount: "",
          bankName: "",
          onlinePrice: "",
          pricePerGram: "",
          advertisement: "",
          lead: attribution.callSource,
          leadSource: attribution.callSource,
          carrierTrunk: attribution.carrierTrunk,
          trunkCode: attribution.trunkCode,
          pilot: attribution.pilot,
          didOrCli: attribution.didOrCli,
          formStatus: "",
          notes: "",
          ringStartedAt,
          answeredAt,
          talkDurationSeconds: 0,
        });
        activeCallIdRef.current = newCall.id;
        newCall.pbxSipCallId = getFirstSipHeaderValue(inboundSession.request, SIP_CALL_ID_HEADERS);
        setCalls((prev) => [newCall, ...prev]);
        void api.saveCall(newCall);
        void fetchCallIvrMetadata(caller, newCall.id);
        void (async () => {
          const profile = await api.getCustomerProfile(caller).catch(() => null);
          if (!profile) return;

          const resolvedCustomerName = getMeaningfulCustomerName(profile.customerName);
          updateCallById(newCall.id, (call) => ({
            ...call,
            callerName: resolvedCustomerName || call.callerName,
            customerName: resolvedCustomerName || call.customerName,
            displayCustomerName: resolvedCustomerName || call.displayCustomerName,
            place: profile.location || call.place || "",
            mob2: profile.mob2 || call.mob2 || "",
            district: profile.district || call.district || "",
            language: profile.language || call.language || "",
            branch: profile.branch || call.branch || "",
            purpose: profile.purpose || call.purpose || "Inbound Enquiry",
            businessType: profile.businessType || call.businessType || "",
            metalType: profile.metalType || call.metalType || "",
            grams: profile.grams || call.grams || "",
            releasingAmount: profile.releasingAmount || call.releasingAmount || "",
            bankName: profile.bankName || call.bankName || "",
            onlinePrice: profile.onlinePrice || call.onlinePrice || "",
            pricePerGram: profile.pricePerGram || call.pricePerGram || "",
            advertisement: profile.advertisement || call.advertisement || "",
            lead: profile.lead || call.lead || "",
            formStatus: profile.formStatus || call.formStatus || "",
            notes: profile.notes || call.notes || "",
          }));
          void api.saveCall({
            id: newCall.id,
            callerId: caller,
            callerName: resolvedCustomerName,
            customerName: resolvedCustomerName,
            place: profile.location || "",
            mob2: profile.mob2 || "",
            district: profile.district || "",
            language: profile.language || "",
            branch: profile.branch || "",
            purpose: profile.purpose || "Inbound Enquiry",
            businessType: profile.businessType || "",
            metalType: profile.metalType || "",
            grams: profile.grams || "",
            releasingAmount: profile.releasingAmount || "",
            bankName: profile.bankName || "",
            onlinePrice: profile.onlinePrice || "",
            pricePerGram: profile.pricePerGram || "",
            advertisement: profile.advertisement || "",
            lead: profile.lead || "",
            formStatus: profile.formStatus || "",
            notes: profile.notes || "",
          });
        })();
      }
      toast.success("Call answered");
      return true;
    } catch (e) {
      const sessionStillCurrent = sessionRef.current === inboundSession;
      stopIncomingAlert();
      stopLocalAudioHealthMonitor();
      stopFallbackLocalAudio();
      resetRemoteAudio();
      resetMuteState();
      setIsOnHold(false);
      resetLiveCallTiming();
      setCallWrapUpPending(false);
      if (sessionStillCurrent) {
        sessionRef.current = null;
        setIncomingDialogOpen(false);
        setIncomingDraftPhone("");
        clearIncomingDialogSession();
        setCallPhase("idle");
        callPhaseRef.current = "idle";
      }
      console.error("Answer failed:", e);
      if (!isCurrentMicrophonePreparationAttempt(microphonePreparationAttempt) || !sessionStillCurrent) {
        return false;
      }
      void releaseAgentCallSlotQuietly(inboundCallId, "active", false);
      toast.error(getUserFacingRuntimeErrorMessage(
        e,
        "Unable to answer the incoming call. Check the live call state and try again.",
      ));
      return false;
    } finally {
      incomingAnswerInFlightRef.current = false;
    }
  };

  answerIncomingRef.current = answerIncoming;

  const endCall = useCallback(async () => {
    if (callPhase === "idle") return;

    clearIncomingAutoAnswerTimer();
    stopIncomingAlert();
    invalidateMicrophonePreparationAttempt();
    const currentCallPhone = getCurrentCallPhone();
    const currentSession = sessionRef.current;
    const currentAutoDialLead = activeAutoDialLeadRef.current;
    const connectedCallId = activeCallIdRef.current;
    const outboundDialCallId = pendingOutboundCallIdRef.current;
    const inboundDialCallId = incomingDialogCallIdRef.current;

    if (callPhase === "dialing") {
      if (incomingDialogOpen) {
        manualCallEndRef.current = true;
      } else {
        manualOutboundCancelRef.current = true;
      }
      rememberRecentlyEndedCustomer(currentCallPhone);
    }
    if (callPhase === "connected") {
      manualCallEndRef.current = true;
      callWrapUpPendingRef.current = true;
      setCallWrapUpPending(true);
      rememberRecentlyEndedCustomer(currentCallPhone);
    }

    // End real SIP call
    if (currentSession) {
      const terminationIntent = getSessionTerminationIntent(callPhase, {
        incomingDialog: incomingDialogOpen,
        liveMonitor: Boolean(liveMonitorSessionRef.current),
      });
      skipSessionTerminationSideEffectsRef.current = currentSession;

      if (callPhase === "connected") {
        if (currentAutoDialLead?.id) {
          void api.updateAutoDialLead(currentAutoDialLead.id, {
            status: "completed",
            callId: connectedCallId || undefined,
          });
          resetAutoDialLead();
        }

        finalizeActiveCall("completed");
      } else {
        if (!incomingDialogOpen && outboundDialCallId) {
          void releaseAgentCallSlotQuietly(outboundDialCallId, "active", false, { forceHangup: true });
        }
        if (currentAutoDialLead?.id) {
          void api.updateAutoDialLead(currentAutoDialLead.id, {
            status: "failed",
            callId: outboundDialCallId || undefined,
            lastError: "Dial cancelled by agent",
          });
          resetAutoDialLead();
        }
      }

      stopLocalAudioHealthMonitor();
      stopFallbackLocalAudio();
      resetRemoteAudio();
      stopLocalRingback();

      try {
        const terminated = await terminateSipSession(currentSession, terminationIntent);
        if (!terminated) {
          console.warn("Timed out waiting for the SIP session to terminate after endCall()");
        }
      } catch (error) {
        console.error("Call termination failed:", error);
      }

      sessionRef.current = null;
      const keepConnectedIncomingIntakeOpen = callPhase === "connected" && incomingDialogOpen;
      if (!keepConnectedIncomingIntakeOpen) {
        clearIncomingDialogSession();
        setIncomingDialogOpen(false);
        setIncomingDraftPhone("");
      }
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      resetMuteState();
      setIsOnHold(false);
      resetLiveCallTiming();
      manualCallEndRef.current = false;

      if (callPhase === "connected") {
        toast.success("Call ended and saved");
      } else if (incomingDialogOpen) {
        toast.info("Incoming call rejected");
      } else {
        toast.info("Dial cancelled");
      }
      return;
    }

    if (callPhase === "dialing") {
      stopLocalRingback();
      outboundDialStartInFlightRef.current = false;
      if (!incomingDialogOpen && outboundDialCallId) {
        void releaseAgentCallSlotQuietly(outboundDialCallId, "active", false, { forceHangup: true });
      }
      if (currentAutoDialLead?.id) {
        void api.updateAutoDialLead(currentAutoDialLead.id, {
          status: "failed",
          callId: outboundDialCallId || undefined,
          lastError: "Dial cancelled by agent",
        });
        resetAutoDialLead();
      }
      clearIncomingDialogSession();
      setIncomingDialogOpen(false);
      setIncomingDraftPhone("");
      setCallPhase("idle");
      callPhaseRef.current = "idle";
      resetMuteState();
      setIsOnHold(false);
      resetLiveCallTiming();
      toast.info(incomingDialogOpen || inboundDialCallId ? "Incoming call rejected" : "Dial cancelled");
      return;
    }

    finalizeActiveCall("completed");
    resetRemoteAudio();
    stopLocalRingback();
    sessionRef.current = null;
    setCallPhase("idle");
    callPhaseRef.current = "idle";
    resetMuteState();
    setIsOnHold(false);
    resetLiveCallTiming();
    manualCallEndRef.current = false;
    // Form stays open: setIncomingDialogOpen(false);
    toast.success("Call ended and saved");
  }, [callPhase, clearIncomingDialogSession, finalizeActiveCall, getCurrentCallPhone, getSessionTerminationIntent, incomingDialogOpen, invalidateMicrophonePreparationAttempt, releaseAgentCallSlotQuietly, rememberRecentlyEndedCustomer, resetAutoDialLead, resetLiveCallTiming, resetMuteState, resetRemoteAudio, stopFallbackLocalAudio, stopIncomingAlert, stopLocalAudioHealthMonitor, stopLocalRingback, terminateSipSession]);

  useEffect(() => {
    const previousEnabled = previousAutoDialEnabledRef.current;
    previousAutoDialEnabledRef.current = autoDialEnabled;

    if (currentUserRole !== "agent" || autoDialEnabled !== false || previousEnabled === false) return;

    const hasActiveAutoDialCall = Boolean(
      activeAutoDialLeadRef.current && (callPhase === "dialing" || callPhase === "connected"),
    );
    const hasPendingAutoDialWork = Boolean(autoDialAlertLeadRef.current || currentAutoDialLead);

    if (hasPendingAutoDialWork && !hasActiveAutoDialCall) {
      resetAutoDialLead();
    }

    if (hasActiveAutoDialCall) {
      toast.info("Auto call queue disabled by admin. Current live call will continue.");
      return;
    }

    if (hasPendingAutoDialWork) {
      toast.info("Auto call queue disabled by admin");
    }
  }, [autoDialEnabled, callPhase, currentAutoDialLead, currentUserRole, resetAutoDialLead]);

  const toggleHold = () => {
    if (callPhase !== "connected") return;
    if (liveMonitorSessionRef.current) {
      toast.info("Hold is not available during live listening or barging");
      return;
    }

    if (holdToggleInFlightRef.current) return;
    holdToggleInFlightRef.current = true;

    void (async () => {
      const activeSession = sessionRef.current;
      const next = !isOnHoldRef.current;

      try {
        const SIP = await getSIP();
        if (!activeSession || activeSession !== sessionRef.current || callPhaseRef.current !== "connected") {
          throw new Error("Active call is no longer available");
        }
        if (activeSession.state !== SIP.SessionState.Established) {
          throw new Error("Wait for the call to connect before using hold");
        }

        if (next) {
          stopLocalAudioHealthMonitor();
          holdModeRef.current = null;
          try {
            await activeSession.invite({
              sessionDescriptionHandlerOptions: {
                hold: true,
              },
            });
            holdModeRef.current = "sip";
          } catch (inviteError) {
            console.warn("SIP hold failed, falling back to local hold music:", inviteError);
            if (activeSession !== sessionRef.current || callPhaseRef.current !== "connected") {
              throw new Error("Call ended before hold could start");
            }
            const holdMusicStream = await ensureHoldMusicStream();
            if (activeSession !== sessionRef.current || callPhaseRef.current !== "connected") {
              throw new Error("Call ended before hold could start");
            }
            await replaceSessionAudioStream(activeSession, holdMusicStream);
            holdModeRef.current = "stream";
          }
          applyRemoteAudioPlaybackState(true);
        } else {
          if (activeSession !== sessionRef.current || callPhaseRef.current !== "connected") {
            throw new Error("Call ended before it could resume");
          }
          if (holdModeRef.current === "sip") {
            await activeSession.invite({
              sessionDescriptionHandlerOptions: {
                hold: false,
              },
            });
          }
          await ensureSessionMicrophone(activeSession, { forceRefresh: true, allowWhileOnHold: true });
          stopHoldMusicPlayback();
          applyRemoteAudioPlaybackState(false);
          startLocalAudioHealthMonitor();
          holdModeRef.current = null;
        }

        setIsOnHold(next);
        const activeCallId = activeCallIdRef.current;
        if (activeCallId) {
          updateCallById(activeCallId, (call) => ({ ...call, status: next ? "on-hold" : "active" }));
        }
        toast.info(next ? "Call placed on hold" : "Call resumed");
      } catch (error) {
        if (next) {
          stopHoldMusicPlayback();
          holdModeRef.current = null;
          applyRemoteAudioPlaybackState(false);
          startLocalAudioHealthMonitor();
        }
        console.error("Hold toggle failed:", error);
        toast.error(error instanceof Error ? error.message : "Unable to change the hold state");
      } finally {
        holdToggleInFlightRef.current = false;
      }
    })();
  };

  const toggleMute = () => {
    if (callPhase !== "connected") return;
    if (isOnHoldRef.current) {
      toast.info("Mute is not available while hold music is playing");
      return;
    }
    const next = !isMuted;
    // Real SIP mute
    try {
      fallbackLocalAudioStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      const pc = getSessionPeerConnection(sessionRef.current);
      pc?.getSenders().forEach((sender) => { if (sender.track?.kind === "audio") sender.track.enabled = !next; });
    } catch (error) {
      console.error("Mute toggle failed:", error);
    }
    isMutedRef.current = next;
    setIsMuted(next);
    toast.info(next ? "Mute enabled" : "Mute disabled");
  };

  const transferCurrentCall = useCallback(async (
    targetExtension: string,
    targetAgentName?: string,
    ivrSelection?: IvrSelectionOverride,
  ) => {
    const activeSession = sessionRef.current;
    if (!activeSession || callPhaseRef.current !== "connected") {
      toast.error("Transfer is available only during a live call");
      return false;
    }
    if (liveMonitorSessionRef.current) {
      toast.error("Transfer is not available during live listening or barging");
      return false;
    }

    const trimmedExtension = targetExtension.trim();
    if (!trimmedExtension) {
      toast.error("Select an agent extension to transfer");
      return false;
    }

    try {
	      if (trimmedExtension === user?.extension?.trim()) {
	        toast.error("Choose a different agent extension for transfer");
	        return false;
	      }
	      if (user?.role === "agent") {
	        const liveAgents = await api.getLiveAgents().catch(() => []);
	        const targetAgent = Array.isArray(liveAgents)
	          ? liveAgents.find((agent) => String(agent.extension || "").trim() === trimmedExtension)
	          : null;
	        const sourceTransferMode = effectiveAgentStatusRef.current;
	        if (
	          !targetAgent
	          || !canReceiveTransferredCalls({
	            status: targetAgent.workMode || targetAgent.status,
	            sourceStatus: sourceTransferMode,
	            activeCalls: targetAgent.activeCalls,
	          })
	        ) {
	          toast.error(`Transfer is allowed only to available ${getAgentStatusLabel(sourceTransferMode)} agents`);
	          return false;
	        }
	      }
	      const SIP = await getSIP();
      if (activeSession !== sessionRef.current || activeSession.state !== SIP.SessionState.Established) {
        toast.error("Wait for the call to connect before transferring");
        return false;
      }

      const activeCall = activeCallIdRef.current
        ? callsRef.current.find((call) => call.id === activeCallIdRef.current)
        : null;
      const activePhone = normalizePhoneNumber(
        ivrSelection?.phone
          || activeCall?.callerId
          || dialedNumberRef.current
          || incomingDraftPhoneRef.current,
      );
      const selectedLanguage = String(ivrSelection?.language || "").trim() || activeCall?.language || "";
      const selectedBusinessType = String(ivrSelection?.businessType || "").trim() || activeCall?.businessType || "";
      const selectedPurpose = String(ivrSelection?.purpose || "").trim() || activeCall?.purpose || "";
      if (activePhone) {
        await api.saveTransferContext({
          phone: activePhone,
          requestedById: user?.id,
          sourceExtension: user?.extension,
          sourceCallId: activeCall?.id || undefined,
          intakeToken: activeCall?.intakeToken || undefined,
          targetExtension: trimmedExtension,
          customerName: getMeaningfulCustomerName(
            activeCall?.displayCustomerName,
            activeCall?.customerName,
            activeCall?.callerName,
          ),
          mob2: activeCall?.mob2 || "",
          district: activeCall?.district || "",
          location: activeCall?.place || "",
          branch: activeCall?.branch || "",
          language: selectedLanguage,
          businessType: selectedBusinessType,
          metalType: activeCall?.metalType || "",
          grams: activeCall?.grams || "",
          releasingAmount: activeCall?.releasingAmount || "",
          bankName: activeCall?.bankName || "",
          onlinePrice: activeCall?.onlinePrice || "",
          pricePerGram: activeCall?.pricePerGram || "",
          advertisement: activeCall?.advertisement || "",
          lead: activeCall?.lead || "",
          formStatus: activeCall?.formStatus || "",
          purpose: selectedPurpose,
          notes: activeCall?.notes || "",
          disposition: activeCall?.callbackStatus || "",
        }).catch((error) => {
          console.error("Failed to save transfer call context:", error);
        });

        await syncCallIvrSelection({
          phone: activePhone,
          language: selectedLanguage,
          businessType: selectedBusinessType,
          purpose: selectedPurpose,
          source: "transfer",
        }).catch((error) => {
          console.error("Failed to sync IVR selection before transfer:", error);
        });
      }

      nextFinalizeStatusRef.current = "transferred";
      const transferResult = await api.transferCall({
        requestedById: user?.id,
        sourceExtension: user?.extension,
        targetExtension: trimmedExtension,
        phone: activePhone || undefined,
        sourceCallId: activeCall?.id || undefined,
      });
      if (!transferResult.success) {
        throw new Error(transferResult.error || "Transfer failed");
      }

      toast.success(`Transfer sent to ${targetAgentName || trimmedExtension}`);
      return true;
    } catch (error) {
      nextFinalizeStatusRef.current = null;
      const activeCall = activeCallIdRef.current
        ? callsRef.current.find((call) => call.id === activeCallIdRef.current)
        : null;
      const activePhone = normalizePhoneNumber(
        ivrSelection?.phone
          || activeCall?.callerId
          || dialedNumberRef.current
          || incomingDraftPhoneRef.current,
      );
      if (activePhone || activeCall?.id) {
        void api.clearTransferContext({
          phone: activePhone || undefined,
          sourceCallId: activeCall?.id || undefined,
        });
      }
      console.error("Transfer failed:", error);
      toast.error(error instanceof Error ? error.message : "Transfer failed");
      return false;
    }
	  }, [getSIP, syncCallIvrSelection, user?.extension, user?.id, user?.role]);

  const startConferenceCall = useCallback(async (targetPhone: string) => {
    const normalizedTargetPhone = normalizePhoneNumber(targetPhone);
    if (!user?.id || user.role !== "agent") {
      toast.error("Conference call is available only for agents");
      return false;
    }
    if (!normalizedTargetPhone || normalizedTargetPhone.length !== 10) {
      toast.error("Enter a valid 10-digit number for conference call");
      return false;
    }
    if (!sessionRef.current || callPhaseRef.current !== "connected") {
      toast.error("Conference call is available only during a live call");
      return false;
    }
    if (liveMonitorSessionRef.current) {
      toast.error("Conference call is not available during live listening or barging");
      return false;
    }

    try {
      const result = await api.startConferenceCall({
        requestedById: user.id,
        targetPhone: normalizedTargetPhone,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to start conference call");
      }

      toast.success(`Conference call started to ${normalizedTargetPhone}`);
      return true;
    } catch (error) {
      console.error("Conference call failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start conference call");
      return false;
    }
  }, [user?.id, user?.role]);

  const saveIncomingLead = (payload: IncomingLeadPayload) => {
    if (!user) return;
    const resolvedCustomerName = getMeaningfulCustomerName(payload.customerName);
    const newCall: ManagedCall = {
      id: buildManagedCallId(), callerId: normalizePhoneNumber(payload.phone),
      callerName: resolvedCustomerName,
      customerName: resolvedCustomerName,
      displayCustomerName: resolvedCustomerName,
      agentId: user.id, agentName: user.name, direction: "incoming",
      status: "answered", duration: "00:00", time: getCurrentTime(),
      date: payload.date || getCurrentDate(), language: payload.language || "", hasRecording: false,
      branch: payload.branch, place: payload.place, purpose: payload.purpose,
      callbackStatus: payload.disposition || "Scheduled", followUpFlag: false,
    };
    setCalls((prev) => [newCall, ...prev]);
    // Form stays open: setIncomingDialogOpen(false);
    setCallWrapUpPending(false);
    setIncomingDraftPhone("");
    toast.success("Incoming customer form saved to call log");
    void api.saveCall(newCall);
  };

  const skipIncomingLead = () => {
    stopIncomingAlert();
    setIncomingDialogOpen(false);
    setIncomingDraftPhone("");
    clearIncomingDialogSession();
  };

  const addFollowUp = useCallback(({ customerName, phone, branch, followUpAt, notes, callId, sourceCallId, sourceStatus }: NewFollowUpPayload) => {
    if (!user) return;
    const newItem: FollowUpRecord = {
      id: `FU-${Date.now()}`,
      customerName,
      phone,
      branch,
      followUpAt,
      status: "Pending",
      agentId: user.id,
      agentName: user.name,
      notes,
      outcome: "",
      updatedAt: new Date().toISOString(),
      sourceCallId: sourceCallId || callId,
      sourceStatus,
    };
    setFollowUps((prev) => [newItem, ...prev]);
    if (callId) setCalls((prev) => prev.map((call) => (call.id === callId ? { ...call, followUpFlag: true } : call)));
    toast.success("Follow-up scheduled");
    void api.saveFollowUp(newItem);
  }, [user]);

  const closePendingFollowUpsForPhone = useCallback(({ phone, outcome, throughDate }: ClosePendingFollowUpsPayload) => {
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) return;

    const matchingIds = followUps
      .filter((item) => (
        isOpenFollowUpStatus(item.status) &&
        normalizePhoneNumber(item.phone) === normalizedPhone &&
        (!throughDate || (getLocalDateKey(item.followUpAt) && getLocalDateKey(item.followUpAt) <= throughDate))
      ))
      .map((item) => item.id);

    if (matchingIds.length === 0) return;

    const updatedAt = new Date().toISOString();
    setFollowUps((prev) => prev.map((item) => (
      matchingIds.includes(item.id)
        ? {
            ...item,
            status: "Called",
            outcome: outcome ?? item.outcome,
            updatedAt,
          }
        : item
    )));

    if (reminderFollowUp && matchingIds.includes(reminderFollowUp.id)) {
      setReminderFollowUp(null);
    }
    if (reminderShownRef.current && matchingIds.includes(reminderShownRef.current)) {
      reminderShownRef.current = null;
    }

    toast.success(`Closed ${matchingIds.length} pending follow-up${matchingIds.length === 1 ? "" : "s"} for ${getVisiblePhoneLabel(normalizedPhone)}`);
    matchingIds.forEach((id) => {
      void api.updateFollowUpStatus(id, { status: "Called", outcome });
    });
  }, [followUps, getVisiblePhoneLabel, reminderFollowUp]);

  const markFollowUpStatus = (id: string, payload: FollowUpStatusUpdatePayload) => {
    const updatedAt = new Date().toISOString();
    setFollowUps((prev) => prev.map((item) => (
      item.id === id
        ? {
            ...item,
            status: payload.status,
            outcome: payload.outcome ?? item.outcome,
            followUpAt: payload.followUpAt ?? item.followUpAt,
            updatedAt,
          }
        : item
    )));
    if (reminderFollowUp?.id === id) {
      setReminderFollowUp(null);
    }
    if (reminderShownRef.current === id) {
      reminderShownRef.current = null;
    }
    dismissedReminderKeysRef.current = new Set(
      Array.from(dismissedReminderKeysRef.current).filter((key) => !key.startsWith(`${id}|`)),
    );
    toast.success(`Follow-up marked as ${payload.status}`);
    void api.updateFollowUpStatus(id, payload);
  };

  const closeReminder = useCallback(() => {
    if (user?.role === "agent" && user.id) {
      followUps
        .filter((item) => item.agentId === user.id && isDueFollowUp(item))
        .forEach((item) => {
          dismissedReminderKeysRef.current.add(getFollowUpDismissKey(item));
        });
    }
    setReminderFollowUp(null);
  }, [followUps, user?.id, user?.role]);
  const addBranch = (name: string, city: string) => { setBranches((prev) => [...prev, { id: `BR-${Date.now()}`, name, city }]); toast.success("Branch added"); };
  const updateBranch = (id: string, name: string, city: string) => { setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, name, city } : b))); toast.success("Branch updated"); };
  const syncCallRecord = useCallback((call: Partial<ManagedCall>) => {
    if (!call.id) return;
    setCalls((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === call.id);
      if (existingIndex === -1) {
        return [call as ManagedCall, ...prev];
      }
      return prev.map((item) => (
        item.id === call.id
          ? {
              ...item,
              ...call,
              duration: getLongerCallDuration(item.duration, call.duration),
              talkDurationSeconds: Math.max(Number(item.talkDurationSeconds) || 0, Number(call.talkDurationSeconds) || 0),
              ringStartedAt: item.ringStartedAt || call.ringStartedAt || "",
              answeredAt: item.answeredAt || call.answeredAt || "",
              endedAt: call.endedAt || item.endedAt || "",
            } as ManagedCall
          : item
      ));
    });
  }, []);

  const autoDialAlertAutoConnectActive = Boolean(
    currentUserRole === "agent"
    && autoDialEnabled === true
    && freshLeadAutoConnectEnabled
    && sipRegistered
    && autoDialAlertLead
    && callPhase === "idle"
    && !callWrapUpPending
    && (
      (effectiveAgentStatus === "outbound-auto" && isFreshAutoDialLead(autoDialAlertLead))
      || (effectiveAgentStatus === "follow-up" && isFollowUpAutoDialLead(autoDialAlertLead))
    ),
  );

  return (
    <CallCenterContext.Provider value={{
      calls, branches, followUps, rateTicker, hourlyCalls: callsPerHour, heatmap: dailyHeatmap,
      dialedNumber, callPhase, callTimer: formatDuration(elapsedSeconds), isMuted, isOnHold,
      incomingDialogOpen, incomingDraftPhone, incomingDialogCallId, reminderFollowUp, followUpDueCount, callWrapUpPending, currentAutoDialLead, queuedAutoDialLead, autoDialAlertLead, autoDialAlertAutoConnectActive, sipRegistered, sipStatusLabel, sipStatusReason: resolvedSipStatusReason,
      setIncomingDialogOpen, appendDigit, backspaceDialedNumber, clearDialedNumber, setDialedNumber,
      startCall, endCall, toggleHold, toggleMute, prefillDialedNumber, loadAutoDialLeadIntoDialer,
      saveIncomingLead, skipIncomingLead, addFollowUp, closePendingFollowUpsForPhone, markFollowUpStatus,
      closeReminder, addBranch, updateBranch, syncCallRecord, answerIncoming, metalRates, agentStatus: effectiveAgentStatus, agentStatusTimer, setAgentWorkStatus, toggleBreak, breakLogs, activeAgentExts, updateMetalRate, addMetalRate, deleteMetalRate, completeCallWrapUp, acceptAutoDialAlert, rejectAutoDialAlert, snoozeAutoDialAlert, transferCurrentCall, startConferenceCall, getFinalizedCallSnapshot, getLiveCallSnapshot,
    }}>
      {children}
    </CallCenterContext.Provider>
  );
}

export function useCallCenter() {
  const context = useContext(CallCenterContext);
  if (!context) throw new Error("useCallCenter must be used within CallCenterProvider");
  return context;
}

export const topAgentTalkTime = (agentId: string) => {
  const fallback = agents.find((agent) => agent.id === agentId);
  return fallback?.activeDuration ?? "00:00";
};
